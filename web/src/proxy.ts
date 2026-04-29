

import { NextResponse, type NextRequest } from "next/server";

const CACHE_TTL_MS = 60_000;
const INTERNAL_API = process.env.INTERNAL_API_URL || "http://127.0.0.1:8080";

type CacheEntry = { enforce: boolean; allowed: Set<string>; expires: number };
let cache: CacheEntry | null = null;

async function loadAllowedHosts(): Promise<CacheEntry | null> {
  const now = Date.now();
  if (cache && cache.expires > now) return cache;

  try {
    const res = await fetch(`${INTERNAL_API}/api/hosts`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { mode?: string; hosts?: string[] };
    cache = {
      enforce: data.mode === "multi",
      allowed: new Set(data.hosts ?? []),
      expires: now + CACHE_TTL_MS,
    };
    return cache;
  } catch {
    return null;
  }
}

function hostKey(host: string): string | null {
  const hostname = host.split(":")[0].toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^[\d.]+$/.test(hostname)
  ) {
    return null;
  }
  const parts = hostname.split(".");
  if (parts.length < 3) return null;
  return parts[0];
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const key = hostKey(host);

  if (!key) return NextResponse.next();

  const entry = await loadAllowedHosts();
  if (!entry) return NextResponse.next();
  if (!entry.enforce) return NextResponse.next();

  if (!entry.allowed.has(key)) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
