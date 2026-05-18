"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import apiClient from "@/lib/api";
import * as Types from "@/lib/types";
import { type WeightUnit } from "@/lib/units";
import { formatDate, type HighlightedExercise } from "./utils";
import { SessionSection } from "./SessionSection";


export function ProgramSection({
  program,
  athleteId,
  unit,
  onHighlightExercise,
}: {
  program: Types.ProgramListResponse;
  athleteId: number;
  unit: WeightUnit;
  onHighlightExercise: (ex: HighlightedExercise) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [expandedSessions, setExpandedSessions] = useState<Set<number>>(
    new Set()
  );
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const { data: sessions = [] } = useQuery({
    queryKey: ["program-sessions", athleteId, program.id],
    queryFn: () => apiClient.listProgramSessions(athleteId, program.id),
    enabled: expanded,
  });

  
  const sessionsByWeek = useMemo(() => {
    const map = new Map<number, typeof sessions>();
    for (const s of sessions) {
      const w = s.week_number;
      if (!map.has(w)) map.set(w, []);
      map.get(w)!.push(s);
    }
    
    for (const [, list] of map) {
      list.sort((a, b) => a.day_number - b.day_number);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [sessions]);

  const toggleWeek = (weekNum: number) => {
    const newSet = new Set(expandedWeeks);
    if (newSet.has(weekNum)) {
      newSet.delete(weekNum);
    } else {
      newSet.add(weekNum);
    }
    setExpandedWeeks(newSet);
  };

  const updatePrimaryDaysMutation = useMutation({
    mutationFn: (data: {
      primary_squat_day: number | null;
      primary_bench_day: number | null;
      primary_deadlift_day: number | null;
    }) => apiClient.updateProgramPrimaryDays(program.id, data),
    onSuccess: () => {
      
      
      
      
      queryClient.invalidateQueries({ queryKey: ["athlete-programs", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["program-sessions", athleteId, program.id] });
    },
  });

  const toggleSession = (sessionId: number) => {
    const newSet = new Set(expandedSessions);
    if (newSet.has(sessionId)) {
      newSet.delete(sessionId);
    } else {
      newSet.add(sessionId);
    }
    setExpandedSessions(newSet);
  };

  
  const uniqueDays = Array.from(
    new Set(sessions.map((s) => s.day_number))
  ).sort((a, b) => a - b);

  
  const handlePrimaryDayToggle = (lift: "squat" | "bench" | "deadlift", dayNumber: number) => {
    const fieldName =
      lift === "squat"
        ? "primary_squat_day"
        : lift === "bench"
        ? "primary_bench_day"
        : "primary_deadlift_day";

    const currentValue = program[fieldName as keyof Types.ProgramListResponse] as number | null | undefined;
    const newValue = currentValue === dayNumber ? null : dayNumber;

    const updateData = {
      primary_squat_day: program.primary_squat_day || null,
      primary_bench_day: program.primary_bench_day || null,
      primary_deadlift_day: program.primary_deadlift_day || null,
    };

    updateData[fieldName as keyof typeof updateData] = newValue;
    updatePrimaryDaysMutation.mutate(updateData);
  };

  return (
    <div
      style={{
        border: "1px solid var(--cloud-border)",
        borderRadius: "var(--cloud-r-md)",
        background: "rgba(255,255,255,0.02)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between transition-colors hover:bg-white/[0.02]"
        style={{ padding: "var(--cloud-s3) var(--cloud-s4)" }}
      >
        <div className="flex-1 text-left">
          <div className="cloud-text font-medium" style={{ fontSize: 14 }}>
            {program.program_name || `Program #${program.program_number}`}
          </div>
          <div className="cloud-text-muted" style={{ fontSize: 12, marginTop: 2 }}>
            {formatDate(program.date_start)} to {formatDate(program.date_end)} •{" "}
            {program.session_count || 0} sessions
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 cloud-text-muted" />
        ) : (
          <ChevronRight className="w-4 h-4 cloud-text-muted" />
        )}
      </button>

      {expanded && (
        <div
          className="space-y-3"
          style={{
            borderTop: "1px solid var(--cloud-border)",
            padding: "var(--cloud-s3) var(--cloud-s4)",
            background: "rgba(0,0,0,0.2)",
          }}
        >
          {}
          {uniqueDays.length > 0 && (
            <div
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--cloud-border)",
                borderRadius: "var(--cloud-r-md)",
                padding: "var(--cloud-s3)",
              }}
            >
              <div
                className="cloud-text-dim"
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontWeight: 500,
                  marginBottom: 8,
                }}
              >
                Primary Days
              </div>
              <div className="space-y-2">
                {(["squat", "bench", "deadlift"] as const).map((lift) => (
                  <div key={lift} className="flex items-center gap-2">
                    <span className="cloud-text-muted capitalize" style={{ fontSize: 11, minWidth: 48 }}>{lift}:</span>
                    <div className="flex gap-1 flex-wrap">
                      {uniqueDays.map((dayNum) => {
                        const fieldName =
                          lift === "squat"
                            ? "primary_squat_day"
                            : lift === "bench"
                            ? "primary_bench_day"
                            : "primary_deadlift_day";
                        const isActive = program[fieldName as keyof Types.ProgramListResponse] === dayNum;
                        const activeClass = {
                          squat: "bg-orange-500 text-white",
                          bench: "bg-cyan-400 text-gray-900",
                          deadlift: "bg-violet-500 text-white",
                        }[lift];

                        return (
                          <button
                            key={dayNum}
                            onClick={() => handlePrimaryDayToggle(lift, dayNum)}
                            disabled={updatePrimaryDaysMutation.isPending}
                            className={`rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                              isActive ? activeClass : "cloud-text-muted hover:bg-white/[0.04]"
                            }`}
                            style={{
                              padding: "3px 8px",
                              ...(isActive
                                ? {}
                                : {
                                    background: "rgba(255,255,255,0.03)",
                                    border: "1px solid var(--cloud-border)",
                                  }),
                            }}
                          >
                            Day {dayNum}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {}
          {sessionsByWeek.length === 0 ? (
            <div className="cloud-text-muted italic" style={{ fontSize: 12 }}>No sessions</div>
          ) : (
            <div className="space-y-2">
              {sessionsByWeek.map(([weekNum, weekSessions]) => {
                const isWeekExpanded = expandedWeeks.has(weekNum);
                return (
                  <div
                    key={weekNum}
                    style={{
                      border: "1px solid var(--cloud-border)",
                      borderRadius: "var(--cloud-r-md)",
                      background: "rgba(255,255,255,0.02)",
                      overflow: "hidden",
                    }}
                  >
                    <button
                      onClick={() => toggleWeek(weekNum)}
                      className="w-full flex items-center justify-between transition-colors hover:bg-white/[0.02]"
                      style={{ padding: "var(--cloud-s2) var(--cloud-s3)" }}
                    >
                      <div className="flex-1 text-left">
                        <div className="cloud-text font-medium" style={{ fontSize: 13 }}>Week {weekNum}</div>
                        <div className="cloud-text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                          {weekSessions.length} day{weekSessions.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                      {isWeekExpanded ? (
                        <ChevronDown className="w-4 h-4 cloud-text-muted" />
                      ) : (
                        <ChevronRight className="w-4 h-4 cloud-text-muted" />
                      )}
                    </button>
                    {isWeekExpanded && (
                      <div
                        className="space-y-2"
                        style={{
                          borderTop: "1px solid var(--cloud-border)",
                          padding: "var(--cloud-s3)",
                          background: "rgba(0,0,0,0.15)",
                        }}
                      >
                        {weekSessions.map((session) => (
                          <SessionSection
                            key={session.id}
                            session={session}
                            athleteId={athleteId}
                            programId={program.id}
                            programNumber={program.program_number ?? 0}
                            unit={unit}
                            isExpanded={expandedSessions.has(session.id)}
                            onToggle={() => toggleSession(session.id)}
                            onHighlightExercise={onHighlightExercise}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
