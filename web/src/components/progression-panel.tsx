"use client";

import { Fragment, useMemo, useState, type CSSProperties } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api";
import * as Types from "@/lib/types";
import { convertWeight, type WeightUnit } from "@/lib/units";
import {
  COMPARE_COLORS,
  LIFTS,
  REP_FILTERS,
  buildCompareSeries,
  buildLiftSeries,
  buildVolumeSeries,
  compareSeriesLabel,
  liftMatches,
  peaksByBlock,
  repFilterRange,
  topEfforts,
  variationsForLift,
  type BlockPeaks,
  type ChartRow,
  type CompareSeries,
  type LiftKey,
  type PeakEffort,
  type ProgressionGranularity,
  type RepFilterKey,
} from "@/lib/progression";
import { ProgressionChart } from "@/components/progression-chart";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ManageVariationsModal } from "@/components/manage-variations-modal";
import parseLocalDate from "@/lib/parseLocalDate";

interface Props {
  athleteId: number;
  unit: WeightUnit;
}

let compareSeriesCounter = 0;

function newCompareSeriesId() {
  compareSeriesCounter += 1;
  return `compare-${compareSeriesCounter}`;
}

const MODES: { key: "e1rm" | "volume" | "compare"; label: string }[] = [
  { key: "e1rm", label: "e1RM" },
  { key: "volume", label: "Volume" },
  { key: "compare", label: "Compare" },
];

const GRANULARITIES: { key: ProgressionGranularity; label: string }[] = [
  { key: "block", label: "Per Block" },
  { key: "week", label: "Per Week" },
];

type VariationSelection = Record<LiftKey, Set<string>>;

function emptyVariationSelection(): VariationSelection {
  return {
    squat: new Set<string>(),
    bench: new Set<string>(),
    deadlift: new Set<string>(),
  };
}

// Connected segmented control: a pill-shaped container holding tab buttons.
const SEG_GROUP: CSSProperties = {
  display: "inline-flex",
  background: "rgba(255, 255, 255, 0.04)",
  border: "1px solid var(--cloud-border)",
  borderRadius: 999,
  padding: 3,
  gap: 2,
};

function segButton(active: boolean): CSSProperties {
  return {
    background: active ? "rgba(12, 92, 171, 0.22)" : "transparent",
    boxShadow: active ? "inset 0 0 0 1px rgba(12, 92, 171, 0.40)" : undefined,
    border: 0,
    color: active ? "var(--cloud-text)" : "var(--cloud-text-muted)",
    fontSize: 12,
    fontWeight: 600,
    padding: "5px 12px",
    borderRadius: 999,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.01em",
    whiteSpace: "nowrap",
  };
}

// Standalone pill: lift toggles, the Primary day toggle, dropdown triggers.
function pillButton(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: active ? "rgba(12, 92, 171, 0.20)" : "var(--cloud-panel)",
    border: `1px solid ${
      active ? "rgba(12, 92, 171, 0.40)" : "var(--cloud-border)"
    }`,
    color: active ? "var(--cloud-primary-text)" : "var(--cloud-text-muted)",
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 12px",
    borderRadius: 999,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.01em",
    whiteSpace: "nowrap",
  };
}

const CONTROL_DIVIDER: CSSProperties = {
  width: 1,
  alignSelf: "stretch",
  minHeight: 22,
  background: "var(--cloud-border)",
  margin: "0 2px",
};

/**
 * Rich coach progression panel: multiple lifts overlaid on one e1RM
 * trajectory, sliced by rep range. Mounted inline on the athlete profile.
 */
