"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api";


export function InstanceChrome() {
  const { data } = useQuery({
    queryKey: ["branding"],
    queryFn: () => apiClient.getBranding(),
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const teamName = data?.team_name || "BeStrong";
    document.title = `${teamName} HQ`;
  }, [data?.team_name]);

  return null;
}
