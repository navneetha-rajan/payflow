"""
Entitlements proxy view and JWKS endpoint for UGA billing.

Proxies entitlements requests from the UGA frontend to Vector's API.
Vector returns a signed JWT (``entitlements_token``) that the frontend
caches in localStorage and verifies client-side via JWKS.  The JWKS
endpoint serves Vector's public keys at a same-origin path so the
frontend can verify JWTs without cross-origin requests.

Routes:
  GET /api/accounts/billing/entitlements/
  GET /api/accounts/billing/jwks.json
"""

import logging
import os

import requests as http_requests
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)

VECTOR_API_URL = os.getenv("VECTOR_API_URL", "")
VECTOR_APP_ID = os.getenv("VITE_APP_ID", "")
VECTOR_API_TOKEN = os.getenv("VECTOR_API_TOKEN", "")
VECTOR_ORIGIN = os.getenv("VECTOR_ORIGIN", "")


class EntitlementsView(APIView):
    """GET /api/accounts/billing/entitlements/

    Proxies entitlements check to Vector's API and forwards the signed
    ``entitlements_token`` JWT to the frontend.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        user = request.user

        vector_uga_user_id = getattr(user, "vector_uga_user_id", None)
        if not vector_uga_user_id:
            logger.warning(
                "User %s has no vector_uga_user_id, cannot check entitlements",
                user.id,
            )
            return self._fallback_response()

        if not VECTOR_API_URL or not VECTOR_APP_ID:
            return self._fallback_response()

        try:
            url = f"{VECTOR_API_URL}/api/user-billing/apps/{VECTOR_APP_ID}/entitlements/"
            headers = {
                "X-UGA-Api-Token": VECTOR_API_TOKEN,
                "X-Vector-UGA-User-Id": str(vector_uga_user_id),
            }
            if VECTOR_ORIGIN:
                headers["X-Vector-Origin"] = VECTOR_ORIGIN

            response = http_requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()

            return Response(response.json(), status=status.HTTP_200_OK)

        except http_requests.exceptions.HTTPError as e:
            logger.error("Vector entitlements API error: %s", e)
            return self._fallback_response()
        except http_requests.exceptions.RequestException as e:
            logger.error("Vector entitlements API request failed: %s", e)
            return self._fallback_response()

    def _fallback_response(self) -> Response:
        """Return a fallback when we can't reach Vector.

        Returns ``entitlements_token: null`` so the frontend treats it as
        a cache miss and falls back to default "allowed" behaviour.
        """
        return Response(
            {"entitlements_token": None},
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# JWKS proxy — serves Vector's public keys at a same-origin path so the
# frontend can verify entitlements JWTs without cross-origin requests.
# ---------------------------------------------------------------------------

_jwks_cache: dict | None = None

VECTOR_AUTH_PROXY_URL = os.getenv("VECTOR_AUTH_PROXY_URL", "")


def _get_billing_jwks() -> dict:
    """Fetch and cache JWKS from Vector's auth proxy."""
    global _jwks_cache
    if _jwks_cache is not None:
        return _jwks_cache

    if not VECTOR_AUTH_PROXY_URL:
        return {"keys": []}

    jwks_url = f"{VECTOR_AUTH_PROXY_URL.rstrip('/')}/.well-known/jwks.json"
    try:
        resp = http_requests.get(jwks_url, timeout=5)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        return _jwks_cache
    except Exception:
        logger.warning("Failed to fetch JWKS from %s", jwks_url, exc_info=True)
        return {"keys": []}


class JWKSView(APIView):
    """GET /api/accounts/billing/jwks.json

    Serves the cached JWKS from Vector's auth proxy at a same-origin path.
    This allows the frontend to verify entitlements JWTs without
    cross-origin requests to the auth proxy.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request: Request) -> Response:
        jwks = _get_billing_jwks()
        return Response(jwks, status=status.HTTP_200_OK)
