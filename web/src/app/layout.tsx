import type { Metadata } from "next";
import { headers } from "next/headers";
import { IBM_Plex_Sans } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { AuthLayout } from "@/components/auth-layout";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


export async function generateMetadata(): Promise<Metadata> {
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

  return {
    title: `${teamName} HQ`,
    description: "Powerlifting coaching analytics and athlete CRM",
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-screen flex flex-row cloud-text">
        <Providers>
          <AuthLayout>{children}</AuthLayout>
        </Providers>
      </body>
    </html>
  );
}
