from __future__ import annotations

import logging
import threading

from django.apps import AppConfig

logger = logging.getLogger(__name__)

_migration_done = False
_migration_lock = threading.Lock()


class InvoicesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "invoices"

    def ready(self) -> None:
        global _migration_done  # noqa: PLW0603
        if _migration_done:
            return

        with _migration_lock:
            if _migration_done:
                return
            _migration_done = True

        # Run migrations in a background thread so it doesn't block startup
        thread = threading.Thread(target=_auto_migrate, daemon=True)
        thread.start()


def _auto_migrate() -> None:
    """Run pending migrations automatically on server start."""
    try:
        from django.core.management import call_command

        call_command("migrate", "--run-syncdb", verbosity=0)
        logger.info("Auto-migration completed successfully")
    except Exception:
        logger.exception("Auto-migration failed")
