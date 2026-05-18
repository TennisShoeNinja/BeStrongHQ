"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import apiClient from "@/lib/api";
import * as Types from "@/lib/types";
import { convertWeight, formatWeight, type WeightUnit } from "@/lib/units";
import PRDetailModal from "@/components/PRDetailModal";


export function NewPRsBanner({
  athleteId,
  unit,
  currentProgramId,
  currentProgramStart,
  currentProgramEnd,
  athleteName,
}: {
  athleteId: number;
  unit: WeightUnit;
  currentProgramId: number | null;
  currentProgramStart: string | null;
  currentProgramEnd: string | null;
  athleteName?: string | null;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [selectedPR, setSelectedPR] = useState<Types.MaxHistoryEntry | null>(null);
  const { data: programs } = useQuery({
    queryKey: ["programs", athleteId],
    queryFn: () => apiClient.listPrograms(athleteId),
    enabled: !!currentProgramId && !dismissed,
  });
  const storageKey = currentProgramId
    ? `bestrong.prs.dismissed.${athleteId}.${currentProgramId}`
    : null;

  useEffect(() => {
    if (!storageKey) return;
    try {
      /* eslint-disable react-hooks/set-state-in-effect */
      setDismissed(window.localStorage.getItem(storageKey) === "1");
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      setDismissed(false);
    }
  }, [storageKey]);

  const { data: history = [] } = useQuery({
    queryKey: ["max-history", athleteId],
    queryFn: () => apiClient.getMaxHistory(athleteId),
    enabled: !!currentProgramId && !dismissed,
  });

  // Snapshot the clock at mount via useState's lazy initializer (runs once),
  // not useSyncExternalStore + Date.now() which falls into an infinite render
  // loop because every snapshot differs.
  const [nowMs] = useState(() => Date.now());
  const blockPRsResult = useMemo(() => {
    const empty = {
      rows: [] as typeof history,
      newLanes: 0,
      newLiftsList: [] as Types.MaxHistoryEntry[],
      carriedRows: [] as Types.MaxHistoryEntry[],
    };
    if (!currentProgramStart) return empty;
    const start = (() => {
      const s = currentProgramStart.trim();
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00") : null;
      if (iso && !Number.isNaN(iso.getTime())) return iso;
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
      if (!m) return null;
      let y = m[3];
      if (y.length === 2) y = (parseInt(y, 10) >= 50 ? "19" : "20") + y;
      const d = new Date(`${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}T00:00:00`);
      return Number.isNaN(d.getTime()) ? null : d;
    })();
    if (!start) return empty;
    const end = (() => {
      if (!currentProgramEnd) return new Date(start.getTime() + 60 * 86400_000);
      const s = currentProgramEnd.trim();
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00") : null;
      if (iso && !Number.isNaN(iso.getTime())) return iso;
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
      if (!m) return new Date(start.getTime() + 60 * 86400_000);
      let y = m[3];
      if (y.length === 2) y = (parseInt(y, 10) >= 50 ? "19" : "20") + y;
      const d = new Date(`${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}T00:00:00`);
      return Number.isNaN(d.getTime()) ? new Date(start.getTime() + 60 * 86400_000) : d;
    })();
    const startMs = start.getTime() - 86400_000;
    const endMs = end.getTime() + 86400_000;
    // Carry-over: PRs earned in the 14d before this block stay visible for
    // the first 14d of the new block, then fade out.
    const CARRY_DAYS = 14;
    const carryMs = CARRY_DAYS * 86400_000;
    const carryActive = nowMs <= start.getTime() + carryMs;
    const carryStart = start.getTime() - carryMs;

    
    
    
    
    
    const earliestByLane = new Map<string, number>();
    for (const h of history) {
      if (h.lift.toLowerCase() === "accessory") continue;
      if (h.lift.toLowerCase() === "total") continue;
      if (h.reps == null || h.exercise_name == null) continue;
      const key = `${h.lift}|${h.exercise_name}|${h.reps}`;
      const t = new Date(h.recorded_at).getTime();
      const cur = earliestByLane.get(key);
      if (cur == null || t < cur) earliestByLane.set(key, t);
    }
    const newLaneKeys = new Set<string>();
    for (const [key, earliest] of earliestByLane.entries()) {
      if (earliest >= startMs) newLaneKeys.add(key);
    }

    const inRange = history.filter((h) => {
      if (h.lift.toLowerCase() === "accessory") return false;
      const isTotal = h.lift.toLowerCase() === "total";

      if (!isTotal && (h.reps == null || h.exercise_name == null)) return false;

      if (h.old_value == null) return false;

      // Comp Match rows tie the prior value (training rep matched the
      // comp PR), so allow them through the strict greater-than gate.
      // Everything else still has to be a real improvement.
      const isCompMatch = h.source === "comp_match";
      if (!isCompMatch && h.new_value <= h.old_value) return false;

      if (!isTotal) {
        const key = `${h.lift}|${h.exercise_name}|${h.reps}`;
        if (newLaneKeys.has(key)) return false;
      }
      const t = new Date(h.recorded_at).getTime();
      return t >= startMs && t <= endMs;
    });
    
    
    const best = new Map<string, typeof inRange[number]>();
    for (const h of inRange) {
      const key = h.lift === "total"
        ? "total"
        : `${h.lift}|${h.exercise_name}|${h.reps}`;
      const existing = best.get(key);
      if (!existing || h.new_value > existing.new_value) best.set(key, h);
    }
    const rows = Array.from(best.values()).sort(
      (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
    );

    
    
    


    const bestNewByLane = new Map<string, Types.MaxHistoryEntry>();
    for (const h of history) {
      if (h.reps == null || h.exercise_name == null) continue;
      const key = `${h.lift}|${h.exercise_name}|${h.reps}`;
      if (!newLaneKeys.has(key)) continue;
      const t = new Date(h.recorded_at).getTime();
      if (t < startMs || t > endMs) continue;
      const existing = bestNewByLane.get(key);
      if (!existing || h.new_value > existing.new_value) {
        bestNewByLane.set(key, h);
      }
    }
    const liftRank: Record<string, number> = { squat: 0, bench: 1, deadlift: 2 };
    const newLiftsList = Array.from(bestNewByLane.values()).sort((a, b) => {
      const ar = liftRank[a.lift.toLowerCase()] ?? 99;
      const br = liftRank[b.lift.toLowerCase()] ?? 99;
      if (ar !== br) return ar - br;
      const ax = (a.exercise_name ?? "").localeCompare(b.exercise_name ?? "");
      if (ax !== 0) return ax;
      return (a.reps ?? 0) - (b.reps ?? 0);
    });

    const carriedBest = new Map<string, Types.MaxHistoryEntry>();
    if (carryActive) {
      for (const h of history) {
        if (h.lift.toLowerCase() === "accessory") continue;
        const isTotal = h.lift.toLowerCase() === "total";
        if (!isTotal && (h.reps == null || h.exercise_name == null)) continue;
        if (h.old_value == null) continue;
        const isCompMatch = h.source === "comp_match";
        if (!isCompMatch && h.new_value <= h.old_value) continue;
        const t = new Date(h.recorded_at).getTime();
        if (t < carryStart || t >= start.getTime()) continue;
        const key = isTotal ? "total" : `${h.lift}|${h.exercise_name}|${h.reps}`;
        const existing = carriedBest.get(key);
        if (!existing || h.new_value > existing.new_value) carriedBest.set(key, h);
      }
    }
    const carriedRows = Array.from(carriedBest.values()).sort(
      (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
    );

    return { rows, newLanes: newLiftsList.length, newLiftsList, carriedRows };
  }, [history, currentProgramStart, currentProgramEnd, nowMs]);

  const blockPRs = blockPRsResult.rows;
  const newLifts = blockPRsResult.newLanes;
  const newLiftsList = blockPRsResult.newLiftsList;
  const carriedPRs = blockPRsResult.carriedRows;
  const [showNewLifts, setShowNewLifts] = useState(false);

  if (dismissed || !currentProgramId) return null;

  if (blockPRs.length === 0 && newLifts === 0 && carriedPRs.length === 0) return null;

  const shown = blockPRs.slice(0, 5);
  const extra = blockPRs.length - shown.length;

  return (
    <>
    <div
      className="mb-6 p-4 rounded-md border flex items-start gap-3"
      style={{
        background: "rgba(251, 191, 36, 0.1)",
        borderColor: "rgba(251, 191, 36, 0.35)",
      }}
    >
      <Trophy className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#fcd34d" }} />
      <div className="flex-1 min-w-0">
        <div className="cloud-text font-semibold" style={{ fontSize: 13 }}>
          {blockPRs.length > 0 ? (
            <>
              {`${blockPRs.length} new PR${blockPRs.length === 1 ? "" : "s"} this block`}
              {carriedPRs.length > 0 && (
                <span className="cloud-text-dim font-normal" style={{ marginLeft: 6, fontSize: 12 }}>
                  · +{carriedPRs.length} from last block
                </span>
              )}
            </>
          ) : carriedPRs.length > 0 ? (
            `${carriedPRs.length} PR${carriedPRs.length === 1 ? "" : "s"} from last block`
          ) : (
            <button
              type="button"
              onClick={() => setShowNewLifts((v) => !v)}
              title="Click to see which exercises debuted this block."
              className="font-semibold underline decoration-dotted underline-offset-2 transition-colors"
              style={{ color: "#fcd34d" }}
            >
              {showNewLifts ? "− " : "+ "}{newLifts} new lift{newLifts === 1 ? "" : "s"} established this block
            </button>
          )}
        </div>
        <div className="mt-1.5 space-y-0.5">
          {shown.map((pr) => {
            const repLabel = pr.reps != null ? `${pr.reps}RM` : pr.lift === "total" ? "Total" : "";
            const name = pr.exercise_name ?? pr.lift.charAt(0).toUpperCase() + pr.lift.slice(1);
            const weight = formatWeight(pr.new_value, unit, { decimals: 0 });
            const isCompMatch = pr.source === "comp_match";
            const deltaLbs = pr.old_value != null ? pr.new_value - pr.old_value : null;
            const delta =
              !isCompMatch && deltaLbs != null
                ? ` (+${Math.round(convertWeight(deltaLbs, unit))} ${unit})`
                : "";
            return (
              <button
                key={pr.id}
                type="button"
                onClick={() => setSelectedPR(pr)}
                title={isCompMatch ? "Matched competition PR in training" : "See full progression"}
                className="cloud-text-muted block text-left w-full rounded px-1 -mx-1 py-0.5 transition-colors hover:bg-[rgba(251,191,36,0.1)]"
                style={{ fontSize: 12 }}
              >
                <span className="cloud-text font-medium">{name}</span>
                {repLabel && <span className="ml-1.5" style={{ color: "#fcd34d" }}>· {repLabel}</span>}
                <span className="ml-1.5">
                  {weight}
                  {pr.reps != null && pr.reps > 1 ? ` × ${pr.reps}` : ""}
                </span>
                {isCompMatch ? (
                  <span className="ml-1" style={{ color: "#fcd34d", fontSize: 11, fontWeight: 500 }}>
                    · Comp Match
                  </span>
                ) : (
                  delta && <span className="ml-1" style={{ color: "#86efac", fontSize: 11 }}>{delta}</span>
                )}
              </button>
            );
          })}
          {extra > 0 && (
            <div className="cloud-text-dim" style={{ fontSize: 11 }}>
              + {extra} more — see PR History below
            </div>
          )}
          {carriedPRs.map((pr) => {
            const repLabel = pr.reps != null ? `${pr.reps}RM` : pr.lift === "total" ? "Total" : "";
            const name = pr.exercise_name ?? pr.lift.charAt(0).toUpperCase() + pr.lift.slice(1);
            const weight = formatWeight(pr.new_value, unit, { decimals: 0 });
            return (
              <button
                key={`carried-${pr.id}`}
                type="button"
                onClick={() => setSelectedPR(pr)}
                title="Earned in the previous block — still showing for the first 14 days of this one"
                className="cloud-text-muted block text-left w-full rounded px-1 -mx-1 py-0.5 transition-colors hover:bg-[rgba(251,191,36,0.1)]"
                style={{ fontSize: 12, opacity: 0.78 }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.78"; }}
              >
                <span className="cloud-text font-medium">{name}</span>
                <span
                  className="ml-1.5"
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    padding: "0.05rem 0.3rem",
                    borderRadius: "0.25rem",
                    backgroundColor: "rgba(148, 163, 184, 0.12)",
                    color: "var(--cloud-text-dim)",
                    border: "1px solid rgba(148, 163, 184, 0.3)",
                  }}
                >
                  Last block
                </span>
                {repLabel && <span className="ml-1.5" style={{ color: "#fcd34d" }}>· {repLabel}</span>}
                <span className="ml-1.5">
                  {weight}
                  {pr.reps != null && pr.reps > 1 ? ` × ${pr.reps}` : ""}
                </span>
              </button>
            );
          })}
          {newLifts > 0 && blockPRs.length > 0 && (
            <button
              type="button"
              onClick={() => setShowNewLifts((v) => !v)}
              title="Click to see which exercises debuted this block."
              className="cloud-text-dim italic mt-1 underline decoration-dotted underline-offset-2 transition-colors text-left block hover:text-[#fcd34d]"
              style={{ fontSize: 11 }}
            >
              {showNewLifts ? "− " : "+ "}{newLifts} new lift{newLifts === 1 ? "" : "s"} established this block
            </button>
          )}
          {showNewLifts && newLifts > 0 && (
            <div className="mt-1.5 ml-3 space-y-0.5">
              {newLiftsList.map((pr) => {
                const liftTint: Record<string, string> = {
                  squat: "#fb923c",
                  bench: "#22d3ee",
                  deadlift: "#a78bfa",
                };
                const cat = pr.lift.toLowerCase();
                const repLabel = pr.reps != null ? `${pr.reps}RM` : null;
                const weight = formatWeight(pr.new_value, unit, { decimals: 0 });
                return (
                  <button
                    key={pr.id}
                    type="button"
                    onClick={() => setSelectedPR(pr)}
                    title="See full progression"
                    className="cloud-text-muted block text-left w-full rounded px-1 -mx-1 py-0.5 transition-colors hover:bg-[rgba(251,191,36,0.1)]"
                    style={{ fontSize: 11, opacity: 0.78 }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.78"; }}
                  >
                    <span
                      className="font-semibold capitalize"
                      style={{ color: liftTint[cat] ?? "var(--cloud-text-dim)" }}
                    >
                      {pr.lift}
                    </span>
                    {repLabel && (
                      <span className="ml-1.5 cloud-text-dim">· {repLabel}</span>
                    )}
                    <span className="ml-1.5 cloud-text">
                      {weight}
                      {pr.reps != null && pr.reps > 1 ? ` × ${pr.reps}` : ""}
                    </span>
                    {pr.exercise_name && (
                      <span className="ml-1.5 cloud-text-dim">{pr.exercise_name}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <button
        onClick={() => {
          if (!storageKey) return;
          try {
            window.localStorage.setItem(storageKey, "1");
          } catch {}
          setDismissed(true);
        }}
        className="shrink-0 font-medium transition-colors hover:text-[#fef3c7]"
        style={{ color: "#fcd34d", fontSize: 11 }}
        title="Dismiss"
      >
        Dismiss
      </button>
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
    </>
  );
}
