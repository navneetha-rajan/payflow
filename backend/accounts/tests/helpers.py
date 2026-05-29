"""Account-specific test helpers and fixtures."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User


def create_user(
    email: str = "test@example.com",
    password: str = "testpass123",
    first_name: str = "Test",
    last_name: str = "User",
    **kwargs: Any,
) -> User:
    """Create a test user with sensible defaults."""
    return User.objects.create_user(
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
        **kwargs,
    )


@pytest.fixture
def authenticated_client(api_client: APIClient) -> tuple[APIClient, User]:
    """Return an API client authenticated with a test user."""
    user = create_user()
    refresh = RefreshToken.for_user(user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return api_client, user
