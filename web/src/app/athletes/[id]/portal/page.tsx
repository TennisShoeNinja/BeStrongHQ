"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import apiClient from "@/lib/api";
import { PortalSidebar } from "@/components/portal-sidebar";
import {
  formatWeight,
  resolveWeightUnit,
  useLocalWeightUnit,
  type WeightUnit,
} from "@/lib/units";
import * as Types from "@/lib/types";

// TODO: This route is currently coach-only via AuthLayout. Once athlete-side
// auth ships, gate this with athlete-token verification AND keep a coach
// "preview" entry; do not let coach AuthLayout alone become the portal door.
function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "No update yet";

  const updatedAt = new Date(iso).getTime();
  if (Number.isNaN(updatedAt)) return "No update yet";

  const diffMs = Math.max(0, Date.now() - updatedAt);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatCompactDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatSessionDate(
  program: Types.ProgramListResponse,
  session: Types.SessionResponse,
): string {
  if (program.date_start) {
    const start = new Date(program.date_start);
    if (!Number.isNaN(start.getTime())) {
      const offsetDays = (session.week_number - 1) * 7 + (session.day_number - 1);
      const sessionDate = new Date(start);
      sessionDate.setDate(start.getDate() + offsetDays);
      return sessionDate.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }
  }

  return `W${session.week_number} D${session.day_number}`;
}

function formatProgramRange(program: Types.ProgramListResponse): string | null {
  const start = formatCompactDate(program.date_start);
  const end = formatCompactDate(program.date_end);
  if (start && end) return `${start} to ${end}`;
  return start ?? end;
}

function programTitle(program: Types.ProgramListResponse): string {
  return program.program_name ?? `Program ${program.program_number ?? program.id}`;
}

function sessionTitle(session: Types.SessionResponse): string {
  return session.session_label || session.day_name || `Day ${session.day_number}`;
}

function sessionHint(session: Types.SessionResponse): string {
  const parts = [`Week ${session.week_number}`, `Day ${session.day_number}`];
  if (session.day_name && session.day_name !== sessionTitle(session)) {
    parts.push(session.day_name);
  }
  return parts.join(" : ");
}

