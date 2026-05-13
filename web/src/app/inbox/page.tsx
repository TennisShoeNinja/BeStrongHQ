"use client";

import { useState, useMemo, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import * as Types from "@/lib/types";
import { AlertCircle, CheckCircle, Clock, FileText, X } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

const MICRO_LABEL: CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 500,
};

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const secondsElapsed = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (secondsElapsed < 60) return "just now";
  const minutesElapsed = Math.floor(secondsElapsed / 60);
  if (minutesElapsed < 60) return `${minutesElapsed}m`;
  const hoursElapsed = Math.floor(minutesElapsed / 60);
  if (hoursElapsed < 24) return `${hoursElapsed}h`;
  const daysElapsed = Math.floor(hoursElapsed / 24);
  if (daysElapsed < 7) return `${daysElapsed}d`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getDateStatus(
  dateStr: string | undefined | null
): "overdue" | "due_soon" | "upcoming" | "unknown" {
  if (!dateStr) return "unknown";
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) return "overdue";
  const diffDays = Math.ceil(
    (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays <= 2) return "due_soon";
  return "upcoming";
}

function groupNotifications(notifications: Types.NotificationResponse[]) {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  const thisWeek: Types.NotificationResponse[] = [];
  const older: Types.NotificationResponse[] = [];

  for (const n of notifications) {
    const created = new Date(n.created_at);
    if (created >= startOfWeek) {
      thisWeek.push(n);
    } else {
      older.push(n);
    }
  }

  return { thisWeek, older };
}

function NotificationCard({
  notification,
  onArchive,
  onMarkRead,
  onMarkUnread,
  isArchiving,
  showArchived,
  onComplete,
  isCompleting,
  isLast,
}: {
  notification: Types.NotificationResponse;
  onArchive: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  isArchiving: boolean;
  showArchived: boolean;
  onComplete: (unit: "week" | "month") => void;
  isCompleting: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const isUnread = !notification.read && !notification.archived;

  const handleClick = () => {
    if (isUnread) {
      onMarkRead();
    }
    if (notification.athlete_id) {
      router.push(`/athletes/${notification.athlete_id}`);
    }
  };

  const handleToggleRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isUnread) {
      onMarkRead();
    } else {
      onMarkUnread();
    }
  };

  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    onArchive();
  };

  const handleComplete = (e: React.MouseEvent, unit: "week" | "month") => {
    e.stopPropagation();
    onComplete(unit);
  };

  const dateStatus = getDateStatus(notification.due_date);
  const dateColor =
    dateStatus === "overdue"
      ? "var(--cloud-danger-text)"
      : dateStatus === "due_soon"
      ? "var(--cloud-warning-text)"
      : dateStatus === "upcoming"
      ? "var(--cloud-primary-text)"
      : "var(--cloud-text-muted)";

  return (
    <div
      onClick={handleClick}
      className="group"
      style={{
        position: "relative",
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        padding: "14px 16px",
        cursor: "pointer",
        borderBottom: isLast ? "none" : "1px solid var(--cloud-border)",
        backgroundColor: isUnread
          ? "rgba(12, 92, 171, 0.06)"
          : "transparent",
        transition: "background-color 120ms ease",
      }}
    >
      {}
      <div
        className="flex items-center justify-center"
        style={{
          flexShrink: 0,
          marginTop: 2,
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: isUnread
            ? "rgba(12, 92, 171, 0.18)"
            : "var(--cloud-panel)",
          border: isUnread
            ? "1px solid rgba(12, 92, 171, 0.35)"
            : "1px solid var(--cloud-border)",
        }}
      >
        <Clock
          style={{
            width: 14,
            height: 14,
            color: isUnread ? "var(--cloud-primary-text)" : "var(--cloud-text-muted)",
            strokeWidth: 1.8,
          }}
        />
      </div>

      {}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 13,
            fontWeight: isUnread ? 600 : 500,
            color: isUnread ? "var(--cloud-text)" : "var(--cloud-text-muted)",
          }}
        >
          Reminder in{" "}
          <span style={{ color: "var(--cloud-primary-text)", fontWeight: 600 }}>
            {notification.athlete_name || "Unknown"}
          </span>
        </p>

        <p
          className="cloud-text-muted flex items-center"
          style={{ fontSize: 11, marginTop: 2, gap: 6 }}
        >
          <FileText style={{ width: 11, height: 11, flexShrink: 0 }} />
          {notification.notification_type === "program_due"
            ? "Program Due"
            : notification.title}
        </p>

        {notification.due_date && (
          <p
            className="flex items-center"
            style={{
              fontSize: 11,
              fontWeight: 500,
              marginTop: 6,
              gap: 4,
              color: dateColor,
            }}
          >
            {formatDate(notification.due_date)}
          </p>
        )}

        {}
        <div
          className="flex items-center flex-wrap"
          style={{ gap: 6, marginTop: 12 }}
        >
          <button
            onClick={(e) => handleComplete(e, "week")}
            disabled={isCompleting}
            className="cloud-btn cloud-btn-primary cloud-btn-sm"
          >
            Done +1 week
          </button>
          <button
            onClick={(e) => handleComplete(e, "month")}
            disabled={isCompleting}
            className="cloud-btn cloud-btn-ghost cloud-btn-sm"
          >
            Done +1 month
          </button>
          <Link
            href={`/athletes/${notification.athlete_id}`}
            onClick={(e) => e.stopPropagation()}
            className="cloud-btn cloud-btn-ghost cloud-btn-sm"
            style={{ textDecoration: "none" }}
          >
            View athlete
          </Link>
        </div>
      </div>

      {}
      <div
        className="flex items-center"
        style={{ flexShrink: 0, marginTop: 2, gap: 8 }}
      >
        <span
          className="cloud-text-muted"
          style={{ fontSize: 11 }}
        >
          {formatTimeAgo(notification.created_at)}
        </span>
        <button
          onClick={handleToggleRead}
          title={isUnread ? "Mark as read" : "Mark as unread"}
          aria-label={isUnread ? "Mark as read" : "Mark as unread"}
          style={{
            width: 16,
            height: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              backgroundColor: isUnread ? "var(--cloud-primary-text)" : "transparent",
              border: isUnread ? "none" : "1px solid var(--cloud-border)",
              boxShadow: isUnread
                ? "0 0 8px -1px rgba(12, 92, 171, 0.55)"
                : "none",
              transition: "background-color 120ms ease, border-color 120ms ease",
            }}
          />
        </button>
      </div>

      {}
      <button
        onClick={handleArchive}
        disabled={isArchiving}
        className="group-hover:opacity-100"
        title={showArchived ? "Unarchive" : "Dismiss"}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          opacity: 0,
          padding: 4,
          borderRadius: 6,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--cloud-text-muted)",
          transition: "opacity 120ms ease",
        }}
      >
        <X style={{ width: 13, height: 13 }} />
      </button>
    </div>
  );
}

