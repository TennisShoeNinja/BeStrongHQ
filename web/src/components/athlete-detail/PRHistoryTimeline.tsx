"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import apiClient from "@/lib/api";
import * as Types from "@/lib/types";
import { convertWeight, formatWeight, type WeightUnit } from "@/lib/units";
import PRDetailModal from "@/components/PRDetailModal";


export function PRHistoryTimeline({
  athleteId,
  unit,
  athleteName,
}: {
  athleteId: number;
  unit: WeightUnit;
  athleteName?: string | null;
}) {
  const [liftFilter, setLiftFilter] = useState<string>("all");
  const [selectedPR, setSelectedPR] = useState<Types.MaxHistoryEntry | null>(null);
  const { data: programs } = useQuery({
    queryKey: ["programs", athleteId],
    queryFn: () => apiClient.listPrograms(athleteId),
  });
  
  
  
  const [repFilter, setRepFilter] = useState<string>("all");
  
  
  const [exerciseFilter, setExerciseFilter] = useState<string>("all");
  
  
  
  
  const [showAllEvents, setShowAllEvents] = useState(false);
  const { data: history = [], isLoading } = useQuery({
    queryKey: ["max-history", athleteId],
    queryFn: () => apiClient.getMaxHistory(athleteId),
  });
  
  
  
  const { data: aliasGroups = [] } = useQuery({
    queryKey: ["exercise-aliases"],
    queryFn: () => apiClient.listExerciseAliases(),
  });
  const displayNameFor = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of aliasGroups) {
      for (const alias of group.aliases) {
        map.set(alias.alias_name.toLowerCase(), group.primary_name);
      }
    }
    return (name: string | null | undefined): string => {
      if (!name) return "";
      return map.get(name.toLowerCase()) ?? name;
    };
  }, [aliasGroups]);

  if (isLoading) {
    return (
      <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
        <div className="cloud-panel-head">
          <h2>PR History</h2>
        </div>
        <div className="cloud-text-muted" style={{ padding: "var(--cloud-s4)", fontSize: 13 }}>
          Loading PR history...
        </div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
        <div className="cloud-panel-head">
          <h2>PR History</h2>
        </div>
        <p className="cloud-text-muted" style={{ padding: "var(--cloud-s4)", fontSize: 13 }}>
          No max changes recorded yet. History will be tracked automatically when maxes are updated.
        </p>
      </div>
    );
  }

  
  const prsOnly = history.filter((h) => {
    if (h.old_value == null) return true; 
    return h.new_value > h.old_value;
  });
  
  
  
  
  
  const collapsed = (() => {
    if (showAllEvents) return prsOnly;
    const seen = new Set<string>();
    const result: typeof prsOnly = [];
    for (const h of prsOnly) {
      const key = h.lift === "total"
        ? "total"
        : `${h.lift}|${h.exercise_name ?? ""}|${h.reps ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(h);
    }
    return result;
  })();
  
  
  const filtered = collapsed.filter((h) => {
    if (liftFilter !== "all" && h.lift !== liftFilter) return false;
    if (repFilter !== "all") {
      if (repFilter === "total") {
        if (h.lift !== "total") return false;
      } else if (String(h.reps ?? "") !== repFilter) {
        return false;
      }
    }
    if (exerciseFilter !== "all" && displayNameFor(h.exercise_name) !== exerciseFilter) return false;
    return true;
  });
  const lifts = ["all", "squat", "bench", "deadlift", "total"];

  
  
  const availableReps: number[] = Array.from(
    new Set(
      collapsed
        .filter((h) => h.reps != null && (liftFilter === "all" || h.lift === liftFilter))
        .map((h) => h.reps as number)
    )
  ).sort((a, b) => a - b);
  const availableExercises: string[] = Array.from(
    new Set(
      collapsed
        .filter(
          (h) =>
            h.exercise_name &&
            (liftFilter === "all" || h.lift === liftFilter) &&
            (repFilter === "all" || String(h.reps ?? "") === repFilter)
        )
        .map((h) => displayNameFor(h.exercise_name))
    )
  ).sort();

  
  
  
  const liftColor: Record<string, string> = {
    squat: "text-orange-400 border-orange-400/30 bg-orange-400/10",
    bench: "text-cyan-400 border-cyan-400/30 bg-cyan-400/10",
    deadlift: "text-violet-400 border-violet-400/30 bg-violet-400/10",
    total: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  };

  return (
    <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
      <div className="cloud-panel-head" style={{ flexWrap: "wrap", gap: "var(--cloud-s3)" }}>
        <div className="flex items-center" style={{ gap: "var(--cloud-s2)" }}>
          <h2>PR History</h2>
          <div className="relative group">
            <Info className="w-3.5 h-3.5 cloud-text-muted cursor-help" />
            <div
              className="absolute bottom-full left-0 mb-2 w-72 p-3 rounded-md cloud-panel-raised cloud-text-muted z-10 hidden group-hover:block pointer-events-none"
              style={{
                fontSize: 12,
                lineHeight: 1.45,
                boxShadow: "0 20px 40px -16px rgba(0,0,0,0.6), 0 8px 16px -4px rgba(0,0,0,0.4)",
              }}
            >
              <p className="cloud-text font-medium mb-1.5" style={{ fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                How PR History is calculated
              </p>
              <p className="mb-1.5">
                <span className="cloud-text font-medium">Rep PRs:</span> tracked per (exercise, rep count) for reps 1–10 on squat / bench / deadlift variations. 350 × 3 records as a 3RM, 405 × 1 as a 1RM — separate lanes so progress on close-grip bench doesn&apos;t get mashed into competition bench.
              </p>
              <p>
                <span className="cloud-text font-medium">Total:</span> Training total — best top set of any rep count across all three primary lifts per session, summed together.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center flex-wrap" style={{ gap: "var(--cloud-s2)" }}>
          <div className="cloud-tabs" role="tablist" aria-label="Lift filter">
            {lifts.map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={liftFilter === l}
                onClick={() => setLiftFilter(l)}
                className="cloud-tab"
              >
                {l === "all" ? "All" : l.charAt(0).toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
          <select
            value={repFilter}
            onChange={(e) => {
              setRepFilter(e.target.value);
              setExerciseFilter("all");
            }}
            className="cloud-btn cloud-btn-ghost"
            style={{ colorScheme: "dark", padding: "4px var(--cloud-s2)", fontSize: 12 }}
            title="Filter by rep count"
          >
            <option value="all">All reps</option>
            {availableReps.map((r) => (
              <option key={r} value={String(r)}>
                {r}RM
              </option>
            ))}
            {collapsed.some((h) => h.lift === "total") && (
              <option value="total">Training total</option>
            )}
          </select>
          {availableExercises.length > 1 && (
            <select
              value={exerciseFilter}
              onChange={(e) => setExerciseFilter(e.target.value)}
              className="cloud-btn cloud-btn-ghost max-w-[180px]"
              style={{ colorScheme: "dark", padding: "4px var(--cloud-s2)", fontSize: 12 }}
              title="Filter by exercise variation"
            >
              <option value="all">All variations</option>
              {availableExercises.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setShowAllEvents((v) => !v)}
            className="cloud-btn cloud-btn-ghost"
            style={{
              padding: "4px var(--cloud-s2)",
              fontSize: 12,
              color: showAllEvents ? "var(--cloud-primary-text)" : undefined,
              borderColor: showAllEvents ? "rgba(12, 92, 171, 0.35)" : undefined,
              background: showAllEvents ? "rgba(12, 92, 171, 0.18)" : undefined,
            }}
            title={
              showAllEvents
                ? "Showing every PR event — each time the prior best was beaten."
                : "Showing the current best per (lift, exercise, reps). Click to see full progression history."
            }
          >
            {showAllEvents ? "All events" : "Current best"}
          </button>
        </div>
      </div>

      <div className="cloud-thin-scroll" style={{ maxHeight: 320, overflowY: "auto", padding: "var(--cloud-s3) var(--cloud-s4) var(--cloud-s4)" }}>
        {filtered.map((entry) => {
          
          
          
          const diffLbs =
            entry.old_value != null ? entry.new_value - entry.old_value : null;
          const diffDisplay =
            diffLbs != null ? Math.round(convertWeight(diffLbs, unit)) : null;
          const isIncrease = diffDisplay !== null && diffDisplay > 0;
          const dateStr = new Date(entry.recorded_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          const colorClass =
            liftColor[entry.lift] ||
            "cloud-text-muted border-[color:var(--cloud-border)] bg-[rgba(255,255,255,0.03)]";

          
          
          
          const repLabel =
            entry.reps != null
              ? `${entry.reps}RM`
              : entry.lift === "total"
              ? "Total"
              : null;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSelectedPR(entry)}
              title="See full progression"
              className="w-full text-left flex items-center gap-3 px-2 -mx-2 py-2 rounded border-b border-[color:var(--cloud-border)] last:border-0 hover:bg-[rgba(255,255,255,0.03)] transition-colors"
            >
              <span
                className={`font-medium px-2 py-0.5 rounded border ${colorClass}`}
                style={{ fontSize: 11, letterSpacing: "0.02em" }}
              >
                {entry.lift.charAt(0).toUpperCase() + entry.lift.slice(1)}
              </span>
              {repLabel && (
                <span
                  className="font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  style={{ fontSize: 10, letterSpacing: "0.04em" }}
                >
                  {repLabel}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  {entry.old_value != null && (
                    <span className="cloud-text-dim" style={{ fontSize: 13 }}>
                      {formatWeight(entry.old_value, unit)}
                    </span>
                  )}
                  {entry.old_value != null && (
                    <span className="cloud-text-dim" style={{ fontSize: 12 }}>&rarr;</span>
                  )}
                  <span className="cloud-text font-medium" style={{ fontSize: 13 }}>
                    {formatWeight(entry.new_value, unit)}
                  </span>
                  {entry.reps != null && entry.reps > 1 && (
                    <span className="cloud-text-dim" style={{ fontSize: 12 }}>
                      × {entry.reps}
                    </span>
                  )}
                  {diffDisplay !== null && (
                    <span
                      className="font-medium"
                      style={{
                        fontSize: 12,
                        color: isIncrease ? "#86efac" : "#fca5a5",
                      }}
                    >
                      ({isIncrease ? "+" : ""}{diffDisplay} {unit})
                    </span>
                  )}
                </div>
                {}
                {entry.exercise_name ? (
                  <p className="cloud-text-dim truncate" style={{ fontSize: 12 }} title={entry.exercise_name}>
                    {entry.exercise_name}
                    {entry.note && (
                      <span className="opacity-75"> · {entry.note}</span>
                    )}
                  </p>
                ) : (
                  entry.note && (
                    <p className="cloud-text-dim truncate" style={{ fontSize: 12 }}>
                      {entry.note}
                    </p>
                  )
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="cloud-text-dim" style={{ fontSize: 12 }}>{dateStr}</p>
                <p className="cloud-text-dim" style={{ fontSize: 11 }}>{entry.source}</p>
              </div>
            </button>
          );
        })}
      </div>
      <PRDetailModal
        open={!!selectedPR}
        onClose={() => setSelectedPR(null)}
        pr={selectedPR}
        allHistory={history}
        athleteName={athleteName ?? null}
        unit={unit}
        programIndex={programs?.map((p) => ({
          id: p.id,
          program_number: p.program_number ?? null,
          program_name: p.program_name ?? null,
        }))}
        programSheetUrls={
          programs
            ? Object.fromEntries(programs.map((p) => [p.id, p.google_sheet_url ?? null]))
            : undefined
        }
      />
    </div>
  );
}