export default function AthletePortalPage() {
  const params = useParams();
  const athleteId = parseInt(params.id as string, 10);
  const localUnit = useLocalWeightUnit();

  const { data: athlete } = useQuery({
    queryKey: ["athlete", athleteId],
    queryFn: () => apiClient.getAthlete(athleteId),
  });
  const { data: settingsData } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiClient.getSettings(),
  });
  const { data: programs = [] } = useQuery({
    queryKey: [athleteId, "portal", "programs"],
    queryFn: () => apiClient.listPrograms(athleteId),
  });

  const showBodyMetrics = !!athlete && athlete.body_metrics_hidden !== true;
  const currentProgram = programs[0];
  const currentProgramId = currentProgram?.id;
  const { data: sessions = [] } = useQuery({
    queryKey: [athleteId, "portal", "sessions", currentProgramId],
    queryFn: () => apiClient.listProgramSessions(athleteId, currentProgramId ?? 0),
    enabled: !!currentProgramId,
  });
  const { data: bodyweightTrend = [] } = useQuery({
    queryKey: [athleteId, "portal", "bodyweight"],
    queryFn: () => apiClient.getBodyweightTrend(athleteId),
    enabled: showBodyMetrics,
  });

  const athleteName = athlete?.name ?? "Athlete";
  const lastUpdated = formatRelativeTime(athlete?.updated_at);
  const unit: WeightUnit = resolveWeightUnit(localUnit, settingsData?.default_unit);
  const recentSessions = [...sessions]
    .sort((a, b) => {
      if (a.week_number !== b.week_number) return b.week_number - a.week_number;
      return b.day_number - a.day_number;
    })
    .slice(0, 5);
  const latestBodyweight = [...bodyweightTrend].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )[0];
  const bodyweightDate = formatCompactDate(latestBodyweight?.date);

  return (
    <div style={{ padding: "var(--cloud-s5)" }}>
      <div
        className="mx-auto flex flex-col lg:flex-row"
        style={{ maxWidth: 1100, gap: "var(--cloud-s4)" }}
      >
        <div className="w-full lg:w-60 lg:shrink-0">
          <PortalSidebar
            athleteId={athleteId}
            athleteName={athleteName}
            athleteEmail={athlete?.email}
            lastUpdatedISO={athlete?.updated_at}
            activeTab="home"
          />
        </div>

        <main
          className="flex min-w-0 flex-1 flex-col"
          style={{ gap: "var(--cloud-s4)" }}
        >
          <Link
            href={`/athletes/${athleteId}`}
            className="cloud-btn cloud-btn-ghost"
            style={{ alignSelf: "flex-start" }}
          >
            <ChevronLeft className="w-4 h-4" />
            Back to athlete
          </Link>

          <div
            className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div>
              <h1
                className="font-semibold cloud-text"
                style={{
                  fontSize: 32,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.05,
                  margin: 0,
                }}
              >
                {athleteName}
              </h1>
              <p className="cloud-text-dim" style={{ marginTop: 8 }}>
                Last updated {lastUpdated}
              </p>
            </div>
            <div
              className="cloud-eyebrow-sm"
              style={{
                border: "1px solid var(--cloud-border)",
                borderRadius: "var(--cloud-r-sm)",
                padding: "6px 10px",
                background: "var(--cloud-panel)",
                whiteSpace: "nowrap",
              }}
            >
              COACH PREVIEW
            </div>
          </div>

          <div
            className="flex flex-col"
            style={{ gap: "var(--cloud-s4)" }}
          >
            <section
              className="cloud-panel-raised"
              style={{ padding: "var(--cloud-s4)" }}
            >
              <p className="cloud-eyebrow" style={{ marginBottom: 8 }}>
                CURRENT PROGRAM
              </p>
              {currentProgram ? (
                <div
                  className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <h2
                      className="cloud-text font-semibold"
                      style={{ margin: 0, fontSize: 20, lineHeight: 1.2 }}
                    >
                      {programTitle(currentProgram)}
                    </h2>
                    {formatProgramRange(currentProgram) && (
                      <p className="cloud-text-dim" style={{ marginTop: 6 }}>
                        {formatProgramRange(currentProgram)}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/athletes/${athleteId}/portal/program`}
                    className="cloud-btn cloud-btn-ghost"
                  >
                    View program
                  </Link>
                </div>
              ) : (
                <p className="cloud-text-dim" style={{ margin: 0 }}>
                  No active program.
                </p>
              )}
            </section>

            <section
              className="cloud-panel-raised"
              style={{ padding: "var(--cloud-s4)" }}
            >
              <p className="cloud-eyebrow" style={{ marginBottom: 8 }}>
                RECENT SESSIONS
              </p>
              {recentSessions.length > 0 && currentProgram ? (
                <div className="flex flex-col">
                  {recentSessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex flex-col gap-1 border-t border-[color:var(--cloud-border)] py-3 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="cloud-text" style={{ margin: 0 }}>
                          {sessionTitle(session)}
                        </p>
                        <p className="cloud-text-dim" style={{ marginTop: 4 }}>
                          {sessionHint(session)}
                        </p>
                      </div>
                      <p
                        className="cloud-text-dim"
                        style={{ margin: 0, fontSize: 13 }}
                      >
                        {formatSessionDate(currentProgram, session)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="cloud-text-dim" style={{ margin: 0 }}>
                  No sessions logged yet.
                </p>
              )}
            </section>

            {showBodyMetrics && (
              <section
                className="cloud-panel-raised"
                style={{ padding: "var(--cloud-s4)" }}
              >
                <p className="cloud-eyebrow" style={{ marginBottom: 8 }}>
                  BODY METRICS
                </p>
                {latestBodyweight ? (
                  <div>
                    <p
                      className="cloud-text font-semibold"
                      style={{ margin: 0, fontSize: 24, lineHeight: 1.2 }}
                    >
                      {formatWeight(latestBodyweight.bodyweight_lbs, unit, {
                        decimals: 1,
                      })}
                    </p>
                    <p className="cloud-text-dim" style={{ marginTop: 6 }}>
                      Latest from {bodyweightDate ?? "recent data"}
                    </p>
                  </div>
                ) : (
                  <p className="cloud-text-dim" style={{ margin: 0 }}>
                    No bodyweight data yet.
                  </p>
                )}
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
