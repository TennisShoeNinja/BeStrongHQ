"""Instance fingerprint + cache-control headers on every /api/ response.

The resolver in bestrong_cloud stamps the resolved subdomain on
request.state.tenant_subdomain. This middleware echoes it back as an
X-Tenant-Subdomain response header so the frontend can verify that a
response for instance A never gets rendered on instance B's origin.

It also sets Cache-Control: no-store, private on every /api/ response
so no browser/proxy/CDN caches instance-scoped data.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware


_PUBLIC_PATHS = (
    "/api/auth/branding",
    "/api/health",
)


class TenantHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)

        path = request.url.path
        if not path.startswith("/api/"):
            return response

        subdomain = getattr(request.state, "tenant_subdomain", None)
        if subdomain:
            response.headers["X-Tenant-Subdomain"] = subdomain


        if path not in _PUBLIC_PATHS:
            response.headers["Cache-Control"] = "no-store, private"

        return response
