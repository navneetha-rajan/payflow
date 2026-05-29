"""Shared test helpers and fixtures.

This module contains only app-agnostic test utilities.
App-specific helpers belong in their respective app's tests/ directory.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient


@pytest.fixture
def api_client() -> APIClient:
    """Return an unauthenticated API client."""
    return APIClient()
