"""Pytest configuration for the project."""

from __future__ import annotations

import os

import django

# Import fixtures so they're available to all tests
# - shared.tests.helpers: app-agnostic utilities (api_client, etc.)
# - accounts.tests.helpers: user-related fixtures (authenticated_client, etc.)
pytest_plugins = ["shared.tests.helpers", "accounts.tests.helpers"]


def pytest_configure() -> None:
    os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"  # Force override
    django.setup()
