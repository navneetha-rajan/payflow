from __future__ import annotations

from django.urls import path

from accounts.views import CurrentUserView, LogoutView, UserListView
from accounts.views_auth_token import AuthTokenView, TokenRefreshView
from accounts.views_billing import EntitlementsView, JWKSView

urlpatterns = [
    path("me/", CurrentUserView.as_view(), name="current-user"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("list", UserListView.as_view(), name="user-list"),
    path("auth/token", AuthTokenView.as_view(), name="auth-token"),
    path("auth/refresh", TokenRefreshView.as_view(), name="auth-refresh"),
    path("billing/entitlements/", EntitlementsView.as_view(), name="billing-entitlements"),
    path("billing/jwks.json", JWKSView.as_view(), name="billing-jwks"),
]
