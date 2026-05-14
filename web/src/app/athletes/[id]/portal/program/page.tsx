"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import apiClient from "@/lib/api";
import { PortalSidebar } from "@/components/portal-sidebar";
import { formatWeight } from "@/lib/units";
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

function formatProgramRange(program: Types.ProgramListResponse): string | null {
  const start = formatCompactDate(program.date_start);
  const end = formatCompactDate(program.date_end);
  if (start && end) return `${start} to ${end}`;
  return start ?? end;
}

function programTitle(program: Types.ProgramListResponse): string {
  return program.program_name || `Program ${program.program_number ?? program.id}`;
}

function sessionTitle(session: Types.SessionResponse): string {
  return session.session_label || `Day ${session.day_number}`;
}

function exerciseSummary(exercise: Types.ExerciseEntryResponse): string {
  const parts: string[] = [];
  const setRep = exercise.reps
    ? `${exercise.sets}x${exercise.reps}`
    : `${exercise.sets} sets`;
  parts.push(setRep);

  if (exercise.weight_lbs != null) {
    parts.push(`@ ${formatWeight(exercise.weight_lbs, "lbs")}`);
  }

  const rpe = exercise.actual_rpe ?? exercise.target_rpe;
  if (rpe) {
    parts.push(`RPE ${String(rpe).replace(/\s*RPE\s*/gi, "").trim()}`);
  }

  if (exercise.set_type) {
    parts.push(exercise.set_type);
  }

  return parts.join(" : ");
}