function NotificationCardSkeleton({ isLast }: { isLast: boolean }) {
  return (
    <div
      className="animate-pulse flex items-start"
      style={{
        gap: 14,
        padding: "14px 16px",
        borderBottom: isLast ? "none" : "1px solid var(--cloud-border)",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          backgroundColor: "var(--cloud-border)",
        }}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div
          style={{
            height: 12,
            width: 208,
            borderRadius: 4,
            backgroundColor: "var(--cloud-border)",
          }}
        />
        <div
          style={{
            height: 10,
            width: 96,
            borderRadius: 4,
            backgroundColor: "var(--cloud-border)",
          }}
        />
        <div
          style={{
            height: 10,
            width: 144,
            borderRadius: 4,
            backgroundColor: "var(--cloud-border)",
          }}
        />
      </div>
      <div
        style={{
          height: 10,
          width: 24,
          borderRadius: 4,
          backgroundColor: "var(--cloud-border)",
        }}
      />
    </div>
  );
}

export default function InboxPage() {
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const { instance } = useAuth();
  const teamName = instance?.org_name || "BeStrong";

  const {
    data: notifications = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["notifications", showArchived],
    queryFn: () => apiClient.listNotifications(showArchived),
  });

  const archiveMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      if (showArchived) {
        return apiClient.unarchiveNotification(notificationId);
      }
      return apiClient.archiveNotification(notificationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (notificationId: number) =>
      apiClient.markNotificationRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markUnreadMutation = useMutation({
    mutationFn: (notificationId: number) =>
      apiClient.markNotificationUnread(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async ({
      notificationId,
      athleteId,
      dueDate,
      unit,
    }: {
      notificationId: number;
      athleteId: number;
      dueDate: string | null;
      unit: "week" | "month";
    }) => {
      const base = dueDate ? new Date(dueDate + "T00:00:00") : new Date();
      if (unit === "week") {
        base.setDate(base.getDate() + 7);
      } else {
        base.setMonth(base.getMonth() + 1);
      }
      const newDate = base.toISOString().split("T")[0];
      await apiClient.updateAthlete(athleteId, { program_due: newDate });
      await apiClient.archiveNotification(notificationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notification-count"] });
    },
  });

  const { thisWeek, older } = useMemo(
    () => groupNotifications(notifications),
    [notifications]
  );

  return (
    <div className="min-h-screen">
      <div
        className="mx-auto"
        style={{
          maxWidth: 640,
          padding: "var(--cloud-s5)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--cloud-s4)",
        }}
      >
        {}
        <div
          className="flex items-center justify-between"
          style={{ gap: 16 }}
        >
          <div>
            <p
              className="cloud-eyebrow"
              style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}
            >
              <span>{teamName}</span>
              <span
                aria-hidden
                style={{
                  width: 3,
                  height: 3,
                  borderRadius: "50%",
                  background: "var(--cloud-text-dim)",
                  display: "inline-block",
                }}
              />
              <span style={{ color: "var(--cloud-text-dim)" }}>Notifications</span>
            </p>
            <h1
              className="cloud-text"
              style={{
                fontSize: 32,
                fontWeight: 600,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
              }}
            >
              Inbox
            </h1>
            <p
              className="cloud-text-muted"
              style={{ fontSize: 13, marginTop: 6 }}
            >
              Program reminders and notifications
            </p>
          </div>
          <label
            className="flex items-center cloud-text-muted"
            style={{ gap: 8, fontSize: 13, cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              style={{
                accentColor: "var(--cloud-primary)",
                width: 14,
                height: 14,
              }}
            />
            {showArchived ? "Showing archived" : "Show archived"}
          </label>
        </div>

        {}
        {error && (
          <div
            className="flex items-center"
            style={{
              gap: 8,
              padding: "12px 14px",
              borderRadius: 8,
              backgroundColor: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.28)",
              color: "var(--cloud-danger-text)",
              fontSize: 13,
            }}
          >
            <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
            Failed to load notifications.
          </div>
        )}

        {}
        {isLoading && !error && (
          <div className="cloud-panel" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px 8px" }}>
              <h2 className="cloud-text-muted" style={MICRO_LABEL}>
                This week
              </h2>
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <NotificationCardSkeleton key={i} isLast={i === 3} />
            ))}
          </div>
        )}

        {}
        {!isLoading && !error && notifications.length === 0 && (
          <EmptyState
            icon={CheckCircle}
            iconTone="success"
            title={showArchived ? "No archived notifications" : "All clear."}
            body={
              showArchived
                ? "Archived notifications will appear here."
                : "No pending reminders right now."
            }
          />
        )}

        {}
        {!isLoading && !error && notifications.length > 0 && (
          <div
            className="flex flex-col"
            style={{ gap: "var(--cloud-s4)" }}
          >
            {thisWeek.length > 0 && (
              <div
                className="cloud-panel"
                style={{ padding: 0, overflow: "hidden" }}
              >
                <div style={{ padding: "12px 16px 8px" }}>
                  <h2 className="cloud-text-muted" style={MICRO_LABEL}>
                    This week
                  </h2>
                </div>
                {thisWeek.map((notification, i) => (
                  <NotificationCard
                    key={notification.id}
                    notification={notification}
                    showArchived={showArchived}
                    onArchive={() => archiveMutation.mutate(notification.id)}
                    onMarkRead={() => markReadMutation.mutate(notification.id)}
                    onMarkUnread={() =>
                      markUnreadMutation.mutate(notification.id)
                    }
                    isArchiving={
                      archiveMutation.isPending &&
                      archiveMutation.variables === notification.id
                    }
                    onComplete={(unit) =>
                      completeMutation.mutate({
                        notificationId: notification.id,
                        athleteId: notification.athlete_id,
                        dueDate: notification.due_date || null,
                        unit,
                      })
                    }
                    isCompleting={completeMutation.isPending}
                    isLast={i === thisWeek.length - 1}
                  />
                ))}
              </div>
            )}

            {older.length > 0 && (
              <div
                className="cloud-panel"
                style={{ padding: 0, overflow: "hidden" }}
              >
                <div style={{ padding: "12px 16px 8px" }}>
                  <h2 className="cloud-text-muted" style={MICRO_LABEL}>
                    Older
                  </h2>
                </div>
                {older.map((notification, i) => (
                  <NotificationCard
                    key={notification.id}
                    notification={notification}
                    showArchived={showArchived}
                    onArchive={() => archiveMutation.mutate(notification.id)}
                    onMarkRead={() => markReadMutation.mutate(notification.id)}
                    onMarkUnread={() =>
                      markUnreadMutation.mutate(notification.id)
                    }
                    isArchiving={
                      archiveMutation.isPending &&
                      archiveMutation.variables === notification.id
                    }
                    onComplete={(unit) =>
                      completeMutation.mutate({
                        notificationId: notification.id,
                        athleteId: notification.athlete_id,
                        dueDate: notification.due_date || null,
                        unit,
                      })
                    }
                    isCompleting={completeMutation.isPending}
                    isLast={i === older.length - 1}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {!isLoading && notifications.length > 0 && (
          <div
            className="cloud-text-muted text-center"
            style={{ fontSize: 11 }}
          >
            {notifications.length} notification
            {notifications.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
