"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api";
import * as Types from "@/lib/types";
import PRDetailModal from "@/components/PRDetailModal";
import type { WeightUnit } from "@/lib/units";


const LIFT_COLORS: Record<string, string> = {
  squat: "#fb923c", 
  bench: "#22d3ee", 
  deadlift: "#a78bfa", 
};

const LIFT_ORDER = ["squat", "bench", "deadlift"];


interface BlockReviewSummaryProps {
  athleteId: number;
  
  programId?: number;
  
  context?: "queue" | "profile";
  
  athleteName?: string | null;
  
  unit?: WeightUnit;
}


function parseDateLoose(s: string | null): Date | null {
  if (!s) return null;
  const trimmed = s.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? new Date(trimmed + "T00:00:00") : null;
  if (iso && !Number.isNaN(iso.getTime())) return iso;
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(trimmed);
  if (slash) {
    const mm = slash[1].padStart(2, "0");
    const dd = slash[2].padStart(2, "0");
    let yyyy = slash[3];
    if (yyyy.length === 2) {
      const n = parseInt(yyyy, 10);
      yyyy = n >= 50 ? `19${yyyy}` : `20${yyyy}`;
    }
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function volumeTrend(
  points: Types.VolumeDataPoint[],
  key: "squat_volume" | "bench_volume" | "deadlift_volume"
): { trend: "up" | "down" | "steady"; pct: number } {
  const vals = points.map((p) => (p[key] as number) ?? 0).filter((v) => v > 0);
  if (vals.length < 2) return { trend: "steady", pct: 0 };
  const half = Math.ceil(vals.length / 2);
  const firstHalf = vals.slice(0, half);
  const secondHalf = vals.slice(half);
  const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
  if (avgFirst === 0) return { trend: "steady", pct: 0 };
  const pct = Math.round(((avgSecond - avgFirst) / avgFirst) * 100);
  const trend = pct > 5 ? "up" : pct < -5 ? "down" : "steady";
  return { trend, pct };
}

function TrendIndicator({ trend, pct }: { trend: string; pct: number }) {
  
  
  
  
  const color =
    trend === "up" ? "#86efac" : trend === "down" ? "#fca5a5" : "var(--cloud-text-dim)";
  const arrow = trend === "up" ? "\u2191" : trend === "down" ? "\u2193" : "\u2192";
  return (
    <span style={{ color, fontWeight: 600, fontSize: 12 }}>
      {arrow} {Math.abs(pct)}%
    </span>
  );
}


export default function BlockReviewSummary({
  athleteId,
  programId: programIdProp,
  context = "profile",
  athleteName,
  unit = "lbs",
}: BlockReviewSummaryProps) {
  const isQueue = context === "queue";
  const [selectedPR, setSelectedPR] = useState<Types.MaxHistoryEntry | null>(null);

  
  const { data: programs } = useQuery({
    queryKey: ["programs", athleteId],
    queryFn: () => apiClient.listPrograms(athleteId),
    enabled: !programIdProp,
  });

  const currentProgram = useMemo(() => {
    if (programIdProp && programs) {
      return programs.find((p) => p.id === programIdProp) ?? null;
    }
    if (!programs || programs.length === 0) return null;
    
    return programs.reduce((best, p) =>
      (p.program_number ?? 0) > (best.program_number ?? 0) ? p : best
    );
  }, [programs, programIdProp]);

  const programId = programIdProp ?? currentProgram?.id;

  
  const { data: e1rmData } = useQuery({
    queryKey: ["block-review-e1rm", athleteId, programId],
    queryFn: () =>
      apiClient.getE1RMTrends(athleteId, { programId: programId! }),
    enabled: !!programId,
  });

  
  const { data: volumeData } = useQuery({
    queryKey: ["block-review-volume", athleteId, programId],
    queryFn: () => apiClient.getVolumeTrends(athleteId, programId!),
    enabled: !!programId,
  });

  
  const { data: rpeData } = useQuery({
    queryKey: ["block-review-rpe", athleteId, programId],
    queryFn: () => apiClient.getRPECompliance(athleteId, programId!),
    enabled: !!programId,
  });

  
  
  
  const { data: prData } = useQuery({
    queryKey: ["max-history", athleteId],
    queryFn: () => apiClient.getMaxHistory(athleteId),
    enabled: !!programId,
  });

  
  
  

  
  const peaks = useMemo(() => {
    if (!e1rmData?.length) return [];
    const peakMap = new Map<string, Types.E1RMDataPoint>();
    for (const dp of e1rmData) {
      const cat = dp.lift_category.toLowerCase();
      if (cat === "accessory") continue;
      const existing = peakMap.get(cat);
      if (!existing || dp.weight_lbs > existing.weight_lbs) {
        peakMap.set(cat, dp);
      }
    }
    return LIFT_ORDER
      .filter((l) => peakMap.has(l))
      .map((l) => peakMap.get(l)!);
  }, [e1rmData]);

  
  const volTrends = useMemo(() => {
    if (!volumeData?.length) return null;
    return {
      squat: volumeTrend(volumeData, "squat_volume"),
      bench: volumeTrend(volumeData, "bench_volume"),
      deadlift: volumeTrend(volumeData, "deadlift_volume"),
    };
  }, [volumeData]);

  
  const rpeBlock = useMemo(() => {
    if (!rpeData) return null;
    
    
    if (rpeData.enabled === false) return null;
    if (programId && rpeData.by_program?.length) {
      const match = rpeData.by_program.find((p) => p.program_id === programId);
      if (match) return match;
    }
    
    return {
      fill_rate_pct: rpeData.fill_rate_pct,
      avg_rpe_diff: rpeData.avg_rpe_diff,
      overshoot_count: rpeData.overshoot_count,
      undershoot_count: rpeData.undershoot_count,
      on_target_count: rpeData.on_target_count,
      total_entries: rpeData.total_entries,
    };
  }, [rpeData, programId]);

  
  
  
  
  
  
  
  
  
  
  const blockPRsResult = useMemo(() => {
    const empty = {
      rows: [] as Types.MaxHistoryEntry[],
      newLanes: 0,
      newLiftsList: [] as Array<{ lift: string; exercise: string; reps: number[] }>,
    };
    if (!prData?.length || !currentProgram) return empty;
    const programStart = parseDateLoose(currentProgram.date_start ?? null);
    const programEnd = parseDateLoose(currentProgram.date_end ?? null);
    if (!programStart) return empty;
    const start = programStart.getTime();
    const end = (programEnd ?? new Date(programStart.getTime() + 60 * 86400_000)).getTime();
    const startWindow = start - 86400_000;
    const endWindow = end + 86400_000;

    
    
    
    
    
    
    const earliestByLane = new Map<string, number>();
    for (const pr of prData) {
      if (pr.lift.toLowerCase() === "accessory") continue;
      if (pr.lift.toLowerCase() === "total") continue;
      if (pr.reps == null || pr.exercise_name == null) continue;
      const key = `${pr.lift}|${pr.exercise_name}|${pr.reps}`;
      const t = new Date(pr.recorded_at).getTime();
      const cur = earliestByLane.get(key);
      if (cur == null || t < cur) earliestByLane.set(key, t);
    }

    
    
    
    const newLaneKeys = new Set<string>();
    for (const [key, earliest] of earliestByLane.entries()) {
      if (earliest >= startWindow) newLaneKeys.add(key);
    }

    const inRange = prData.filter((pr) => {
      if (pr.lift.toLowerCase() === "accessory") return false;
      const isTotal = pr.lift.toLowerCase() === "total";
      
      if (!isTotal && (pr.reps == null || pr.exercise_name == null)) return false;
      
      
      
      if (pr.old_value == null) return false;
      
      if (pr.new_value <= pr.old_value) return false;
      
      
      
      if (!isTotal) {
        const key = `${pr.lift}|${pr.exercise_name}|${pr.reps}`;
        if (newLaneKeys.has(key)) return false;
      }
      const t = new Date(pr.recorded_at).getTime();
      return t >= startWindow && t <= endWindow;
    });

    
    
    const best = new Map<string, typeof inRange[number]>();
    for (const pr of inRange) {
      const key = pr.lift === "total"
        ? "total"
        : `${pr.lift}|${pr.exercise_name}|${pr.reps}`;
      const existing = best.get(key);
      if (!existing || pr.new_value > existing.new_value) {
        best.set(key, pr);
      }
    }
    const rows = Array.from(best.values()).sort(
      (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
    );

    
    
    
    
    const newLiftsMap = new Map<string, { lift: string; exercise: string; reps: number[] }>();
    for (const key of newLaneKeys) {
      const parts = key.split("|");
      if (parts.length < 3) continue;
      const [lift, exercise, repsStr] = parts;
      const reps = parseInt(repsStr, 10);
      if (Number.isNaN(reps)) continue;
      const eKey = `${lift}|${exercise}`;
      const existing = newLiftsMap.get(eKey);
      if (existing) {
        existing.reps.push(reps);
      } else {
        newLiftsMap.set(eKey, { lift, exercise, reps: [reps] });
      }
    }
    const newLiftsList = Array.from(newLiftsMap.values()).map((item) => ({
      ...item,
      reps: item.reps.slice().sort((a, b) => a - b),
    }));
    return { rows, newLanes: newLiftsList.length, newLiftsList };
  }, [prData, currentProgram]);

  const blockPRs = blockPRsResult.rows;
  const newLifts = blockPRsResult.newLanes;
  const newLiftsList = blockPRsResult.newLiftsList;
  const [showNewLifts, setShowNewLifts] = useState(false);
  const [showAllPRs, setShowAllPRs] = useState(false);
  const PR_CAP = 5;
  const visiblePRs = showAllPRs ? blockPRs : blockPRs.slice(0, PR_CAP);
  const hiddenPRCount = Math.max(0, blockPRs.length - PR_CAP);

  
  const weekCount = useMemo(() => {
    if (!volumeData?.length) return currentProgram?.session_count ? null : null;
    const weeks = new Set(volumeData.map((v) => v.week_number));
    return weeks.size;
  }, [volumeData, currentProgram]);

  
  
  

  if (!programId || !currentProgram) return null;
  
  if (!e1rmData) return null;
  
  if (peaks.length === 0 && !volTrends && !rpeBlock) return null;

  
  const microLabel = {
    fontSize: 10,
    fontWeight: 500,
    color: "var(--cloud-text-dim)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    margin: "0 0 0.5rem 0",
  };
  
  
  const statTile = {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid var(--cloud-border)",
    borderRadius: "var(--cloud-r-sm)",
  };

  return (
    <div
      className={isQueue ? undefined : "cloud-panel"}
      style={{
        padding: isQueue ? 0 : "var(--cloud-s5)",
        width: "100%",
        background: isQueue ? "transparent" : undefined,
        border: isQueue ? "none" : undefined,
      }}
    >
      {}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "0.75rem",
          marginBottom: "1rem",
          paddingBottom: "0.75rem",
          borderBottom: "1px solid var(--cloud-border)",
        }}
      >
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          <h3
            style={{
              fontSize: isQueue ? 14 : 16,
              fontWeight: 600,
              color: "var(--cloud-text)",
              letterSpacing: "-0.01em",
              margin: 0,
            }}
          >
            Current Block Review
          </h3>
          <p
            style={{
              fontSize: 12,
              color: "var(--cloud-text-muted)",
              margin: "0.25rem 0 0 0",
            }}
          >
            P{currentProgram.program_number}
            {currentProgram.program_name
              ? ` \u00b7 ${currentProgram.program_name}`
              : ""}
            {weekCount ? ` \u00b7 ${weekCount} weeks` : ""}
          </p>
        </div>
        {currentProgram.block_type && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "0.2rem 0.5rem",
              borderRadius: "999px",
              backgroundColor: "rgba(12, 92, 171, 0.18)",
              color: "#93c5fd",
              border: "1px solid rgba(12, 92, 171, 0.35)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {currentProgram.block_type}
          </span>
        )}
      </div>

      {}
      {peaks.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <p style={microLabel}>Top-Set Peaks</p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            {peaks.map((p) => {
              const cat = p.lift_category.toLowerCase();
              const liftColor = LIFT_COLORS[cat] || "var(--cloud-text-dim)";
              return (
                <div
                  key={cat}
                  style={{
                    ...statTile,
                    flex: "1 1 0",
                    minWidth: "100px",
                    padding: "0.625rem 0.75rem",
                    borderLeft: `3px solid ${liftColor}`,
                  }}
                >
                  <p
                    style={{
                      fontSize: 10,
                      color: liftColor,
                      fontWeight: 600,
                      margin: 0,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {cat}
                  </p>
                  <p
                    style={{
                      fontSize: 18,
                      fontWeight: 600,
                      color: "var(--cloud-text)",
                      letterSpacing: "-0.01em",
                      margin: "0.15rem 0 0 0",
                      lineHeight: 1.1,
                    }}
                  >
                    {Math.round(p.weight_lbs)}
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--cloud-text-muted)",
                      }}
                    >
                      {" "}
                      x{p.reps}
                    </span>
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--cloud-text-dim)",
                      margin: "0.15rem 0 0 0",
                    }}
                  >
                    {p.exercise_name} &middot; W{p.week_number}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {}
      {volTrends && (
        <div style={{ marginBottom: "1rem" }}>
          <p style={microLabel}>Volume Trends</p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {LIFT_ORDER.map((lift) => {
              const data = volTrends[lift as keyof typeof volTrends];
              if (!data) return null;
              return (
                <div
                  key={lift}
                  style={{
                    ...statTile,
                    flex: "1 1 0",
                    minWidth: "90px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.5rem 0.625rem",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: LIFT_COLORS[lift],
                      textTransform: "capitalize",
                    }}
                  >
                    {lift}
                  </span>
                  <TrendIndicator trend={data.trend} pct={data.pct} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        {}
        {rpeBlock && (
          <div
            style={{
              ...statTile,
              flex: "1 1 180px",
              padding: "0.625rem 0.75rem",
            }}
          >
            <p style={{ ...microLabel, margin: "0 0 0.375rem 0" }}>RPE Compliance</p>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "0.5rem",
                marginBottom: "0.25rem",
              }}
            >
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                  color:
                    rpeBlock.fill_rate_pct >= 80
                      ? "#86efac"
                      : rpeBlock.fill_rate_pct >= 60
                      ? "#fcd34d"
                      : "#fca5a5",
                }}
              >
                {Math.round(rpeBlock.fill_rate_pct)}%
              </span>
              <span style={{ fontSize: 10, color: "var(--cloud-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                fill rate
              </span>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", fontSize: 11 }}>
              <span style={{ color: "var(--cloud-text-dim)" }}>
                Avg diff:{" "}
                <span
                  style={{
                    color:
                      rpeBlock.avg_rpe_diff > 0.5
                        ? "#fca5a5"
                        : rpeBlock.avg_rpe_diff > 0
                        ? "#fcd34d"
                        : "#86efac",
                    fontWeight: 600,
                  }}
                >
                  {rpeBlock.avg_rpe_diff > 0 ? "+" : ""}
                  {rpeBlock.avg_rpe_diff.toFixed(1)}
                </span>
              </span>
            </div>
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                fontSize: 11,
                marginTop: "0.25rem",
                color: "var(--cloud-text-dim)",
              }}
            >
              <span>{rpeBlock.on_target_count} on target</span>
              <span>&middot;</span>
              <span>{rpeBlock.overshoot_count} over</span>
              <span>&middot;</span>
              <span>{rpeBlock.undershoot_count} under</span>
            </div>
          </div>
        )}

        {}
        <div
          style={{
            ...statTile,
            flex: "1 1 180px",
            padding: "0.625rem 0.75rem",
          }}
        >
          <p style={{ ...microLabel, margin: "0 0 0.375rem 0" }}>PRs This Block</p>
          {blockPRs.length === 0 ? (
            <div>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--cloud-text-dim)",
                  margin: 0,
                }}
              >
                No PRs recorded
              </p>
              {newLifts > 0 && (
                <NewLiftsFootnote
                  count={newLifts}
                  list={newLiftsList}
                  expanded={showNewLifts}
                  onToggle={() => setShowNewLifts((v) => !v)}
                />
              )}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.3rem",
              }}
            >
              {visiblePRs.map((pr) => {
                const cat = pr.lift.toLowerCase();
                const repLabel = pr.reps != null ? `${pr.reps}RM` : cat === "total" ? "Total" : null;
                return (
                  <button
                    key={pr.id}
                    type="button"
                    onClick={() => setSelectedPR(pr)}
                    title="See full progression"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                      background: "none",
                      border: "none",
                      padding: "0.15rem 0.25rem",
                      margin: "-0.15rem -0.25rem",
                      borderRadius: "0.25rem",
                      cursor: "pointer",
                      color: "inherit",
                      textAlign: "left",
                      width: "calc(100% + 0.5rem)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <span style={{ fontSize: 13 }}>&#127942;</span>
                    <span
                      style={{
                        fontSize: 12,
                        color: LIFT_COLORS[cat] || "var(--cloud-text-dim)",
                        fontWeight: 600,
                        textTransform: "capitalize",
                      }}
                    >
                      {cat}
                    </span>
                    {repLabel && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: "0.04em",
                          padding: "0.05rem 0.3rem",
                          borderRadius: "0.25rem",
                          backgroundColor: "rgba(245, 158, 11, 0.15)",
                          color: "#fcd34d",
                          border: "1px solid rgba(245, 158, 11, 0.3)",
                        }}
                      >
                        {repLabel}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 13,
                        color: "var(--cloud-text)",
                        fontWeight: 600,
                      }}
                    >
                      {Math.round(pr.new_value)}
                      {pr.reps != null && pr.reps > 1 ? ` × ${pr.reps}` : ""}
                    </span>
                    {pr.exercise_name && (
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--cloud-text-dim)",
                          flex: "1 1 auto",
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={pr.exercise_name}
                      >
                        {pr.exercise_name}
                      </span>
                    )}
                  </button>
                );
              })}
              {hiddenPRCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllPRs((v) => !v)}
                  className="cloud-text-dim italic underline decoration-dotted underline-offset-2 transition-colors text-left hover:text-[#fcd34d]"
                  style={{
                    fontSize: 11,
                    background: "none",
                    border: "none",
                    padding: "0.05rem 0",
                    marginTop: "0.15rem",
                    cursor: "pointer",
                  }}
                >
                  {showAllPRs
                    ? "− Show less"
                    : `+ ${hiddenPRCount} more PR${hiddenPRCount === 1 ? "" : "s"}`}
                </button>
              )}
              {newLifts > 0 && (
                <NewLiftsFootnote
                  count={newLifts}
                  list={newLiftsList}
                  expanded={showNewLifts}
                  onToggle={() => setShowNewLifts((v) => !v)}
                />
              )}
            </div>
          )}
        </div>
      </div>
      <PRDetailModal
        open={!!selectedPR}
        onClose={() => setSelectedPR(null)}
        pr={selectedPR}
        allHistory={prData ?? []}
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