export default function AthletePortalProgramPage() {
  const params = useParams();
  const athleteId = parseInt(params.id as string, 10);
  const [expandedSessionId, setExpandedSessionId] = useState<number | null>(null);

  const { data: athlete } = useQuery({
    queryKey: ["athlete", athleteId],
    queryFn: () => apiClient.getAthlete(athleteId),
  });
  const { data: programs = [] } = useQuery({
    queryKey: [athleteId, "portal", "programs"],
    queryFn: () => apiClient.listPrograms(athleteId),
  });

  const currentProgram = programs[0];
  const currentProgramId = currentProgram?.id;
  const { data: sessions = [] } = useQuery({
    queryKey: [athleteId, "portal", "sessions", currentProgramId],
    queryFn: () => apiClient.listProgramSessions(athleteId, currentProgramId ?? 0),
    enabled: !!currentProgramId,
  });
  const { data: exercises = [] } = useQuery({
    queryKey: [
      athleteId,
      "portal",
      "session-exercises",
      currentProgramId,
      expandedSessionId,
    ],
    queryFn: () =>
      apiClient.getSessionExercises(
        athleteId,
        currentProgramId ?? 0,
        expandedSessionId ?? 0,
      ),
    enabled: !!currentProgramId && !!expandedSessionId,
  });

  const athleteName = athlete?.name ?? "Athlete";
  const sessionsByWeek = useMemo(() => {
    const grouped = new Map<number, Types.SessionResponse[]>();
    for (const session of sessions) {
      const week = session.week_number;
      const weekSessions = grouped.get(week) ?? [];
      weekSessions.push(session);
      grouped.set(week, weekSessions);
    }

    for (const weekSessions of grouped.values()) {
      weekSessions.sort((a, b) => a.day_number - b.day_number);
    }

    return Array.from(grouped.entries()).sort(([a], [b]) => a - b);
  }, [sessions]);

  const sortedExercises = useMemo(
    () =>
      [...exercises].sort((a, b) => {
        if (a.exercise_order !== b.exercise_order) {
          return a.exercise_order - b.exercise_order;
        }
        return a.id - b.id;
      }),
    [exercises],
  );

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
            activeTab="program"
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
            <ChevronLeft className="w-4 h-4" strokeWidth={1.8} />
            Back to athlete
          </Link>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="cloud-eyebrow" style={{ marginBottom: 8 }}>
                PROGRAM VIEWER
              </p>
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
                Last updated {formatRelativeTime(athlete?.updated_at)}
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

          {!currentProgram ? (
            <section
              className="cloud-panel-raised"
              style={{ padding: "var(--cloud-s4)" }}
            >
              <p className="cloud-eyebrow" style={{ marginBottom: 8 }}>
                PROGRAM
              </p>
              <p className="cloud-text-dim" style={{ margin: 0 }}>
                No active program.
              </p>
            </section>
          ) : (
            <div className="flex flex-col" style={{ gap: "var(--cloud-s4)" }}>
              <section
                className="cloud-panel-raised"
                style={{ padding: "var(--cloud-s4)" }}
              >
                <p className="cloud-eyebrow" style={{ marginBottom: 8 }}>
                  PROGRAM
                </p>
                <h2
                  className="cloud-text font-semibold"
                  style={{ margin: 0, fontSize: 22, lineHeight: 1.2 }}
                >
                  {programTitle(currentProgram)}
                </h2>
                {formatProgramRange(currentProgram) && (
                  <p className="cloud-text-dim" style={{ marginTop: 6 }}>
                    {formatProgramRange(currentProgram)}
                  </p>
                )}
              </section>

              <div className="flex flex-col" style={{ gap: "var(--cloud-s4)" }}>
                {sessionsByWeek.map(([week, weekSessions]) => (
                  <section
                    key={week}
                    className="flex flex-col"
                    style={{ gap: "var(--cloud-s2)" }}
                  >
                    <p className="cloud-eyebrow-sm" style={{ margin: 0 }}>
                      WEEK {week}
                    </p>
                    {weekSessions.map((session) => {
                      const isExpanded = expandedSessionId === session.id;
                      const Chevron = isExpanded ? ChevronDown : ChevronRight;
                      return (
                        <div
                          key={session.id}
                          className="cloud-panel-raised"
                          style={{ overflow: "hidden" }}
                        >
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-3 text-left"
                            style={{
                              padding: "var(--cloud-s3)",
                              color: "inherit",
                              background: "transparent",
                              border: 0,
                              cursor: "pointer",
                            }}
                            onClick={() =>
                              setExpandedSessionId(isExpanded ? null : session.id)
                            }
                          >
                            <div className="min-w-0">
                              <p className="cloud-text" style={{ margin: 0 }}>
                                {sessionTitle(session)}
                              </p>
                              <p
                                className="cloud-text-dim"
                                style={{ marginTop: 4, fontSize: 13 }}
                              >
                                Day {session.day_number}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {session.day_name && (
                                <span
                                  className="cloud-text-dim"
                                  style={{ fontSize: 13 }}
                                >
                                  {session.day_name}
                                </span>
                              )}
                              <Chevron
                                className="h-4 w-4 cloud-text-dim"
                                strokeWidth={1.8}
                              />
                            </div>
                          </button>

                          {isExpanded && (
                            <div
                              className="flex flex-col"
                              style={{
                                borderTop: "1px solid var(--cloud-border)",
                                padding: "var(--cloud-s3)",
                                gap: "var(--cloud-s2)",
                              }}
                            >
                              {sortedExercises.length > 0 ? (
                                sortedExercises.map((exercise) => (
                                  <div
                                    key={exercise.id}
                                    style={{
                                      border: "1px solid var(--cloud-border)",
                                      borderRadius: "var(--cloud-r-sm)",
                                      padding: "var(--cloud-s2)",
                                    }}
                                  >
                                    <p
                                      className="cloud-text"
                                      style={{ margin: 0, fontWeight: 500 }}
                                    >
                                      {exercise.exercise_name}
                                    </p>
                                    <p
                                      className="cloud-text-dim"
                                      style={{ marginTop: 4, fontSize: 13 }}
                                    >
                                      {exerciseSummary(exercise)}
                                    </p>
                                  </div>
                                ))
                              ) : (
                                <p className="cloud-text-dim" style={{ margin: 0 }}>
                                  No exercises.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </section>
                ))}
                {sessionsByWeek.length === 0 && (
                  <section
                    className="cloud-panel-raised"
                    style={{ padding: "var(--cloud-s4)" }}
                  >
                    <p className="cloud-eyebrow" style={{ marginBottom: 8 }}>
                      SESSIONS
                    </p>
                    <p className="cloud-text-dim" style={{ margin: 0 }}>
                      No sessions found.
                    </p>
                  </section>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
