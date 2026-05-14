"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-provider";

export default function AthletePortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const router = useRouter();
  const { features, loading } = useAuth();

  const portalAvailable = features.includes("portal");

  useEffect(() => {
    if (loading) return;
    if (!portalAvailable) {
      router.replace(`/athletes/${params.id}`);
    }
  }, [loading, portalAvailable, params.id, router]);

  if (loading || !portalAvailable) return null;

  return <>{children}</>;
}
