


import type { MetadataRoute } from "next";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const host = (await headers()).get("host") ?? "";
  const internalApi = process.env.INTERNAL_API_URL || "http://127.0.0.1:8080";

  let teamName = "BeStrong";
  try {
    const res = await fetch(`${internalApi}/api/auth/branding`, {
      headers: { "x-forwarded-host": host },
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { team_name?: string };
      if (data.team_name) teamName = data.team_name;
    }
  } catch {
    
  }

  const appName = `${teamName} HQ`;

  return {
    name: appName,
    short_name: teamName,
    description: "Powerlifting coaching analytics and athlete CRM",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0A0F18",
    theme_color: "#0A0F18",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
