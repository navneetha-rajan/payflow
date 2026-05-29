from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.http import HttpResponse


def spa_index(request):
    """Serve the React SPA index.html for client-side routing.

    WhiteNoise handles /static/ assets. This view catches everything else
    that isn't an /api/ or /admin/ route and returns the Vite-built
    index.html so React Router can handle the path.
    """
    # Primary: Vite build output (served via WHITENOISE_ROOT at web root)
    # Frontend is a sibling of the backend dir (both under /home/user/).
    index_file = settings.BASE_DIR.parent / "frontend" / "dist" / "index.html"

    # Fallback: collectstatic output (if frontend was collected to STATIC_ROOT)
    if not index_file.exists():
        index_file = Path(settings.STATIC_ROOT) / "index.html"

    if index_file.exists():
        return HttpResponse(index_file.read_text(), content_type="text/html")

    return HttpResponse("App not built yet. Run the build step first.", status=404)
