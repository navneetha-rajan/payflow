import os

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication, CSRFCheck
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


class JWTCookieAuthentication(JWTAuthentication):
    """
    Authenticates requests via a SimpleJWT access token stored in an
    HttpOnly cookie.  Falls back to the standard Authorization header
    when no cookie is present.

    When the token comes from a cookie, CSRF validation is enforced on
    unsafe HTTP methods (POST, PUT, PATCH, DELETE) to prevent cross-site
    request forgery.
    """

    def authenticate(self, request):
        raw_token = request.COOKIES.get(settings.ACCESS_TOKEN_COOKIE)

        if raw_token is not None:
            try:
                validated_token = self.get_validated_token(raw_token.encode())
            except (InvalidToken, TokenError):
                # Cookie present but invalid — return None so DRF continues
                # to the next auth class (or returns 401 if none succeed).
                return None

            self.enforce_csrf(request)
            return self.get_user(validated_token), validated_token

        # No cookie — fall back to Authorization header
        return super().authenticate(request)

    def enforce_csrf(self, request):
        """Enforce CSRF validation for cookie-based authentication.

        Only rejects unsafe methods (POST, PUT, PATCH, DELETE).
        GET/HEAD/OPTIONS are safe and do not require CSRF tokens.
        """

        def dummy_get_response(request):
            return None

        check = CSRFCheck(dummy_get_response)
        check.process_request(request)
        reason = check.process_view(request, None, (), {})
        if reason:
            raise exceptions.PermissionDenied(f"CSRF Failed: {reason}")


class DevAutoAuthentication(BaseAuthentication):
    """
    Fallback authentication that auto-authenticates requests when no
    credentials are provided.

    Listed AFTER JWTCookieAuthentication in DEFAULT_AUTHENTICATION_CLASSES
    so it only activates when no JWT is present (neither in cookie nor header).

    When the auth connector is enabled (VECTOR_AUTH_PROXY_URL is set),
    this class returns None so unauthenticated requests get a proper 401
    instead of being silently auto-authenticated.

    Without the auth connector, this provides a shared guest user so the
    app remains functional after deployment (no 401 errors).
    """

    _cached_user = None

    def authenticate(self, request):
        # When auth connector is enabled, do not auto-authenticate
        if os.getenv("VECTOR_AUTH_PROXY_URL"):
            return None

        # Return cached user if available
        if DevAutoAuthentication._cached_user is not None:
            return (DevAutoAuthentication._cached_user, None)

        User = get_user_model()
        email = os.getenv("DEV_USER_EMAIL", "dev@localhost")

        user, _ = User.objects.get_or_create(
            email=email,
            defaults={"is_active": True},
        )

        DevAutoAuthentication._cached_user = user
        return (user, None)
