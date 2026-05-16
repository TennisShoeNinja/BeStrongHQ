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
  peaksByBlock,
  repFilterRange,
  topEfforts,
  type BlockPeaks,
  type LiftKey,
  type LiftSeriesRow,
  type PeakEffort,
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
  const [primaryOnly, setPrimaryOnly] = useState(false);
  const [showPeakTable, setShowPeakTable] = useState(false);
  const [selectedProgramIds, setSelectedProgramIds] = useState<Set<number>>(
    new Set<number>(),
  );
  const [visibleLifts, setVisibleLifts] = useState<Set<LiftKey>>(
    new Set<LiftKey>(["squat", "bench", "deadlift"]),
  );

  const { minReps, maxReps } = repFilterRange(repFilter);
  const { data: e1rmTrends = [] as Types.E1RMDataPoint[] } = useQuery({
    queryKey: ["progression-e1rm", athleteId, repFilter, primaryOnly],
    queryFn: () =>
      apiClient.getE1RMTrends(athleteId, {
        minReps,
        maxReps,
        primaryOnly: primaryOnly ? true : undefined,
      }),
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

  const programOptions = useMemo(
    () => programs.filter((program) => program.id != null),
    [programs],
  );
  const effectiveSelectedProgramIds = useMemo(() => {
    const availableIds = new Set(programOptions.map((program) => program.id));
    if (availableIds.size === 0) return availableIds;
    if (selectedProgramIds.size === 0) return availableIds;
    const effective = new Set<number>();
    for (const id of selectedProgramIds) {
      if (availableIds.has(id)) effective.add(id);
    }
    return effective.size > 0 ? effective : availableIds;
  }, [programOptions, selectedProgramIds]);

  const series = useMemo(
    () =>
      chartMode === "volume"
        ? buildVolumeSeries(volumeTrends, programs, effectiveSelectedProgramIds)
        : buildLiftSeries(e1rmTrends, programs, effectiveSelectedProgramIds),
    [chartMode, e1rmTrends, effectiveSelectedProgramIds, programs, volumeTrends],
  );
  const boundaries = useMemo(
    () => blockBoundaryTimestamps(programs, effectiveSelectedProgramIds),
    [effectiveSelectedProgramIds, programs],
  );
  const blockPeaks = useMemo(
    () => peaksByBlock(e1rmTrends, programs),
    [e1rmTrends, programs],
  );
  const peakEfforts = useMemo(
    () => topEfforts(e1rmTrends, programs),
    [e1rmTrends, programs],
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

  const toggleProgram = (programId: number) => {
    setSelectedProgramIds((prev) => {
      const availableIds = programOptions.map((program) => program.id);
      const availableIdSet = new Set(availableIds);
      const next =
        prev.size === 0
          ? new Set(availableIds)
          : new Set(Array.from(prev).filter((id) => availableIdSet.has(id)));
      if (next.has(programId)) {
        if (next.size > 1) next.delete(programId);
      } else {
        next.add(programId);
      }
      return next;
    });
  };

  const programLabel = (
    program: Pick<Types.ProgramListResponse, "program_number" | "program_name">,
  ) => {
    const block =
      program.program_number != null ? `B${program.program_number}` : "Block";
    const name = (program.program_name ?? "").trim();
    return name ? `${block} ${name}` : block;
  };

  const formatPeak = (value: number) =>
    `${Math.round(convertWeight(value, unit)).toLocaleString("en-US")} ${unit}`;

  const formatWeightOnly = (value: number) =>
    Math.round(convertWeight(value, unit)).toLocaleString("en-US");

  const roundedDelta = (value: number) => Math.round(convertWeight(value, unit));

  const formatDelta = (value: number) => {
    const displayValue = roundedDelta(value);
    if (displayValue > 0) return `+${displayValue.toLocaleString("en-US")}`;
    return displayValue.toLocaleString("en-US");
  };

  const deltaColor = (value: number | null) => {
    if (value == null) return "var(--cloud-text-dim)";
    const displayValue = roundedDelta(value);
    if (displayValue > 0) return "var(--cloud-success-text)";
    if (displayValue < 0) return "var(--cloud-danger-text)";
    return "var(--cloud-text-dim)";
  };

  const blockPeakLabel = (block: BlockPeaks) =>
    programLabel({
      program_number: block.programNumber,
      program_name: block.programName,
    });

  const effortBlockLabel = (effort: PeakEffort) =>
    programLabel({
      program_number: effort.programNumber,
      program_name: effort.programName,
    });

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
            <button
              type="button"
              onClick={() => setPrimaryOnly((value) => !value)}
              aria-pressed={primaryOnly}
              style={{
                background: primaryOnly
                  ? "rgba(12, 92, 171, 0.20)"
                  : "var(--cloud-panel)",
                border: `1px solid ${
                  primaryOnly ? "rgba(12, 92, 171, 0.40)" : "var(--cloud-border)"
                }`,
                color: primaryOnly
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
              Primary day only
            </button>
          </div>
        )}

        {programOptions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {programOptions.map((program) => {
              const active = effectiveSelectedProgramIds.has(program.id);
              return (
                <button
                  key={program.id}
                  type="button"
                  onClick={() => toggleProgram(program.id)}
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
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "6px 12px",
                    borderRadius: 999,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    letterSpacing: "0.02em",
                  }}
                >
                  {programLabel(program)}
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

        {blockPeaks.length > 0 && (
          <section
            style={{
              background: "var(--cloud-surface-raised)",
              border: "1px solid var(--cloud-border)",
              borderRadius: 8,
              padding: "var(--cloud-s3)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--cloud-s2)",
            }}
          >
            <div
              style={{
                color: "var(--cloud-primary-text)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              PEAK WEIGHT PER BLOCK
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {blockPeaks.map((block) => (
                <div
                  key={block.programId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(140px, 1fr) repeat(auto-fit, minmax(112px, 128px))",
                    gap: 8,
                    alignItems: "center",
                    padding: "8px 10px",
                    border: "1px solid var(--cloud-border)",
                    borderRadius: 8,
                    background: "var(--cloud-panel)",
                  }}
                >
                  <div
                    style={{
                      color: "var(--cloud-primary-text)",
                      fontSize: 12,
                      fontWeight: 700,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={blockPeakLabel(block)}
                  >
                    {blockPeakLabel(block)}
                  </div>
                  {LIFTS.filter((lift) => visibleLifts.has(lift.key)).map((lift) => {
                    const peak = block.peaks[lift.key];
                    return (
                      <div
                        key={lift.key}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                          minWidth: 0,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        <span
                          style={{
                            color: "var(--cloud-text-muted)",
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                          }}
                        >
                          {lift.label}
                        </span>
                        <span
                          style={{
                            color: peak ? "var(--cloud-text)" : "var(--cloud-text-dim)",
                            fontSize: 13,
                            fontWeight: 700,
                          }}
                        >
                          {peak ? formatPeak(peak.e1rm) : "No peak"}
                        </span>
                        {peak && (
                          <span
                            style={{
                              color: deltaColor(peak.delta),
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {peak.delta == null ? "New" : formatDelta(peak.delta)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        )}

        {peakEfforts.length > 0 && (
          <section
            style={{
              background: "var(--cloud-surface-raised)",
              border: "1px solid var(--cloud-border)",
              borderRadius: 8,
              padding: "var(--cloud-s3)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--cloud-s2)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  color: "var(--cloud-primary-text)",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                TOP E1RM EFFORTS
              </div>
              <button
                type="button"
                onClick={() => setShowPeakTable((value) => !value)}
                aria-pressed={showPeakTable}
                style={{
                  background: showPeakTable
                    ? "rgba(12, 92, 171, 0.20)"
                    : "var(--cloud-panel)",
                  border: `1px solid ${
                    showPeakTable
                      ? "rgba(12, 92, 171, 0.40)"
                      : "var(--cloud-border)"
                  }`,
                  color: showPeakTable
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
                Peak table
              </button>
            </div>

            {showPeakTable && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  border: "1px solid var(--cloud-border)",
                  borderRadius: 8,
                  overflow: "hidden",
                  background: "var(--cloud-panel)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(150px, 1.4fr) minmax(88px, 0.7fr) minmax(56px, 0.45fr) minmax(76px, 0.6fr) minmax(130px, 1fr)",
                    gap: 8,
                    padding: "7px 10px",
                    borderBottom: "1px solid var(--cloud-border)",
                    color: "var(--cloud-text-dim)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  <span>Exercise</span>
                  <span>Weight x Reps</span>
                  <span>RPE</span>
                  <span>e1RM</span>
                  <span>Block</span>
                </div>
                {peakEfforts.map((effort) => (
                  <div
                    key={effort.canonicalName}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(150px, 1.4fr) minmax(88px, 0.7fr) minmax(56px, 0.45fr) minmax(76px, 0.6fr) minmax(130px, 1fr)",
                      gap: 8,
                      alignItems: "center",
                      padding: "8px 10px",
                      borderTop: "1px solid var(--cloud-border)",
                      color: "var(--cloud-text)",
                      fontSize: 12,
                    }}
                  >
                    <span
                      title={effort.exerciseName}
                      style={{
                        fontWeight: 700,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {effort.exerciseName}
                    </span>
                    <span>
                      {formatWeightOnly(effort.weightLbs)} x {effort.reps}
                    </span>
                    <span
                      style={{
                        color:
                          effort.rpe == null
                            ? "var(--cloud-text-dim)"
                            : "var(--cloud-text)",
                      }}
                    >
                      {effort.rpe == null ? "-" : effort.rpe}
                    </span>
                    <span style={{ fontWeight: 700 }}>
                      {formatPeak(effort.e1rm)}
                    </span>
                    <span
                      title={effortBlockLabel(effort)}
                      style={{
                        color: "var(--cloud-text-muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {effortBlockLabel(effort)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
