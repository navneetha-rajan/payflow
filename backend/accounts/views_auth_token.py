"""
Auth token endpoint for UGA authentication.

Called by the UGA frontend after receiving a JWT from Vector's auth proxy.
Fetches the public key from the JWKS endpoint, verifies the JWT,
syncs user data into the local database, and sets a local SimpleJWT
access token as an HttpOnly cookie for subsequent API calls.

Flow:
1. UGA frontend receives JWT from Vector auth proxy redirect
2. Frontend POSTs JWT to this endpoint
3. This endpoint fetches the RS256 public key from VECTOR_AUTH_PROXY_URL/.well-known/jwks.json
4. Verifies the JWT signature
5. Creates/updates local User from JWT claims
6. Sets SimpleJWT access token as HttpOnly cookie + returns user data
"""

from __future__ import annotations

import base64
import logging
import os

import jwt
import requests as http_requests
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicNumbers
from django.conf import settings as django_settings
from django.contrib.auth import get_user_model
from django.middleware.csrf import get_token
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.serializers import UserSerializer

logger = logging.getLogger(__name__)

User = get_user_model()

# Cache the JWKS response in-process to avoid fetching on every request
_jwks_cache: dict | None = None


def _base64url_decode(s: str) -> bytes:
    """Decode base64url-encoded string (no padding)."""
    s += "=" * (4 - len(s) % 4)
    return base64.urlsafe_b64decode(s)


def _get_jwks() -> dict:
    """Fetch and cache JWKS from Vector's auth proxy."""
    global _jwks_cache
    if _jwks_cache is not None:
        return _jwks_cache

    proxy_url = os.getenv("VECTOR_AUTH_PROXY_URL", "")
    if not proxy_url:
        return {"keys": []}

    jwks_url = f"{proxy_url.rstrip('/')}/.well-known/jwks.json"
    try:
        resp = http_requests.get(jwks_url, timeout=5)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        return _jwks_cache
    except Exception:
        logger.warning("Failed to fetch JWKS from %s", jwks_url, exc_info=True)
        return {"keys": []}


def _get_public_key_from_jwks(kid: str | None = None):
    """Get the RSA public key from the JWKS, optionally matching by kid."""
    jwks = _get_jwks()
    keys = jwks.get("keys", [])
    if not keys:
        return None

    # Find matching key by kid, or use first key
    jwk = None
    for key in keys:
        if kid and key.get("kid") == kid:
            jwk = key
            break
    if jwk is None:
        jwk = keys[0]

    n = int.from_bytes(_base64url_decode(jwk["n"]), byteorder="big")
    e = int.from_bytes(_base64url_decode(jwk["e"]), byteorder="big")
    return RSAPublicNumbers(e, n).public_key(default_backend())


class AuthTokenSerializer(serializers.Serializer):
    token = serializers.CharField()


