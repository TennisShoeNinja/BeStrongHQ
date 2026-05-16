"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api";
import * as Types from "@/lib/types";
import { convertWeight, type WeightUnit } from "@/lib/units";
import {
  LIFTS,
  REP_FILTERS,
  blockBoundaryTimestamps,
  buildLiftSeries,
  buildVolumeSeries,
  repFilterRange,
  type LiftKey,
  type LiftSeriesRow,
  type RepFilterKey,
} from "@/lib/progression";
import { ProgressionChart } from "@/components/progression-chart";

interface Props {
  athleteId: number;
  unit: WeightUnit;
}

/**
 * Rich coach progression panel: multiple lifts overlaid on one e1RM
 * trajectory, sliced by rep range. Mounted inline on the athlete profile.
 */
export function ProgressionPanel({ athleteId, unit }: Props) {
  const [chartMode, setChartMode] = useState<"e1rm" | "volume">("e1rm");
  const [repFilter, setRepFilter] = useState<RepFilterKey>("1-3");
  const [visibleLifts, setVisibleLifts] = useState<Set<LiftKey>>(
    new Set<LiftKey>(["squat", "bench", "deadlift"]),
  );

  const { minReps, maxReps } = repFilterRange(repFilter);
  const { data: e1rmTrends = [] as Types.E1RMDataPoint[] } = useQuery({
    queryKey: ["progression-e1rm", athleteId, repFilter],
    queryFn: () => apiClient.getE1RMTrends(athleteId, { minReps, maxReps }),
  });
  const { data: volumeTrends = [] as Types.VolumeDataPoint[] } = useQuery({
    queryKey: ["progression-volume", athleteId],
    queryFn: () => apiClient.getVolumeTrends(athleteId),
    enabled: chartMode === "volume",
  });
  const { data: programs = [] as Types.ProgramListResponse[] } = useQuery({
    queryKey: ["programs", athleteId],
    queryFn: () => apiClient.listPrograms(athleteId),
  });

  const series = useMemo(
    () =>
      chartMode === "volume"
        ? buildVolumeSeries(volumeTrends, programs)
        : buildLiftSeries(e1rmTrends, programs),
    [chartMode, e1rmTrends, programs, volumeTrends],
  );
  const boundaries = useMemo(
    () => blockBoundaryTimestamps(programs),
    [programs],
  );

  // Progression data from the API is in pounds; convert for kg-preference coaches.
  const displayRows: LiftSeriesRow[] = useMemo(() => {
    if (unit === "lbs") return series.rows;
    return series.rows.map((r) => ({
      ts: r.ts,
      squat: r.squat != null ? convertWeight(r.squat, unit) : undefined,
      bench: r.bench != null ? convertWeight(r.bench, unit) : undefined,
      deadlift: r.deadlift != null ? convertWeight(r.deadlift, unit) : undefined,
    }));
  }, [series.rows, unit]);

  const toggleLift = (lift: LiftKey) => {
    setVisibleLifts((prev) => {
      const next = new Set(prev);
      if (next.has(lift)) {
        if (next.size > 1) next.delete(lift); // keep at least one line
      } else {
        next.add(lift);
      }
      return next;
    });
  };

  return (
    <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
      <div className="cloud-panel-head">
        <h2>Progression</h2>
      </div>
      <div
        style={{
          padding: "var(--cloud-s4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--cloud-s3)",
        }}
      >
        {/* Chart mode */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {[
            { key: "e1rm", label: "e1RM" },
            { key: "volume", label: "Volume" },
          ].map((mode) => {
            const active = chartMode === mode.key;
            return (
              <button
                key={mode.key}
                type="button"
                onClick={() => setChartMode(mode.key as "e1rm" | "volume")}
                aria-pressed={active}
                style={{
                  background: active
                    ? "rgba(12, 92, 171, 0.20)"
                    : "var(--cloud-panel)",
                  border: `1px solid ${
                    active ? "rgba(12, 92, 171, 0.40)" : "var(--cloud-border)"
                  }`,
                  color: active
                    ? "var(--cloud-primary-text)"
                    : "var(--cloud-text-muted)",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: 999,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "0.02em",
                }}
              >
                {mode.label}
              </button>
            );
          })}
        </div>

        {/* Lift toggles */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {LIFTS.map((l) => {
            const has = series.available[l.key];
            const active = has && visibleLifts.has(l.key);
            return (
              <button
                key={l.key}
                type="button"
                disabled={!has}
                onClick={() => toggleLift(l.key)}
                title={has ? undefined : `No ${l.label.toLowerCase()} data`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: active
                    ? "rgba(12, 92, 171, 0.20)"
                    : "var(--cloud-panel)",
                  border: `1px solid ${
                    active ? "rgba(12, 92, 171, 0.40)" : "var(--cloud-border)"
                  }`,
                  color: active
                    ? "var(--cloud-primary-text)"
                    : "var(--cloud-text-muted)",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: 999,
                  cursor: has ? "pointer" : "not-allowed",
                  opacity: has ? 1 : 0.4,
                  fontFamily: "inherit",
                  letterSpacing: "-0.005em",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: l.color,
                    opacity: active ? 1 : 0.35,
                  }}
                />
                {l.label}
              </button>
            );
          })}
        </div>

        {chartMode === "e1rm" && (
          /* Rep-range filter */
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {REP_FILTERS.map((r) => {
              const active = repFilter === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRepFilter(r.key)}
                  style={{
                    background: active
                      ? "rgba(12, 92, 171, 0.20)"
                      : "var(--cloud-panel)",
                    border: `1px solid ${
                      active ? "rgba(12, 92, 171, 0.40)" : "var(--cloud-border)"
                    }`,
                    color: active
                      ? "var(--cloud-primary-text)"
                      : "var(--cloud-text-muted)",
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "6px 12px",
                    borderRadius: 999,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    letterSpacing: "0.02em",
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        )}

        <ProgressionChart
          rows={displayRows}
          visibleLifts={visibleLifts}
          boundaries={boundaries}
          unit={unit}
          mode={chartMode}
        />
      </div>
    </div>
  );
}
