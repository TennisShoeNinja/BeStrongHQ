"use client";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "./sidebar";
import apiClient from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";

export function SidebarWithNotifications() {
  const { features } = useAuth();
  const { data: notificationCount = 0 } = useQuery({
    queryKey: ["notification-count"],
    queryFn: () => apiClient.getNotificationCount(),
    refetchInterval: 30000,
    staleTime: 5000,
    refetchOnWindowFocus: true,
  });

  return (
    <Sidebar
      notificationCount={notificationCount}
      features={features}
    />
  );
}
