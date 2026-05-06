"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api";
import * as Types from "@/lib/types";

const PREVIEW_LIMIT = 5;

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function notificationHref(n: Types.NotificationResponse): string {
  return n.athlete_id ? `/athletes/${n.athlete_id}` : "/inbox";
}

function notificationTitle(n: Types.NotificationResponse): string {
  if (n.notification_type === "program_due" && n.athlete_name) {
    return `Reminder in ${n.athlete_name}`;
  }
  return n.title || n.athlete_name || "Notification";
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);

  const { data: notificationCount = 0 } = useQuery({
    queryKey: ["notification-count"],
    queryFn: () => apiClient.getNotificationCount(),
    refetchInterval: 30000,
    staleTime: 5000,
    refetchOnWindowFocus: true,
  });

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications-preview"],
    queryFn: () => apiClient.listNotifications(false, PREVIEW_LIMIT),
    enabled: open,
    staleTime: 10_000,
  });

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        className="cloud-icon-btn"
        title="Inbox"
        aria-label={
          notificationCount > 0
            ? `Inbox (${notificationCount} unread)`
            : "Inbox"
        }
      >
        <Bell className="w-4 h-4" />
        {notificationCount > 0 && <span className="cloud-icon-dot" />}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="bottom" align="end" sideOffset={8}>
          <PopoverPrimitive.Popup
            className="cloud-panel-raised z-50 w-[360px] origin-[var(--transform-origin)] rounded-xl text-sm outline-none ring-1 ring-foreground/10 transition-[transform,opacity] duration-150 ease-out data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-top-1 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-top-1"
            style={{
              boxShadow:
                "0 20px 40px -16px rgba(0,0,0,0.6), 0 8px 16px -4px rgba(0,0,0,0.4)",
            }}
          >
            <div className="flex items-baseline justify-between px-4 pt-4 pb-2 gap-3">
              <PopoverPrimitive.Title className="font-heading text-base leading-none font-medium">
                Inbox
              </PopoverPrimitive.Title>
              {notificationCount > 0 && (
                <span
                  className="cloud-text-dim shrink-0"
                  style={{ fontSize: 11 }}
                >
                  {notificationCount} unread
                </span>
              )}
            </div>

            <div className="flex flex-col">
              {isLoading && notifications.length === 0 ? (
                <div
                  className="cloud-text-muted"
                  style={{ padding: "12px 16px", fontSize: 12 }}
                >
                  Loading…
                </div>
              ) : notifications.length === 0 ? (
                <div
                  className="cloud-text-muted"
                  style={{ padding: "16px", fontSize: 12 }}
                >
                  No notifications right now.
                </div>
              ) : (
                notifications.slice(0, PREVIEW_LIMIT).map((n) => {
                  const isUnread = !n.read;
                  return (
                    <Link
                      key={n.id}
                      href={notificationHref(n)}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3 px-4 py-2.5 hover:bg-[var(--cloud-surface-raised)] transition-colors"
                      style={{
                        borderTop: "1px solid var(--cloud-border)",
                        textDecoration: "none",
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 999,
                          marginTop: 7,
                          flexShrink: 0,
                          backgroundColor: isUnread
                            ? "var(--cloud-primary-text)"
                            : "transparent",
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          className="truncate"
                          style={{
                            fontSize: 13,
                            fontWeight: isUnread ? 600 : 500,
                            color: isUnread
                              ? "var(--cloud-text)"
                              : "var(--cloud-text-muted)",
                          }}
                        >
                          {notificationTitle(n)}
                        </div>
                        {n.message && (
                          <div
                            className="cloud-text-muted truncate"
                            style={{ fontSize: 11, marginTop: 2 }}
                          >
                            {n.message}
                          </div>
                        )}
                      </div>
                      <span
                        className="cloud-text-dim shrink-0"
                        style={{ fontSize: 11, marginTop: 1 }}
                      >
                        {formatTimeAgo(n.created_at)}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>

            <div
              className="flex items-center justify-end px-4 py-3"
              style={{ borderTop: "1px solid var(--cloud-border)" }}
            >
              <Link
                href="/inbox"
                onClick={() => setOpen(false)}
                className="hover:underline"
                style={{
                  color: "var(--cloud-primary-text)",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                Open inbox →
              </Link>
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
