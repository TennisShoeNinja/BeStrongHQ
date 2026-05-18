"use client";

import { useState, useMemo, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Trophy, ChevronDown, ChevronRight } from "lucide-react";
import apiClient from "@/lib/api";
import * as Types from "@/lib/types";
import { convertWeight, formatWeight, type WeightUnit } from "@/lib/units";
import { useTheme } from "@/lib/theme-provider";
import { EmptyState } from "@/components/empty-state";
import { groupMeetResults, formatMeetDate, formatPlace } from "./utils";


export function MeetHistoryCard({
  athleteId,
  athlete,
  unit,
}: {
  athleteId: number;
  athlete: Types.AthleteResponse;
  unit: WeightUnit;
}) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["meet-results", athleteId],
    queryFn: () => apiClient.listMeetResults(athleteId),
    enabled: !!athlete,
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const groups = useMemo(() => groupMeetResults(rows), [rows]);

  const { resolvedMode } = useTheme();
  const chartGrid = resolvedMode === "dark" ? "rgba(255,255,255,0.06)" : "#e2e8f0";
  const chartText = resolvedMode === "dark" ? "rgba(250,250,250,0.5)" : "#64748b";
  const chartTooltipBg = resolvedMode === "dark" ? "#09090b" : "#ffffff";
  const chartTooltipBorder = resolvedMode === "dark" ? "rgba(255,255,255,0.18)" : "#e2e8f0";
  const chartLine = "#22d3ee";

  const [scorePrimary, setScorePrimary] = useState<"gl" | "dots">("gl");

  const totalsChartData = useMemo(() => {
    const points: Array<{
      ts: number;
      total: number;
      dots: number | null;
      gl: number | null;
      meet: string;
    }> = [];
    for (const g of groups) {
      if (!g.meet_date) continue;
      const parts = g.meet_date.split("-");
      if (parts.length !== 3) continue;
      const [y, m, d] = parts.map(Number);
      if (!y || !m || !d) continue;
      const ts = new Date(y, m - 1, d).getTime();
      if (!Number.isFinite(ts)) continue;

      const bestByLift: Record<string, number> = {};
      let dots: number | null = null;
      let gl: number | null = null;
      for (const r of g.rows) {
        if (!r.made) continue;
        const cur = bestByLift[r.lift];
        if (cur == null || r.weight_lbs > cur) bestByLift[r.lift] = r.weight_lbs;
        if (dots == null && r.dots_score != null) dots = r.dots_score;
        if (gl == null && r.gl_points != null) gl = r.gl_points;
      }
      const totalLbs =
        (bestByLift.squat ?? 0) +
        (bestByLift.bench ?? 0) +
        (bestByLift.deadlift ?? 0);
      if (totalLbs <= 0) continue;

      points.push({
        ts,
        total: Number(convertWeight(totalLbs, unit).toFixed(1)),
        dots: dots != null ? Number(dots.toFixed(2)) : null,
        gl: gl != null ? Number(gl.toFixed(2)) : null,
        meet: g.meet_name ?? "Meet",
      });
    }
    return points.sort((a, b) => a.ts - b.ts);
  }, [groups, unit]);

  const bestDots = useMemo(() => {
    let max = 0;
    for (const p of totalsChartData) {
      if (p.dots != null && p.dots > max) max = p.dots;
    }
    return max > 0 ? max : null;
  }, [totalsChartData]);

  const bestGl = useMemo(() => {
    let max = 0;
    for (const p of totalsChartData) {
      if (p.gl != null && p.gl > max) max = p.gl;
    }
    return max > 0 ? max : null;
  }, [totalsChartData]);

  const bestTotalDisplay = useMemo(() => {
    let max = 0;
    for (const p of totalsChartData) {
      if (p.total > max) max = p.total;
    }
    return max > 0 ? max : null;
  }, [totalsChartData]);

  // Per-group total in lbs, indexed the same as `groups` (which is sorted
  // newest-first). Used by the meet-history rows to compute a delta vs.
  // the prior chronological meet (groups[idx + 1] is the previous one).
  const groupTotalsLbs = useMemo(() => {
    return groups.map((g) => {
      const best: Record<string, number> = {};
      for (const r of g.rows) {
        if (!r.made) continue;
        const cur = best[r.lift];
        if (cur == null || r.weight_lbs > cur) best[r.lift] = r.weight_lbs;
      }
      return (best.squat ?? 0) + (best.bench ?? 0) + (best.deadlift ?? 0);
    });
  }, [groups]);

  // Default to GL primary when both exist; if only one is available, force
  // it as the primary so the user can't toggle to a missing value.
  const effectivePrimary: "gl" | "dots" =
    bestGl == null ? "dots" : bestDots == null ? "gl" : scorePrimary;
  const canToggleScore = bestGl != null && bestDots != null;

  if (isLoading) {
    return (
      <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
        <div className="cloud-panel-head">
          <h2>Meet History</h2>
        </div>
        <div className="cloud-text-muted" style={{ padding: "var(--cloud-s4)", fontSize: 13 }}>
          Loading meet history...
        </div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
        <div className="cloud-panel-head">
          <h2>Meet History</h2>
        </div>
        <div style={{ padding: "var(--cloud-s4)" }}>
          <EmptyState
            icon={Trophy}
            iconTone="muted"
            body="No meet history yet. Use the three-dot menu above to link this athlete's OpenPowerlifting profile and their meet history will populate here."
          />
        </div>
      </div>
    );
  }

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
      <div className="cloud-panel-head">
        <h2>Meet History</h2>
        <span className="cloud-text-muted" style={{ fontSize: 12 }}>
          {groups.length} meet{groups.length === 1 ? "" : "s"}
        </span>
      </div>
      {totalsChartData.length >= 2 && (
        <div style={{ padding: "var(--cloud-s4) var(--cloud-s4) 0" }}>
          <div className="flex items-start justify-between mb-2 gap-3 flex-wrap">
            <div
              className="cloud-text-dim"
              style={{
                fontSize: 10,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                fontWeight: 500,
              }}
            >
              Total progression
            </div>
            {bestTotalDisplay != null && (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  <span
                    className="cloud-text-dim"
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      fontWeight: 500,
                    }}
                  >
                    Best Total
                  </span>
                  <span
                    className="cloud-text font-semibold"
                    style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}
                  >
                    {Math.round(bestTotalDisplay)} {unit}
                  </span>
                </div>
                {(bestDots != null || bestGl != null) && (
                  <button
                    type="button"
                    onClick={() =>
                      canToggleScore &&
                      setScorePrimary((p) => (p === "gl" ? "dots" : "gl"))
                    }
                    disabled={!canToggleScore}
                    className="flex items-center gap-2 transition-colors"
                    style={{
                      cursor: canToggleScore ? "pointer" : "default",
                      background: "transparent",
                      border: "none",
                      padding: 0,
                    }}
                    title={canToggleScore ? "Swap primary score" : undefined}
                  >
                    <span
                      className="cloud-text-dim"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        fontWeight: 500,
                      }}
                    >
                      Best {effectivePrimary === "gl" ? "IPF GL" : "DOTS"}
                    </span>
                    <span
                      className="cloud-text font-semibold"
                      style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}
                    >
                      {(effectivePrimary === "gl" ? bestGl : bestDots)?.toFixed(2)}
                    </span>
                    {((effectivePrimary === "gl" && bestDots != null) ||
                      (effectivePrimary === "dots" && bestGl != null)) && (
                      <>
                        <span className="cloud-text-dim" style={{ fontSize: 11 }}>/</span>
                        <span
                          className="cloud-text-dim"
                          style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
                        >
                          {(effectivePrimary === "gl" ? bestDots : bestGl)?.toFixed(2)}{" "}
                          {effectivePrimary === "gl" ? "DOTS" : "IPF GL"}
                        </span>
                      </>
                    )}
                    {canToggleScore && (
                      <span className="cloud-text-dim" style={{ fontSize: 12 }} aria-hidden>
                        ⇄
                      </span>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height={224}>
              <LineChart data={totalsChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                <XAxis
                  dataKey="ts"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tick={{ fontSize: 11, fill: chartText }}
                  tickLine={false}
                  tickFormatter={(ts: number) =>
                    new Date(ts).toLocaleDateString("en-US", {
                      month: "short",
                      year: "2-digit",
                    })
                  }
                />
                <YAxis
                  tick={{ fontSize: 11, fill: chartText }}
                  tickLine={false}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => `${Math.round(v)}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartTooltipBg,
                    border: `1px solid ${chartTooltipBorder}`,
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelFormatter={(label, payload) => {
                    const ts = Number(label);
                    const dateStr = Number.isFinite(ts)
                      ? new Date(ts).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "";
                    const meet =
                      payload && payload[0]
                        ? (payload[0].payload as { meet?: string }).meet
                        : null;
                    return meet ? `${meet} · ${dateStr}` : dateStr;
                  }}
                  formatter={(value, _name, item) => {
                    const v = Number(value);
                    const point = item?.payload as
                      | { dots?: number | null; gl?: number | null }
                      | undefined;
                    const score =
                      effectivePrimary === "gl" ? point?.gl : point?.dots;
                    const scoreLabel =
                      effectivePrimary === "gl" ? "IPF GL" : "DOTS";
                    const suffix =
                      score != null
                        ? ` · ${scoreLabel} ${score.toFixed(2)}`
                        : "";
                    return [`${Math.round(v)} ${unit}${suffix}`, "Total"];
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke={chartLine}
                  strokeWidth={2}
                  dot={{ r: 3, fill: chartLine }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {/* Cap the visible list at ~4 meet rows so a 14-meet history doesn't
          dominate the profile; the rest stays one scroll away. */}
      <div
        className="space-y-3"
        style={{
          padding: "var(--cloud-s4)",
          maxHeight: 360,
          overflowY: "auto",
        }}
      >
        {groups.map((g, idx) => {
          // Delta vs. the prior chronological meet. groups is desc by date,
          // so the earlier meet is at idx + 1. Skip the very first meet
          // (oldest, idx === groups.length - 1) since there's nothing to
          // compare to. Convert to display unit so the +/- respects the
          // lbs/kg toggle at the top of the page.
          const priorTotalLbs =
            idx < groups.length - 1 ? groupTotalsLbs[idx + 1] : null;
          const currentTotalLbs = groupTotalsLbs[idx];
          const deltaLbs =
            priorTotalLbs != null && priorTotalLbs > 0 && currentTotalLbs > 0
              ? currentTotalLbs - priorTotalLbs
              : null;
          const deltaDisplay =
            deltaLbs != null
              ? Math.round(convertWeight(Math.abs(deltaLbs), unit))
              : null;
          const deltaSign = deltaLbs != null && deltaLbs >= 0 ? "+" : "−";
          const deltaColor =
            deltaLbs == null || deltaLbs === 0
              ? null
              : deltaLbs > 0
                ? "#86efac"
                : "var(--cloud-text-dim)";

          const bestByLift: Record<string, Types.MeetResultEntry | undefined> = {};
          for (const r of g.rows) {
            if (!r.made) continue;
            const cur = bestByLift[r.lift];
            if (!cur || r.weight_lbs > cur.weight_lbs) bestByLift[r.lift] = r;
          }
          const total =
            (bestByLift.squat?.weight_lbs ?? 0) +
            (bestByLift.bench?.weight_lbs ?? 0) +
            (bestByLift.deadlift?.weight_lbs ?? 0);
          const lifts = ["squat", "bench", "deadlift"] as const;
          const isOpen = expanded.has(g.key);
          let groupDots: number | null = null;
          let groupGl: number | null = null;
          for (const r of g.rows) {
            if (groupDots == null && r.dots_score != null) groupDots = r.dots_score;
            if (groupGl == null && r.gl_points != null) groupGl = r.gl_points;
            if (groupDots != null && groupGl != null) break;
          }
          // Distinct (division, place) pairs for this meet, restricted to
          // entries where OPL recorded an actual place. The "no-place" rows
          // are usually shadow division entries that OPL emits for meets
          // like High School Nationals (e.g., a Teen II age-bracket row
          // alongside the real Varsity placement) — they're noise, not
          // rankings, so we drop them.
          const placements: Array<{ division: string | null; place: string }> = [];
          const seenPlacement = new Set<string>();
          for (const r of g.rows) {
            if (!r.place || !String(r.place).trim()) continue;
            const div = r.division ?? null;
            const pl = String(r.place).trim();
            const key = `${div}|${pl}`;
            if (seenPlacement.has(key)) continue;
            seenPlacement.add(key);
            placements.push({ division: div, place: pl });
          }
          // Federation/weight class can vary across the per-division rows
          // OPL emits for one meet (the placed entry usually has them set
          // while the shadow age-bracket entry leaves them blank). Prefer
          // any non-null value across the group rather than whichever row
          // groupMeetResults happened to see first.
          const groupFederation =
            g.federation ?? g.rows.find((r) => r.federation)?.federation ?? null;
          const groupWeightClass =
            g.weight_class ?? g.rows.find((r) => r.weight_class)?.weight_class ?? null;
          const attemptMap: Record<string, Record<number, Types.MeetResultEntry>> = {
            squat: {},
            bench: {},
            deadlift: {},
          };
          for (const r of g.rows) {
            if (r.lift in attemptMap) {
              attemptMap[r.lift][r.attempt_number] = r;
            }
          }

          const liftTint: Record<string, string> = {
            squat: "#fb923c",
            bench: "#22d3ee",
            deadlift: "#a78bfa",
          };
          return (
            <div
              key={g.key}
              className="rounded-md"
              style={{
                border: "1px solid var(--cloud-border)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <button
                type="button"
                onClick={() => toggleExpanded(g.key)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-[rgba(255,255,255,0.03)] transition-colors rounded-t-md"
              >
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 cloud-text-dim shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 cloud-text-dim shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div
                    className="cloud-text font-medium flex flex-wrap items-baseline gap-x-3 gap-y-0.5"
                    style={{ fontSize: 13 }}
                  >
                    <span className="truncate">{g.meet_name ?? "Unnamed meet"}</span>
                    {placements.map((p, i) => {
                      const placeLabel = formatPlace(p.place);
                      if (!placeLabel) return null;
                      return (
                        <span
                          key={`${p.division}-${p.place}-${i}`}
                          className="inline-flex items-center gap-1 cloud-text"
                          style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}
                        >
                          <span>{placeLabel}</span>
                          {p.division && (
                            <span className="cloud-text font-normal">{p.division}</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                  <div className="cloud-text-dim truncate" style={{ fontSize: 11 }}>
                    {[
                      groupFederation,
                      groupWeightClass,
                      g.meet_date ? formatMeetDate(g.meet_date) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="cloud-text font-semibold flex items-baseline justify-end gap-1.5" style={{ fontSize: 13 }}>
                    {deltaDisplay != null && deltaColor != null && deltaDisplay > 0 && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: deltaColor,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {deltaSign}
                        {deltaDisplay} {unit}
                      </span>
                    )}
                    <span>{total > 0 ? formatWeight(total, unit) : "—"}</span>
                  </div>
                  <div
                    className="cloud-text-dim"
                    style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}
                  >
                    Total
                  </div>
                  {(groupDots != null || groupGl != null) && (
                    <div
                      className="cloud-text-dim"
                      style={{
                        fontSize: 10,
                        marginTop: 2,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {groupDots != null && <>DOTS {groupDots.toFixed(2)}</>}
                      {groupDots != null && groupGl != null && " · "}
                      {groupGl != null && <>GL {groupGl.toFixed(2)}</>}
                    </div>
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-[color:var(--cloud-border)] p-3">
                  <div
                    className="grid grid-cols-[80px_repeat(3,minmax(0,1fr))_80px] gap-2 items-center mb-1.5 cloud-text-dim"
                    style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}
                  >
                    <div />
                    <div className="text-center">A1</div>
                    <div className="text-center">A2</div>
                    <div className="text-center">A3</div>
                    <div className="text-right">Best</div>
                  </div>
                  {lifts.map((lift) => {
                    const best = bestByLift[lift];
                    return (
                      <div
                        key={lift}
                        className="grid grid-cols-[80px_repeat(3,minmax(0,1fr))_80px] gap-2 items-center py-1.5"
                      >
                        <div
                          className="capitalize font-medium"
                          style={{ fontSize: 12, color: liftTint[lift] }}
                        >
                          {lift}
                        </div>
                        {[1, 2, 3].map((n) => {
                          const r = attemptMap[lift][n];
                          if (!r) {
                            return (
                              <div
                                key={n}
                                className="text-center cloud-text-dim"
                                style={{ fontSize: 13 }}
                              >
                                —
                              </div>
                            );
                          }
                          const isBest = best && r.id === best.id;
                          
                          
                          
                          
                          
                          const cellStyle: CSSProperties = r.made
                            ? isBest
                              ? {
                                  background: "rgba(34, 197, 94, 0.15)",
                                  color: "#86efac",
                                  border: "1px solid rgba(34, 197, 94, 0.3)",
                                  fontWeight: 600,
                                }
                              : { color: "#86efac" }
                            : { color: "#fca5a5", textDecoration: "line-through" };
                          return (
                            <div
                              key={n}
                              className="text-center rounded px-1 py-0.5"
                              style={{ fontSize: 13, ...cellStyle }}
                            >
                              {formatWeight(r.weight_lbs, unit, { unitless: true })}
                              <span className="cloud-text-dim ml-0.5" style={{ fontSize: 10 }}>
                                {unit}
                              </span>
                            </div>
                          );
                        })}
                        <div className="text-right cloud-text font-medium" style={{ fontSize: 13 }}>
                          {best ? formatWeight(best.weight_lbs, unit, { unitless: true }) : "—"}
                        </div>
                      </div>
                    );
                  })}

                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
