"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Users, User, ArrowRight, CheckCircle } from "lucide-react";
import apiClient from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import { Spark } from "@/components/spark";

function formatGreetingDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getTimeOfDayLabel(hour: number): string {
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

function firstName(displayName: string | undefined | null): string | null {
  if (!displayName) return null;
  const trimmed = displayName.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
}

const PILL_LABEL: Record<"pr" | "miss" | "load", string> = {
  pr: "PR",
  miss: "MISS",
  load: "LOAD",
};

const EMPTY_SPARK = [0, 0, 0, 0, 0, 0, 0, 0];

/**
 * Mobile home page (<md). Built to match `mockups/phone-dashboard.html`
 * in the BeStrongOps mobile-redesign branch.
 */
export function MobileHome() {
  const { instance } = useAuth();
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiClient.getSettings(),
  });
  const { data: athletes = [] } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => apiClient.listAthletes(),
  });
  const { data: todayStatus, isLoading: todayStatusLoading } = useQuery({
    queryKey: ["todayStatus"],
    queryFn: () => apiClient.getTodayStatus(),
  });
  const { data: weeklyStats, isPending: weeklyStatsPending } = useQuery({
    queryKey: ["weeklyStats"],
    queryFn: () => apiClient.getWeeklyStats(),
  });
  const { data: needsReview = [] } = useQuery({
    queryKey: ["needsReview"],
    queryFn: () => apiClient.getNeedsReview(3),
  });
  const { data: todaySchedule = [] } = useQuery({
    queryKey: ["todaySchedule"],
    queryFn: () => apiClient.getTodaySchedule(),
  });

  const teamName = instance?.org_name || "BeStrong";
  const today = new Date();
  const dateLabel = formatGreetingDate(today);
  const timeOfDay = getTimeOfDayLabel(today.getHours());
  const coachName = firstName(settings?.coach_display_name) || "Coach";
  const initials = coachName.slice(0, 2).toUpperCase();

  const rosterTotal = todayStatus?.roster_total ?? athletes.length;
  const scheduledToday = todayStatus?.scheduled_today ?? 0;
  const activeProgramCount = todayStatus?.with_active_program ?? 0;
  const syncedToday = todayStatus?.synced_today ?? 0;
  const scheduledPct = rosterTotal > 0 ? (scheduledToday / rosterTotal) * 100 : 0;

  const prsValue = weeklyStatsPending ? "—" : String(weeklyStats?.prs_this_week ?? 0);
  const prsDelta = weeklyStats?.prs_delta ?? 0;
  const prsSpark = weeklyStats?.prs_spark ?? EMPTY_SPARK;
  const sessionsValue = weeklyStatsPending ? "—" : String(weeklyStats?.sessions_this_week ?? 0);
  const sessionsSpark = weeklyStats?.sessions_spark ?? EMPTY_SPARK;
  const flaggedValue = weeklyStatsPending ? "—" : String(weeklyStats?.flagged_now ?? 0);
  const flaggedDelta = weeklyStats?.flagged_delta ?? 0;
  const flaggedSpark = weeklyStats?.flagged_spark ?? EMPTY_SPARK;

  const reviewCount = needsReview.length;
  const sessionCount = todaySchedule.length;

  return (
    <>
      <div className="cloud-mhome-wrap">
        {/* Header */}
        <header className="cloud-mhome-header">
          <div className="left">
            <p className="cloud-mhome-team-eyebrow">
              <span>{teamName}</span>
              <span className="sep" aria-hidden />
              <span className="date">{dateLabel}</span>
            </p>
            <h1 className="cloud-mhome-greeting">
              {timeOfDay},{" "}
              <span className="cloud-text-grad-blue">{coachName}</span>.
            </h1>
          </div>
          <div className="cloud-mhome-avatar">{initials}</div>
        </header>

        {/* Hero: training today */}
        <div className="cloud-panel-primary cloud-mhome-hero">
          <p className="label">Training today</p>
          <p className="count">
            {scheduledToday}
            <span className="of"> / {rosterTotal} athletes</span>
          </p>
          <div
            className={`bar ${todayStatusLoading ? "is-loading" : ""}`}
            role="presentation"
          >
            <div
              className="seg done"
              style={{ width: `${scheduledPct}%` }}
            />
          </div>
          <p className="legend">
            <strong>{scheduledToday}</strong> scheduled ·{" "}
            <strong>{activeProgramCount}</strong> on a program ·{" "}
            <strong>{syncedToday}</strong> synced today
          </p>
        </div>

        {/* Stat strip */}
        <div className="cloud-mhome-strip">
          <div className="cloud-mhome-stat">
            <p className="label">PRs · 7d</p>
            <p className="value">
              {prsValue}
              {prsDelta !== 0 && (
                <span className={`delta ${prsDelta > 0 ? "up" : "down"}`}>
                  {prsDelta > 0 ? "+" : ""}
                  {prsDelta}
                </span>
              )}
            </p>
            <p className="sub">vs last week</p>
            <Spark
              className="spark"
              points={prsSpark}
              tone="success"
              width={44}
              height={14}
            />
          </div>
          <div className="cloud-mhome-stat">
            <p className="label">Sessions</p>
            <p className="value">{sessionsValue}</p>
            <p className="sub">past 7d</p>
            <Spark
              className="spark"
              points={sessionsSpark}
              tone="primary"
              width={44}
              height={14}
            />
          </div>
          <div className="cloud-mhome-stat">
            <p className="label">Flagged</p>
            <p className="value">
              {flaggedValue}
              {flaggedDelta !== 0 && (
                <span className={`delta ${flaggedDelta > 0 ? "down" : "up"}`}>
                  {flaggedDelta > 0 ? "+" : ""}
                  {flaggedDelta}
                </span>
              )}
            </p>
            <p className="sub">vs last week</p>
            <Spark
              className="spark"
              points={flaggedSpark}
              tone="danger"
              width={44}
              height={14}
            />
          </div>
        </div>

        {/* Needs review */}
        <div className="cloud-mhome-section-h">
          <p className="eyebrow">Needs review</p>
          <Link href="/queue">
            See all <ArrowRight />
          </Link>
        </div>
        <div className="cloud-mhome-review">
          {needsReview.map((item) => (
            <div key={item.id} className="cloud-mhome-rcard">
              <div className={`ava ${item.avatar_class}`}>{item.athlete_initials}</div>
              <div>
                <p className="who">{item.athlete_name}</p>
                <p className="what">{item.title}</p>
              </div>
              <span className={`cloud-mhome-pill ${item.kind}`}>
                {PILL_LABEL[item.kind]}
              </span>
            </div>
          ))}
        </div>

        {/* Today schedule */}
        {todaySchedule.length > 0 && (
          <>
            <div className="cloud-mhome-section-h">
              <p className="eyebrow">
                Today <span className="meta">· {sessionCount} sessions</span>
              </p>
              <Link href="/meets">
                Full week <ArrowRight />
              </Link>
            </div>
            <div className="cloud-mhome-sched">
              {todaySchedule.map((row, idx) => {
                const Icon = row.kind === "individual" ? User : Users;
                return (
                  <div key={`${row.time_label}-${idx}`} className="row">
                    <div className="time">{row.time_label}</div>
                    <div className="chip">
                      <Icon />
                    </div>
                    <div>
                      <p className="title">{row.title}</p>
                      <p className="meta">{row.athlete_count} athlete{row.athlete_count === 1 ? "" : "s"}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Review FAB */}
      <Link href="/queue" className="cloud-mhome-fab">
        <CheckCircle />
        Review
        <span className="fab-badge">{reviewCount}</span>
      </Link>
    </>
  );
}
