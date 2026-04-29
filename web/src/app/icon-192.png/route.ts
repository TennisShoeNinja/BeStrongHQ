


import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  const internalApi = process.env.INTERNAL_API_URL || "http://127.0.0.1:8080";
  const host = request.headers.get("host") ?? "";

  const upstream = await fetch(`${internalApi}/api/install/icon-192.png`, {
    headers: { "x-forwarded-host": host },
    cache: "no-store",
  });

  if (!upstream.ok) {
    return new Response(null, { status: 404 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=300",
    },
  });
}
