"""Tests for accounts API endpoints."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from accounts.tests.helpers import create_user

BASE_URL = "/api/accounts"


# =============================================================================
# GET /api/accounts/me/ - Current User Endpoint
# =============================================================================


@pytest.mark.django_db
def test_current_user_returns_authenticated_user(
    authenticated_client: tuple[APIClient, User],
) -> None:
    """GET /api/accounts/me/ returns the currently authenticated user."""
    client, user = authenticated_client

    response = client.get(f"{BASE_URL}/me/")

    assert response.status_code == 200
    assert response.data["id"] == str(user.id)
    assert response.data["email"] == user.email
    assert response.data["first_name"] == user.first_name
    assert response.data["last_name"] == user.last_name


@pytest.mark.django_db
def test_current_user_returns_guest_when_unauthenticated(api_client: APIClient) -> None:
    """GET /api/accounts/me/ returns guest user when no token is provided."""
    response = api_client.get(f"{BASE_URL}/me/")

    assert response.status_code == 200
    assert response.data["email"] == "dev@localhost"


@pytest.mark.django_db
def test_current_user_includes_full_name(
    authenticated_client: tuple[APIClient, User],
) -> None:
    """GET /api/accounts/me/ includes computed full_name field."""
    client, user = authenticated_client

    response = client.get(f"{BASE_URL}/me/")

    assert response.status_code == 200
    assert response.data["full_name"] == f"{user.first_name} {user.last_name}"


# =============================================================================
# GET /api/accounts/list - User List Endpoint
# =============================================================================


@pytest.mark.django_db
def test_user_list_returns_all_users(
    authenticated_client: tuple[APIClient, User],
) -> None:
    """GET /api/accounts/list returns list of all users."""
    client, user = authenticated_client
    user2 = create_user(email="user2@example.com", first_name="Second")

    response = client.get(f"{BASE_URL}/list")

    assert response.status_code == 200
    assert len(response.data["results"]) == 2
    emails = {u["email"] for u in response.data["results"]}
    assert user.email in emails
    assert user2.email in emails


@pytest.mark.django_db
def test_user_list_returns_data_when_unauthenticated(api_client: APIClient) -> None:
    """GET /api/accounts/list returns data via guest user when no token is provided."""
    response = api_client.get(f"{BASE_URL}/list")

    assert response.status_code == 200


@pytest.mark.django_db
def test_user_list_response_structure(
    authenticated_client: tuple[APIClient, User],
) -> None:
    """GET /api/accounts/list returns proper user fields."""
    client, _ = authenticated_client

    response = client.get(f"{BASE_URL}/list")

    assert response.status_code == 200
    user_data = response.data["results"][0]
    assert "id" in user_data
    assert "email" in user_data
    assert "first_name" in user_data
    assert "last_name" in user_data
    assert "full_name" in user_data
    assert "created_at" in user_data