function NewLiftsFootnote({
  count,
  list,
  expanded,
  onToggle,
}: {
  count: number;
  list: Array<{ lift: string; exercise: string; reps: number[] }>;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ marginTop: "0.35rem" }}>
      <button
        type="button"
        onClick={onToggle}
        title="The athlete's first time on these (lift, exercise, reps) lanes. Click to see which exercises debuted."
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontSize: 11,
          fontStyle: "italic",
          color: "var(--cloud-text-dim)",
          textDecoration: "underline",
          textDecorationStyle: "dotted",
          textUnderlineOffset: "2px",
        }}
      >
        {expanded ? "− " : "+ "}{count} new lift{count === 1 ? "" : "s"} established this block
      </button>
      {expanded && (
        <ul
          style={{
            listStyle: "none",
            padding: "0.35rem 0 0 0.75rem",
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.2rem",
          }}
        >
          {list.map((item) => (
            <li
              key={`${item.lift}|${item.exercise}`}
              style={{
                fontSize: 11,
                color: "var(--cloud-text-muted)",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  color: LIFT_COLORS[item.lift.toLowerCase()] ?? "var(--cloud-text-dim)",
                  fontWeight: 600,
                  textTransform: "capitalize",
                }}
              >
                {item.lift}
              </span>
              <span style={{ color: "var(--cloud-text)" }}>{item.exercise}</span>
              <span style={{ color: "var(--cloud-text-dim)" }}>
                ({item.reps.map((r) => `${r}RM`).join(", ")})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