class AuthTokenView(APIView):
    """POST /api/accounts/auth/token

    Receives a JWT from Vector's auth proxy, fetches the public key from
    the JWKS endpoint, verifies the JWT, syncs the user into the local
    database, and returns a SimpleJWT access token.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request: Request) -> Response:
        serializer = AuthTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        token = serializer.validated_data["token"]

        # Read kid from JWT header to find the right key
        try:
            unverified_header = jwt.get_unverified_header(token)
        except jwt.DecodeError:
            return Response(
                {"detail": "Invalid token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        kid = unverified_header.get("kid")
        public_key = _get_public_key_from_jwks(kid)
        if not public_key:
            return Response(
                {"detail": "Authentication is not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # Verify the JWT from Vector's auth proxy (RS256)
        try:
            payload = jwt.decode(token, public_key, algorithms=["RS256"])
        except jwt.ExpiredSignatureError:
            return Response(
                {"detail": "Token has expired."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        except jwt.InvalidTokenError:
            return Response(
                {"detail": "Invalid token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        email = payload.get("email")
        if not email:
            return Response(
                {"detail": "Token missing email claim."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Extract UGAUser ID from Vector JWT
        vector_uga_user_id = payload.get("user_id", "")

        # Sync user into local database
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "first_name": payload.get("first_name", ""),
                "last_name": payload.get("last_name", ""),
                "picture": payload.get("picture", ""),
                "vector_uga_user_id": vector_uga_user_id,
                "is_active": True,
            },
        )

        if not created:
            updated = False
            for field in ("first_name", "last_name", "picture"):
                new_value = payload.get(field, "")
                if new_value and getattr(user, field) != new_value:
                    setattr(user, field, new_value)
                    updated = True
            if vector_uga_user_id and user.vector_uga_user_id != vector_uga_user_id:
                user.vector_uga_user_id = vector_uga_user_id
                updated = True
            if updated:
                user.save()

        # Issue local SimpleJWT access + refresh tokens as HttpOnly cookies
        refresh = RefreshToken.for_user(user)

        response = Response(
            {"user": UserSerializer(user).data},
            status=status.HTTP_200_OK,
        )

        response.set_cookie(
            key=django_settings.ACCESS_TOKEN_COOKIE,
            value=str(refresh.access_token),
            max_age=django_settings.ACCESS_TOKEN_COOKIE_MAX_AGE,
            httponly=django_settings.ACCESS_TOKEN_COOKIE_HTTPONLY,
            secure=django_settings.ACCESS_TOKEN_COOKIE_SECURE,
            samesite=django_settings.ACCESS_TOKEN_COOKIE_SAMESITE,
            path=django_settings.ACCESS_TOKEN_COOKIE_PATH,
        )
        response.set_cookie(
            key=django_settings.REFRESH_TOKEN_COOKIE,
            value=str(refresh),
            max_age=django_settings.REFRESH_TOKEN_COOKIE_MAX_AGE,
            httponly=django_settings.REFRESH_TOKEN_COOKIE_HTTPONLY,
            secure=django_settings.REFRESH_TOKEN_COOKIE_SECURE,
            samesite=django_settings.REFRESH_TOKEN_COOKIE_SAMESITE,
            path=django_settings.REFRESH_TOKEN_COOKIE_PATH,
        )

        # Store the original UGA JWT so the hosted page forward view can
        # POST it to Vector BE for cookie-based auth on hosted pages.
        response.set_cookie(
            key="uga_jwt",
            value=token,
            max_age=60 * 60 * 24,  # 24h — matches UGA JWT expiry
            httponly=True,
            secure=django_settings.ACCESS_TOKEN_COOKIE_SECURE,
            samesite=django_settings.ACCESS_TOKEN_COOKIE_SAMESITE,
            path="/",
        )

        # Ensure CSRF cookie is set so the frontend can read it
        get_token(request)

        return response


class TokenRefreshView(APIView):
    """POST /api/accounts/auth/refresh

    Reads the refresh_token HttpOnly cookie, rotates it, and sets
    a new access_token + refresh_token cookie pair.

    No request body needed — the refresh token comes from the cookie.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request: Request) -> Response:
        raw_refresh = request.COOKIES.get(django_settings.REFRESH_TOKEN_COOKIE)
        if not raw_refresh:
            return Response(
                {"detail": "No refresh token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            old_refresh = RefreshToken(raw_refresh)
        except (InvalidToken, TokenError):
            # Refresh token expired or invalid — user must re-login
            response = Response(
                {"detail": "Refresh token expired."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            # Clear stale cookies
            response.delete_cookie(
                key=django_settings.ACCESS_TOKEN_COOKIE,
                path=django_settings.ACCESS_TOKEN_COOKIE_PATH,
                samesite=django_settings.ACCESS_TOKEN_COOKIE_SAMESITE,
            )
            response.delete_cookie(
                key=django_settings.REFRESH_TOKEN_COOKIE,
                path=django_settings.REFRESH_TOKEN_COOKIE_PATH,
                samesite=django_settings.REFRESH_TOKEN_COOKIE_SAMESITE,
            )
            return response

        # Issue new token pair from the same user
        user_id = old_refresh.payload.get("user_id")
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response(
                {"detail": "User not found."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        new_refresh = RefreshToken.for_user(user)

        response = Response(status=status.HTTP_204_NO_CONTENT)

        response.set_cookie(
            key=django_settings.ACCESS_TOKEN_COOKIE,
            value=str(new_refresh.access_token),
            max_age=django_settings.ACCESS_TOKEN_COOKIE_MAX_AGE,
            httponly=django_settings.ACCESS_TOKEN_COOKIE_HTTPONLY,
            secure=django_settings.ACCESS_TOKEN_COOKIE_SECURE,
            samesite=django_settings.ACCESS_TOKEN_COOKIE_SAMESITE,
            path=django_settings.ACCESS_TOKEN_COOKIE_PATH,
        )
        response.set_cookie(
            key=django_settings.REFRESH_TOKEN_COOKIE,
            value=str(new_refresh),
            max_age=django_settings.REFRESH_TOKEN_COOKIE_MAX_AGE,
            httponly=django_settings.REFRESH_TOKEN_COOKIE_HTTPONLY,
            secure=django_settings.REFRESH_TOKEN_COOKIE_SECURE,
            samesite=django_settings.REFRESH_TOKEN_COOKIE_SAMESITE,
            path=django_settings.REFRESH_TOKEN_COOKIE_PATH,
        )

        return response