export function ProgressionPanel({ athleteId, unit }: Props) {
  const [chartMode, setChartMode] = useState<"e1rm" | "volume">("e1rm");
  const [compareMode, setCompareMode] = useState(false);
  const [compareSeries, setCompareSeries] = useState<CompareSeries[]>(() => [
    { id: newCompareSeriesId(), lift: "squat", repFilter: "1-3" },
  ]);
  const [repFilter, setRepFilter] = useState<RepFilterKey>("1-3");
  const [primaryOnly, setPrimaryOnly] = useState(false);
  const [granularity, setGranularity] =
    useState<ProgressionGranularity>("block");
  const [showPeakTable, setShowPeakTable] = useState(false);
  const [showManageVariations, setShowManageVariations] = useState(false);
  // Per-lift selected variations. Empty means use the derived competition default.
  const [variationByLift, setVariationByLift] = useState<VariationSelection>(
    () => emptyVariationSelection(),
  );
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
    enabled: !compareMode && chartMode === "volume",
  });
  const compareSeriesQueries = useQueries({
    queries: compareSeries.map((series) => {
      const range = repFilterRange(series.repFilter);
      return {
        queryKey: [
          "progression-compare",
          athleteId,
          series.lift,
          series.repFilter,
        ],
        queryFn: () =>
          apiClient.getE1RMTrends(athleteId, {
            liftCategory: series.lift,
            minReps: range.minReps,
            maxReps: range.maxReps,
          }),
        enabled: compareMode,
      };
    }),
  });
  const { data: programs = [] as Types.ProgramListResponse[] } = useQuery({
    queryKey: ["programs", athleteId],
    queryFn: () => apiClient.listPrograms(athleteId),
  });

  const programOptions = useMemo(
    () =>
      programs
        .filter((program) => program.id != null)
        .sort((a, b) => {
          const da = parseLocalDate(a.date_start)?.getTime() ?? 0;
          const db = parseLocalDate(b.date_start)?.getTime() ?? 0;
          return db - da; // most recent block first
        }),
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

  // Every variation per lift, for the variation picker.
  const variations = useMemo(
    () => ({
      squat: variationsForLift(e1rmTrends, programs, "squat"),
      bench: variationsForLift(e1rmTrends, programs, "bench"),
      deadlift: variationsForLift(e1rmTrends, programs, "deadlift"),
    }),
    [e1rmTrends, programs],
  );

  const effectiveSelectedVariations = useMemo<VariationSelection>(() => {
    const resolve = (lift: LiftKey): Set<string> => {
      const opts = variations[lift];
      if (opts.length === 0) return new Set<string>();
      const canonicals = new Set(opts.map((opt) => opt.canonical));
      const valid = new Set<string>();
      for (const canonical of variationByLift[lift]) {
        if (canonicals.has(canonical)) valid.add(canonical);
      }
      if (valid.size > 0) return valid;
      const pick = opts.find((o) => o.isCompetition) ?? opts[0];
      return new Set<string>([pick.canonical]);
    };
    return {
      squat: resolve("squat"),
      bench: resolve("bench"),
      deadlift: resolve("deadlift"),
    };
  }, [variations, variationByLift]);

  const representativeVariations = useMemo<Record<LiftKey, string | null>>(() => {
    const resolve = (lift: LiftKey): string | null => {
      const selected = effectiveSelectedVariations[lift];
      if (selected.size === 0) return null;
      const opts = variations[lift];
      const comp = opts.find((opt) => opt.isCompetition && selected.has(opt.canonical));
      if (comp) return comp.canonical;
      return opts.find((opt) => selected.has(opt.canonical))?.canonical ?? null;
    };
    return {
      squat: resolve("squat"),
      bench: resolve("bench"),
      deadlift: resolve("deadlift"),
    };
  }, [effectiveSelectedVariations, variations]);

  const series = useMemo(
    () =>
      chartMode === "volume"
        ? buildVolumeSeries(
            volumeTrends,
            programs,
            granularity,
            effectiveSelectedProgramIds,
          )
        : buildLiftSeries(
            e1rmTrends,
            programs,
            effectiveSelectedVariations,
            granularity,
            effectiveSelectedProgramIds,
          ),
    [
      chartMode,
      e1rmTrends,
      effectiveSelectedProgramIds,
      effectiveSelectedVariations,
      granularity,
      programs,
      volumeTrends,
    ],
  );
  const compareChart = useMemo(
    () =>
      buildCompareSeries(
        compareSeries.map((seriesItem, index) => ({
          id: seriesItem.id,
          lift: seriesItem.lift,
          points:
            (compareSeriesQueries[index]?.data as Types.E1RMDataPoint[] | undefined) ??
            [],
        })),
        programs,
        granularity,
      ),
    [compareSeries, compareSeriesQueries, granularity, programs],
  );
  const compareChartSeries = useMemo(
    () =>
      compareSeries.map((seriesItem, index) => ({
        key: seriesItem.id,
        label: compareSeriesLabel(seriesItem),
        color: COMPARE_COLORS[index % COMPARE_COLORS.length],
      })),
    [compareSeries],
  );
  const blockPeaks = useMemo(
    () => peaksByBlock(e1rmTrends, programs, representativeVariations),
    [e1rmTrends, programs, representativeVariations],
  );
  // Newest block first for the Peak Weight Per Block list (it scrolls).
  const recentBlockPeaks = useMemo(
    () => [...blockPeaks].reverse(),
    [blockPeaks],
  );
  const peakEfforts = useMemo(
    () => topEfforts(e1rmTrends, programs),
    [e1rmTrends, programs],
  );

  // Raw exercise names per lift, for the Manage Variations merge modal.
  const variationCandidates = useMemo<Record<string, string[]>>(() => {
    const sets: Record<LiftKey, Set<string>> = {
      squat: new Set(),
      bench: new Set(),
      deadlift: new Set(),
    };
    for (const point of e1rmTrends) {
      const name = (point.exercise_name ?? "").trim();
      if (!name) continue;
      for (const lift of LIFTS) {
        if (liftMatches(point.lift_category, lift.key)) {
          sets[lift.key].add(name);
          break;
        }
      }
    }
    return {
      squat: Array.from(sets.squat).sort((a, b) => a.localeCompare(b)),
      bench: Array.from(sets.bench).sort((a, b) => a.localeCompare(b)),
      deadlift: Array.from(sets.deadlift).sort((a, b) => a.localeCompare(b)),
    };
  }, [e1rmTrends]);

  const chartRows = compareMode ? compareChart.rows : series.rows;

  // Progression data from the API is in pounds; convert for kg-preference coaches.
  const displayRows: ChartRow[] = useMemo(() => {
    if (unit === "lbs") return chartRows;
    return chartRows.map((row) => {
      const next: ChartRow = { label: row.label };
      for (const [key, value] of Object.entries(row)) {
        if (key === "label") continue;
        next[key] =
          typeof value === "number" ? convertWeight(value, unit) : value;
      }
      return next;
    });
  }, [chartRows, unit]);

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
      const next = new Set(prev);
      if (next.has(programId)) next.delete(programId);
      else next.add(programId);
      return next;
    });
  };

  const toggleVariation = (lift: LiftKey, canonical: string) => {
    setVariationByLift((prev) => {
      const base =
        prev[lift].size > 0 ? prev[lift] : effectiveSelectedVariations[lift];
      const next = new Set(base);
      if (next.has(canonical)) {
        if (next.size === 1) return prev;
        next.delete(canonical);
      } else {
        next.add(canonical);
      }
      return { ...prev, [lift]: next };
    });
  };

  const updateCompareSeries = (
    id: string,
    patch: Partial<Pick<CompareSeries, "lift" | "repFilter">>,
  ) => {
    setCompareSeries((prev) =>
      prev.map((seriesItem) =>
        seriesItem.id === id ? { ...seriesItem, ...patch } : seriesItem,
      ),
    );
  };

  const addCompareSeries = () => {
    setCompareSeries((prev) => [
      ...prev,
      { id: newCompareSeriesId(), lift: "squat", repFilter: "1-3" },
    ]);
  };

  const removeCompareSeries = (id: string) => {
    setCompareSeries((prev) =>
      prev.length === 1 ? prev : prev.filter((seriesItem) => seriesItem.id !== id),
    );
  };

  const programShortLabel = (
    program: Pick<Types.ProgramListResponse, "program_number">,
  ) => (program.program_number != null ? `P${program.program_number}` : "Program");

  const programLabel = (
    program: Pick<Types.ProgramListResponse, "program_number" | "program_name">,
  ) => {
    const block = programShortLabel(program);
    const name = (program.program_name ?? "").trim();
    return name ? `${block} ${name}` : block;
  };

  // Short label for the block dropdown: P{number}, or a month-year for
  // legacy programs that predate program numbering.
  const blockDropdownLabel = (program: Types.ProgramListResponse) => {
    if (program.program_number != null) return `P${program.program_number}`;
    const start = parseLocalDate(program.date_start);
    return start
      ? start.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
      : "Block";
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

  const blockFilterActive = selectedProgramIds.size > 0;
  const blockTriggerLabel = (() => {
    if (selectedProgramIds.size === 0) return "All blocks";
    if (selectedProgramIds.size === 1) {
      const only = programOptions.find((program) =>
        selectedProgramIds.has(program.id),
      );
      return only ? blockDropdownLabel(only) : "1 block";
    }
    return `${selectedProgramIds.size} blocks`;
  })();

  const currentMode: "e1rm" | "volume" | "compare" = compareMode
    ? "compare"
    : chartMode;
  const selectMode = (mode: "e1rm" | "volume" | "compare") => {
    if (mode === "compare") {
      setCompareMode(true);
      return;
    }
    setCompareMode(false);
    setChartMode(mode);
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
        {/* Control bar */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
          }}
        >
          {/* Mode */}
          <div role="tablist" aria-label="Chart mode" style={SEG_GROUP}>
            {MODES.map((mode) => {
              const active = currentMode === mode.key;
              return (
                <button
                  key={mode.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectMode(mode.key)}
                  style={segButton(active)}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>

          <span aria-hidden style={CONTROL_DIVIDER} />
          <div role="tablist" aria-label="Chart granularity" style={SEG_GROUP}>
            {GRANULARITIES.map((item) => {
              const active = granularity === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setGranularity(item.key)}
                  style={segButton(active)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {!compareMode && (
            <>
              <span aria-hidden style={CONTROL_DIVIDER} />
              {/* Lifts */}
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
                        ...pillButton(active),
                        cursor: has ? "pointer" : "not-allowed",
                        opacity: has ? 1 : 0.4,
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
            </>
          )}

          {!compareMode && chartMode === "e1rm" && (
            <>
              <span aria-hidden style={CONTROL_DIVIDER} />
              {/* Rep range */}
              <DropdownMenu>
                <DropdownMenuTrigger style={pillButton(false)}>
                  {REP_FILTERS.find((r) => r.key === repFilter)?.label ??
                    "Reps"}
                  <ChevronDown
                    style={{ width: 13, height: 13, opacity: 0.6 }}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="cloud-panel-raised"
                >
                  <DropdownMenuRadioGroup
                    value={repFilter}
                    onValueChange={(value) =>
                      setRepFilter(value as RepFilterKey)
                    }
                  >
                    {REP_FILTERS.map((r) => (
                      <DropdownMenuRadioItem key={r.key} value={r.key}>
                        {r.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              {/* Variations */}
              <DropdownMenu>
                <DropdownMenuTrigger style={pillButton(false)}>
                  Variations
                  <ChevronDown
                    style={{ width: 13, height: 13, opacity: 0.6 }}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="cloud-panel-raised"
                  style={{
                    maxHeight: 360,
                    overflowY: "auto",
                    minWidth: 240,
                    maxWidth: 360,
                  }}
                >
                  {LIFTS.map((lift) => {
                    const opts = variations[lift.key];
                    if (opts.length === 0) return null;
                    return (
                      <Fragment key={lift.key}>
                        <div
                          style={{
                            padding: "6px 10px 3px",
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: "var(--cloud-text-dim)",
                          }}
                        >
                          {lift.label}
                        </div>
                        {opts.map((opt) => (
                          <DropdownMenuCheckboxItem
                            key={opt.canonical}
                            checked={effectiveSelectedVariations[lift.key].has(
                              opt.canonical,
                            )}
                            onCheckedChange={() =>
                              toggleVariation(lift.key, opt.canonical)
                            }
                            title={opt.label}
                          >
                            {opt.label}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </Fragment>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowManageVariations(true)}
                  >
                    Manage variations
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {/* Primary day */}
              <button
                type="button"
                onClick={() => setPrimaryOnly((value) => !value)}
                aria-pressed={primaryOnly}
                title="Show only the athlete's primary training day for each lift"
                style={pillButton(primaryOnly)}
              >
                Primary day
              </button>
            </>
          )}

          {!compareMode && (
            <>
              <span aria-hidden style={CONTROL_DIVIDER} />
              {programOptions.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger style={pillButton(blockFilterActive)}>
                    {blockTriggerLabel}
                    <ChevronDown style={{ width: 13, height: 13, opacity: 0.6 }} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="cloud-panel-raised"
                    style={{
                      maxHeight: 288,
                      overflowY: "auto",
                      minWidth: 220,
                      maxWidth: 360,
                    }}
                  >
                    <DropdownMenuItem
                      onClick={() => setSelectedProgramIds(new Set())}
                    >
                      Clear (show all)
                    </DropdownMenuItem>
                    {programOptions.map((program) => (
                      <DropdownMenuCheckboxItem
                        key={program.id}
                        checked={selectedProgramIds.has(program.id)}
                        onCheckedChange={() => toggleProgram(program.id)}
                        title={programLabel(program)}
                      >
                        {blockDropdownLabel(program)}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )}
        </div>

        {compareMode && (
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
              COMPARE SERIES
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {compareSeries.map((seriesItem, index) => (
                <div
                  key={seriesItem.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "10px minmax(108px, 1fr) minmax(124px, 1fr) auto",
                    gap: 8,
                    alignItems: "center",
                    padding: "8px 10px",
                    border: "1px solid var(--cloud-border)",
                    borderRadius: 8,
                    background: "var(--cloud-panel)",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: COMPARE_COLORS[index % COMPARE_COLORS.length],
                    }}
                  />
                  <select
                    value={seriesItem.lift}
                    onChange={(event) =>
                      updateCompareSeries(seriesItem.id, {
                        lift: event.target.value as LiftKey,
                      })
                    }
                    style={{
                      background: "var(--cloud-panel)",
                      border: "1px solid var(--cloud-border)",
                      color: "var(--cloud-text)",
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "6px 10px",
                      borderRadius: 8,
                      fontFamily: "inherit",
                      colorScheme: "dark",
                    }}
                  >
                    {LIFTS.map((lift) => (
                      <option key={lift.key} value={lift.key}>
                        {lift.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={seriesItem.repFilter}
                    onChange={(event) =>
                      updateCompareSeries(seriesItem.id, {
                        repFilter: event.target.value as RepFilterKey,
                      })
                    }
                    style={{
                      background: "var(--cloud-panel)",
                      border: "1px solid var(--cloud-border)",
                      color: "var(--cloud-text)",
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "6px 10px",
                      borderRadius: 8,
                      fontFamily: "inherit",
                      colorScheme: "dark",
                    }}
                  >
                    {REP_FILTERS.map((filter) => (
                      <option key={filter.key} value={filter.key}>
                        {filter.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeCompareSeries(seriesItem.id)}
                    disabled={compareSeries.length === 1}
                    style={{
                      background: "var(--cloud-panel)",
                      border: "1px solid var(--cloud-border)",
                      color:
                        compareSeries.length === 1
                          ? "var(--cloud-text-dim)"
                          : "var(--cloud-text-muted)",
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "6px 10px",
                      borderRadius: 999,
                      cursor: compareSeries.length === 1 ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                      opacity: compareSeries.length === 1 ? 0.55 : 1,
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addCompareSeries}
              style={{
                alignSelf: "flex-start",
                background: "var(--cloud-panel)",
                border: "1px solid var(--cloud-border)",
                color: "var(--cloud-primary-text)",
                fontSize: 11,
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: 999,
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: "0.02em",
              }}
            >
              Add series
            </button>
          </section>
        )}

        <ProgressionChart
          rows={displayRows}
          visibleLifts={visibleLifts}
          unit={unit}
          mode={compareMode ? "e1rm" : chartMode}
          series={
            compareMode
              ? compareChartSeries
              : chartMode === "e1rm"
                ? series.series.filter(
                    (item) => !item.lift || visibleLifts.has(item.lift),
                  )
                : undefined
          }
        />

        {!compareMode && blockPeaks.length > 0 && (
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
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                maxHeight: 300,
                overflowY: "auto",
                paddingRight: 4,
              }}
            >
              {recentBlockPeaks.map((block) => (
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

        {!compareMode && peakEfforts.length > 0 && (
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
      <ManageVariationsModal
        open={showManageVariations}
        onClose={() => setShowManageVariations(false)}
        candidatesByLift={variationCandidates}
      />
    </div>
  );
}
