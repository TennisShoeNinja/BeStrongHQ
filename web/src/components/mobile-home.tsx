"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { User, ArrowRight, CheckCircle } from "lucide-react";
import apiClient from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import * as Types from "@/lib/types";
import PRDetailModal from "@/components/PRDetailModal";

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

/**
 * Mobile home page (<md). Built to match `mockups/phone-dashboard.html`
 * in the BeStrongOps mobile-redesign branch.
 */
export function MobileHome() {
  const { instance } = useAuth();
  const [selectedPRItem, setSelectedPRItem] = useState<Types.NeedsReviewItem | null>(null);
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
  const { data: needsReview = [] } = useQuery({
    queryKey: ["needsReview"],
    queryFn: () => apiClient.getNeedsReview(3),
  });
  const { data: todaySchedule = [] } = useQuery({
    queryKey: ["todaySchedule"],
    queryFn: () => apiClient.getTodaySchedule(),
  });
  const { data: queueCount = 0 } = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: () => apiClient.getNotificationCount(),
  });
  const { data: selectedPRHistory = [] } = useQuery({
    queryKey: ["maxHistory", selectedPRItem?.athlete_id],
    queryFn: () => {
      if (!selectedPRItem) return Promise.resolve([]);
      return apiClient.getMaxHistory(selectedPRItem.athlete_id);
    },
    enabled: selectedPRItem !== null,
  });

  const teamName = instance?.org_name || "BeStrong";
  const today = new Date();
  const todayWeekday = today.getDay() === 0 ? 7 : today.getDay();
  const dateLabel = formatGreetingDate(today);
  const timeOfDay = getTimeOfDayLabel(today.getHours());
  const coachName = firstName(settings?.coach_display_name) || "Coach";
  const initials = coachName.slice(0, 2).toUpperCase();

  const rosterTotal = todayStatus?.roster_total ?? athletes.length;
  const scheduledToday = todayStatus?.scheduled_today ?? 0;
  const activeProgramCount = todayStatus?.with_active_program ?? 0;
  const syncedToday = todayStatus?.synced_today ?? 0;
  const scheduledPct = rosterTotal > 0 ? (scheduledToday / rosterTotal) * 100 : 0;

  const recentPRs = needsReview.filter((item) => item.kind === "pr");
  const selectedPR = useMemo(() => {
    if (!selectedPRItem?.target_id) return null;
    return selectedPRHistory.find((entry) => entry.id === selectedPRItem.target_id) ?? null;
  }, [selectedPRHistory, selectedPRItem]);
  const todayRows = useMemo(() => {
    return todaySchedule
      .map((row) => {
        const rowAthletes =
          row.athletes?.length
            ? row.athletes
            : athletes
                .filter((athlete) => {
                  if (row.title === "Squat day") return athlete.primary_squat_day === todayWeekday;
                  if (row.title === "Bench day") return athlete.primary_bench_day === todayWeekday;
                  if (row.title === "Deadlift day") {
                    return athlete.primary_deadlift_day === todayWeekday;
                  }
                  return false;
                })
                .map((athlete) => ({ id: athlete.id, name: athlete.name }));
        return {
          ...row,
          athletes: rowAthletes.sort((a, b) => a.name.localeCompare(b.name)),
        };
      })
      .filter((row) => row.athletes.length > 0);
  }, [athletes, todaySchedule, todayWeekday]);
  const todayAthleteCount = useMemo(() => {
    const athleteIds = new Set<number>();
    todayRows.forEach((row) => {
      row.athletes.forEach((athlete) => {
        athleteIds.add(athlete.id);
      });
    });
    return athleteIds.size;
  }, [todayRows]);

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

        {/* Today schedule */}
        {todaySchedule.length > 0 && (
          <>
            <div className="cloud-mhome-section-h">
              <p className="eyebrow">
                Today <span className="meta">· {todayAthleteCount} athlete{todayAthleteCount === 1 ? "" : "s"}</span>
              </p>
              <Link href="/meets">
                Full week <ArrowRight />
              </Link>
            </div>
            <div className="cloud-mhome-sched">
              {todayRows.map((row, idx) => (
                <div key={`${row.title}-${idx}`} className="row">
                  <div className="chip">
                    <User />
                  </div>
                  <div className="summary">
                    <p className="title">{row.title}</p>
                    <div className="athletes">
                      {row.athletes.map((athlete) => (
                        <Link key={athlete.id} href={`/athletes/${athlete.id}`}>
                          {athlete.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Recent PRs */}
        {recentPRs.length > 0 && (
          <>
            <div className="cloud-mhome-section-h">
              <p className="eyebrow">Recent PRs</p>
            </div>
            <div className="cloud-mhome-review">
              {recentPRs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="cloud-mhome-rcard"
                  onClick={() => setSelectedPRItem(item)}
                  aria-label={`Open ${item.athlete_name} PR details`}
                >
                  <div className={`ava ${item.avatar_class}`}>{item.athlete_initials}</div>
                  <div>
                    <p className="who">{item.athlete_name}</p>
                    <p className="what">{item.title}</p>
                  </div>
                  <span className={`cloud-mhome-pill ${item.kind}`}>
                    {PILL_LABEL[item.kind]}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {queueCount > 0 && (
        <Link href="/queue" className="cloud-mhome-fab">
          <CheckCircle />
          Work queue
          <span className="fab-badge">{queueCount}</span>
        </Link>
      )}
      <PRDetailModal
        open={selectedPRItem !== null && selectedPR !== null}
        onClose={() => setSelectedPRItem(null)}
        pr={selectedPR}
        allHistory={selectedPRHistory}
        athleteName={selectedPRItem?.athlete_name ?? null}
      />
    </>
  );
}
