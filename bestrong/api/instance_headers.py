"""Cache-control and optional fingerprint headers on every /api/ response.

Sets Cache-Control: no-store, private on every /api/ response so no
browser/proxy/CDN caches user-scoped data. If an upstream resolver has
stamped a subdomain on request.state, it is echoed back as a response
header so a frontend can detect cross-origin response mix-ups.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware


_PUBLIC_PATHS = (
    "/api/auth/branding",
    "/api/health",
)


class InstanceHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)

        path = request.url.path
        if not path.startswith("/api/"):
            return response

        subdomain = getattr(request.state, "instance_subdomain", None)
        if subdomain:
            response.headers["X-Instance-Subdomain"] = subdomain


        if path not in _PUBLIC_PATHS:
            response.headers["Cache-Control"] = "no-store, private"

        return response
