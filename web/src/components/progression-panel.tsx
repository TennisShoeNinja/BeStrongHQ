"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api";
import * as Types from "@/lib/types";
import { convertWeight, type WeightUnit } from "@/lib/units";
import { safeHttpUrl } from "@/lib/safe-url";
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
  type ChartRowValue,
  type CompareSeries,
  type HighlightedExercise,
  type LiftKey,
  type PeakEffort,
  type ProgressionChartSeries,
  type ProgressionGranularity,
  type RepFilterKey,
  type SeriesPointMeta,
} from "@/lib/progression";
import {
  ProgressionChart,
  type VolumePeakMarker,
} from "@/components/progression-chart";
import { CheckCircle, ChevronDown, ChevronRight, X } from "lucide-react";
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
  competitionMaxes?: Partial<Record<LiftKey, number | null>>;
  tracksRpe?: boolean;
  hasPrimaryDays?: boolean;
  highlightedExercise: HighlightedExercise | null;
  onClearHighlight: () => void;
}

let compareSeriesCounter = 0;
const COMPARE_MAX_SERIES = COMPARE_COLORS.length;

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

interface HighlightSnapshot {
  chartMode: "e1rm" | "volume";
  compareMode: boolean;
  repFilter: RepFilterKey;
  primaryOnly: boolean;
  granularity: ProgressionGranularity;
  visibleLifts: Set<LiftKey>;
  variationByLift: VariationSelection;
  selectedProgramIds: Set<number>;
}

interface VolumePeakMoment extends VolumePeakMarker {
  peak: Types.VolumeResponsePeak;
  volumeLbs: number;
  color: string;
}

function emptyVariationSelection(): VariationSelection {
  return {
    squat: new Set<string>(),
    bench: new Set<string>(),
    deadlift: new Set<string>(),
  };
}

function cloneVariationSelection(selection: VariationSelection): VariationSelection {
  return {
    squat: new Set(selection.squat),
    bench: new Set(selection.bench),
    deadlift: new Set(selection.deadlift),
  };
}

function setEquals<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function liftKeyFromCategory(category: string | null | undefined): LiftKey | null {
  for (const lift of LIFTS) {
    if (liftMatches(category, lift.key)) return lift.key;
  }
  return null;
}

function repFilterForReps(reps: number): RepFilterKey {
  if (reps === 1) return "singles";
  if (reps === 2) return "doubles";
  if (reps === 3) return "triples";
  return "all";
}

function highlightedExerciseKey(
  highlightedExercise: HighlightedExercise | null,
): string | null {
  if (!highlightedExercise) return null;
  return [
    highlightedExercise.lift_category,
    highlightedExercise.exercise_name,
    highlightedExercise.program_number,
    highlightedExercise.week_number,
    highlightedExercise.day_number,
    highlightedExercise.reps,
    Math.round(highlightedExercise.weight_lbs * 100) / 100,
  ].join("|");
}

function isSeriesPointMeta(value: ChartRowValue): value is SeriesPointMeta {
  if (typeof value !== "object" || value == null) return false;
  const candidate = value as Partial<SeriesPointMeta>;
  return (
    typeof candidate.exerciseName === "string" &&
    typeof candidate.weightLbs === "number" &&
    typeof candidate.reps === "number" &&
    typeof candidate.e1rmLbs === "number" &&
    typeof candidate.weekNumber === "number" &&
    typeof candidate.dayNumber === "number"
  );
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

function profileToneStyle(profile: Types.VolumeResponseProfile): CSSProperties {
  if (profile.profile === "rising") {
    return {
      background: "rgba(16, 185, 129, 0.12)",
      border: "1px solid rgba(16, 185, 129, 0.35)",
      color: "var(--cloud-success-text)",
    };
  }
  if (profile.profile === "tapered") {
    return {
      background: "rgba(245, 158, 11, 0.12)",
      border: "1px solid rgba(245, 158, 11, 0.35)",
      color: "var(--cloud-warning-text)",
    };
  }
  if (profile.profile === "mixed") {
    return {
      background: "rgba(12, 92, 171, 0.16)",
      border: "1px solid rgba(12, 92, 171, 0.36)",
      color: "var(--cloud-primary-text)",
    };
  }
  if (profile.profile === "steady") {
    return {
      background: "rgba(12, 92, 171, 0.16)",
      border: "1px solid rgba(12, 92, 171, 0.36)",
      color: "var(--cloud-primary-text)",
    };
  }
  return {
    background: "var(--cloud-panel)",
    border: "1px solid var(--cloud-border)",
    color: "var(--cloud-text-muted)",
  };
}

function confidencePercent(score: number): number {
  return Math.round(score <= 1 ? score * 100 : score);
}

function VolumeResponseTag({ profile }: { profile: Types.VolumeResponseProfile }) {
  const lift = LIFTS.find((item) => liftMatches(profile.lift_category, item.key));
  const confidence = confidencePercent(profile.confidence.score);
  return (
    <div
      title={profile.confidence.explanation}
      style={{
        ...profileToneStyle(profile),
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: lift?.color ?? "var(--cloud-text-dim)",
        }}
      />
      <span style={{ color: lift?.color ?? "var(--cloud-text-muted)" }}>
        {lift?.label ?? profile.lift_category}
      </span>
      <span>{profile.profile_label}</span>
      <span style={{ color: "var(--cloud-text-muted)" }}>{confidence}%</span>
    </div>
  );
}

function DataQualityTable({
  title,
  issues,
  unit,
}: {
  title: string;
  issues: Types.DataQualityIssue[];
  unit: WeightUnit;
}) {
  return (
    <div>
      <div
        style={{
          color: "var(--cloud-text-dim)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            textAlign: "left",
            borderCollapse: "collapse",
            fontSize: 12,
          }}
        >
          <thead>
            <tr style={{ color: "var(--cloud-text-dim)" }}>
              {["Where", "Lift", "Set", "Reason", "Source"].map((heading) => (
                <th
                  key={heading}
                  style={{
                    padding: "4px 12px 4px 0",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {issues.map((issue, index) => {
              const where = [
                issue.program_number != null ? `P${issue.program_number}` : null,
                issue.week_number != null ? `W${issue.week_number}` : null,
                issue.day_name ??
                  (issue.day_number != null ? `D${issue.day_number}` : null),
              ]
                .filter(Boolean)
                .join(", ");
              const setDesc =
                issue.weight_lbs != null && issue.reps != null
                  ? `${Math.round(convertWeight(issue.weight_lbs, unit)).toLocaleString("en-US")} ${unit} x ${issue.reps}${
                      issue.actual_rpe != null ? ` @ ${issue.actual_rpe}` : ""
                    }`
                  : "-";
              const sourceUrl = safeHttpUrl(issue.google_sheet_url);
              return (
                <tr
                  key={`${issue.category}-${index}`}
                  style={{
                    borderTop: "1px solid var(--cloud-border)",
                    color: "var(--cloud-text)",
                  }}
                >
                  <td style={{ padding: "5px 12px 5px 0", whiteSpace: "nowrap" }}>
                    {where || "-"}
                  </td>
                  <td style={{ padding: "5px 12px 5px 0" }}>
                    <span style={{ textTransform: "capitalize" }}>
                      {issue.lift_category ?? "-"}
                    </span>
                    {issue.exercise_name && (
                      <span style={{ color: "var(--cloud-text-dim)", marginLeft: 5 }}>
                        ({issue.exercise_name})
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "5px 12px 5px 0", whiteSpace: "nowrap" }}>
                    {setDesc}
                  </td>
                  <td style={{ padding: "5px 12px 5px 0" }}>{issue.reason}</td>
                  <td style={{ padding: "5px 0" }}>
                    {sourceUrl ? (
                      <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "var(--cloud-primary-text)",
                          textDecoration: "none",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Open source
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DataQualityBanner({
  athleteId,
  data,
  isOpen,
  onToggle,
  unit,
}: {
  athleteId: number;
  data: Types.DataQualityResponse;
  isOpen: boolean;
  onToggle: () => void;
  unit: WeightUnit;
}) {
  const outlierCount = data.outliers.length;
  const excludedCount = data.excluded.length;
  const hasIssues = outlierCount > 0 || excludedCount > 0;
  const storageKey = `bestrong.dq.dismissed.${athleteId}.${data.plotted_top_sets}_${data.total_top_sets}_${outlierCount}_${excludedCount}`;
  const subscribe = useCallback((callback: () => void) => {
    if (typeof window === "undefined") return () => {};
    window.addEventListener("bestrong:dqDismissChanged", callback);
    window.addEventListener("storage", callback);
    return () => {
      window.removeEventListener("bestrong:dqDismissChanged", callback);
      window.removeEventListener("storage", callback);
    };
  }, []);
  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  }, [storageKey]);
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, () => false);
  if (dismissed) return null;

  const tone: CSSProperties = hasIssues
    ? {
        background: "rgba(245, 158, 11, 0.10)",
        border: "1px solid rgba(245, 158, 11, 0.35)",
        color: "var(--cloud-warning-text)",
      }
    : {
        background: "rgba(16, 185, 129, 0.08)",
        border: "1px solid rgba(16, 185, 129, 0.30)",
        color: "var(--cloud-success-text)",
      };

  const dismiss = () => {
    try {
      window.localStorage.setItem(storageKey, "1");
      window.dispatchEvent(new Event("bestrong:dqDismissChanged"));
    } catch {}
  };

  return (
    <div className="cloud-panel-raised" style={{ ...tone, borderRadius: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 12px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            fontSize: 12,
          }}
        >
          <CheckCircle style={{ width: 16, height: 16 }} />
          <span style={{ fontWeight: 700 }}>
            {data.plotted_top_sets} of {data.total_top_sets} top sets plotted
          </span>
          {outlierCount > 0 && (
            <span>
              {outlierCount} outlier{outlierCount === 1 ? "" : "s"}
            </span>
          )}
          {excludedCount > 0 && <span>{excludedCount} excluded</span>}
          {!hasIssues && <span style={{ opacity: 0.82 }}>No issues detected</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {hasIssues && (
            <button
              type="button"
              onClick={onToggle}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                border: "1px solid rgba(245, 158, 11, 0.40)",
                background: "transparent",
                color: "var(--cloud-warning-text)",
                borderRadius: 999,
                padding: "4px 9px",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {isOpen ? (
                <>
                  <ChevronDown style={{ width: 13, height: 13 }} />
                  Hide review
                </>
              ) : (
                <>
                  <ChevronRight style={{ width: 13, height: 13 }} />
                  Review
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss data quality banner"
            title="Dismiss"
            style={{
              display: "inline-grid",
              placeItems: "center",
              width: 24,
              height: 24,
              border: "1px solid transparent",
              background: "transparent",
              color: "inherit",
              borderRadius: 999,
              cursor: "pointer",
            }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>
      {isOpen && hasIssues && (
        <div
          style={{
            borderTop: "1px solid rgba(245, 158, 11, 0.22)",
            padding: "10px 12px 12px",
            display: "grid",
            gap: 12,
          }}
        >
          {outlierCount > 0 && (
            <DataQualityTable
              title={`Outliers (${outlierCount})`}
              issues={data.outliers}
              unit={unit}
            />
          )}
          {excludedCount > 0 && (
            <DataQualityTable
              title={`Excluded from chart (${excludedCount})`}
              issues={data.excluded}
              unit={unit}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ChartStateCard({
  eyebrow,
  title,
  detail,
  loading = false,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  loading?: boolean;
}) {
  return (
    <div
      className="cloud-panel-raised"
      style={{
        border: "1px solid var(--cloud-border)",
        borderRadius: 8,
        background: "var(--cloud-surface-raised)",
        padding: "18px 20px",
        minHeight: 180,
        display: "grid",
        alignContent: "center",
        justifyItems: "center",
        textAlign: "center",
        gap: 8,
      }}
      aria-busy={loading}
    >
      <div
        style={{
          color: "var(--cloud-primary-text)",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {eyebrow}
      </div>
      <div style={{ color: "var(--cloud-text)", fontSize: 15, fontWeight: 800 }}>
        {title}
      </div>
      <div
        style={{
          color: "var(--cloud-text-muted)",
          fontSize: 13,
          lineHeight: 1.5,
          maxWidth: 540,
        }}
      >
        {detail}
      </div>
    </div>
  );
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
export function ProgressionPanel({
  athleteId,
  unit,
  competitionMaxes,
  tracksRpe = true,
  hasPrimaryDays = false,
  highlightedExercise,
  onClearHighlight,
}: Props) {
  const [chartMode, setChartMode] = useState<"e1rm" | "volume">("e1rm");
  const [compareMode, setCompareMode] = useState(false);
  const [compareSeries, setCompareSeries] = useState<CompareSeries[]>(() => [
    {
      id: newCompareSeriesId(),
      lift: "squat",
      repFilter: "1-3",
      primaryOnly: false,
    },
  ]);
  const [repFilter, setRepFilter] = useState<RepFilterKey>("1-3");
  const [primaryOnly, setPrimaryOnly] = useState(false);
  const [granularity, setGranularity] =
    useState<ProgressionGranularity>("block");
  const [showPeakTable, setShowPeakTable] = useState(false);
  const [overlayPeaks, setOverlayPeaks] = useState(false);
  const [dataQualityOpen, setDataQualityOpen] = useState(false);
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
  const chartSectionRef = useRef<HTMLDivElement | null>(null);
  const previousHighlightIdentityRef = useRef<string | null>(null);
  const [preHighlightSnapshot, setPreHighlightSnapshot] =
    useState<HighlightSnapshot | null>(null);

  const { minReps, maxReps } = repFilterRange(repFilter);
  const usePrimaryFilter = hasPrimaryDays && primaryOnly;
  const showRpeFields = tracksRpe !== false;
  const {
    data: e1rmTrends = [] as Types.E1RMDataPoint[],
    isLoading: e1rmLoading,
  } = useQuery({
    queryKey: ["progression-e1rm", athleteId, repFilter, usePrimaryFilter],
    queryFn: () =>
      apiClient.getE1RMTrends(athleteId, {
        minReps,
        maxReps,
        primaryOnly: usePrimaryFilter ? true : undefined,
      }),
  });
  const {
    data: volumeTrends = [] as Types.VolumeDataPoint[],
    isLoading: volumeLoading,
  } = useQuery({
    queryKey: ["progression-volume", athleteId],
    queryFn: () => apiClient.getVolumeTrends(athleteId),
    enabled: !compareMode && chartMode === "volume",
  });
  const { data: volumeResponseData, isLoading: volumeResponseLoading } = useQuery({
    queryKey: ["progression-volume-response", athleteId],
    queryFn: () =>
      apiClient.getVolumeResponse(athleteId, {
        topN: 5,
        trailingWeeks: 6,
      }),
    enabled: !compareMode && chartMode === "volume",
  });
  const { data: dataQuality, isLoading: dataQualityLoading } = useQuery({
    queryKey: ["progression-data-quality", athleteId],
    queryFn: () => apiClient.getDataQuality(athleteId),
    enabled: !compareMode && chartMode === "e1rm",
  });
  const compareSeriesQueries = useQueries({
    queries: compareSeries.map((series) => {
      const range = repFilterRange(series.repFilter);
      const useSeriesPrimaryOnly = hasPrimaryDays && series.primaryOnly;
      return {
        queryKey: [
          "progression-compare",
          athleteId,
          series.lift,
          series.repFilter,
          useSeriesPrimaryOnly,
        ],
        queryFn: () =>
          apiClient.getE1RMTrends(athleteId, {
            liftCategory: series.lift,
            minReps: range.minReps,
            maxReps: range.maxReps,
            primaryOnly: useSeriesPrimaryOnly ? true : undefined,
          }),
        enabled: compareMode,
      };
    }),
  });
  const {
    data: programs = [] as Types.ProgramListResponse[],
    isLoading: programsLoading,
  } = useQuery({
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

  const defaultSelectedVariations = useMemo<VariationSelection>(() => {
    const resolve = (lift: LiftKey): Set<string> => {
      const opts = variations[lift];
      if (opts.length === 0) return new Set<string>();
      const pick = opts.find((o) => o.isCompetition) ?? opts[0];
      return new Set<string>([pick.canonical]);
    };
    return {
      squat: resolve("squat"),
      bench: resolve("bench"),
      deadlift: resolve("deadlift"),
    };
  }, [variations]);

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
      return defaultSelectedVariations[lift];
    };
    return {
      squat: resolve("squat"),
      bench: resolve("bench"),
      deadlift: resolve("deadlift"),
    };
  }, [defaultSelectedVariations, variations, variationByLift]);

  const highlightIdentity = useMemo(
    () => highlightedExerciseKey(highlightedExercise),
    [highlightedExercise],
  );
  const highlightedLift = useMemo(
    () => liftKeyFromCategory(highlightedExercise?.lift_category),
    [highlightedExercise?.lift_category],
  );

  const restoreHighlightSnapshot = useCallback(() => {
    if (!preHighlightSnapshot) return;
    setChartMode(preHighlightSnapshot.chartMode);
    setCompareMode(preHighlightSnapshot.compareMode);
    setRepFilter(preHighlightSnapshot.repFilter);
    setPrimaryOnly(preHighlightSnapshot.primaryOnly);
    setGranularity(preHighlightSnapshot.granularity);
    setVisibleLifts(new Set(preHighlightSnapshot.visibleLifts));
    setVariationByLift(cloneVariationSelection(preHighlightSnapshot.variationByLift));
    setSelectedProgramIds(new Set(preHighlightSnapshot.selectedProgramIds));
    setPreHighlightSnapshot(null);
    previousHighlightIdentityRef.current = null;
  }, [preHighlightSnapshot]);

  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      if (!highlightIdentity || !highlightedExercise) {
        if (previousHighlightIdentityRef.current) restoreHighlightSnapshot();
        previousHighlightIdentityRef.current = null;
        return;
      }
      if (previousHighlightIdentityRef.current === highlightIdentity) return;
      previousHighlightIdentityRef.current = highlightIdentity;

      setPreHighlightSnapshot((current) =>
        current ?? {
          chartMode,
          compareMode,
          repFilter,
          primaryOnly,
          granularity,
          visibleLifts: new Set(visibleLifts),
          variationByLift: cloneVariationSelection(variationByLift),
          selectedProgramIds: new Set(selectedProgramIds),
        },
      );
      setCompareMode(false);
      setChartMode("e1rm");
      setGranularity("week");
      setPrimaryOnly(false);
      setRepFilter(repFilterForReps(highlightedExercise.reps));
      setSelectedProgramIds(new Set<number>());
      if (highlightedLift) {
        setVisibleLifts((current) => {
          if (current.has(highlightedLift)) return current;
          const next = new Set(current);
          next.add(highlightedLift);
          return next;
        });
      }
    });

    return () => cancelAnimationFrame(handle);
  }, [
    chartMode,
    compareMode,
    granularity,
    highlightedExercise,
    highlightedLift,
    highlightIdentity,
    primaryOnly,
    repFilter,
    restoreHighlightSnapshot,
    selectedProgramIds,
    variationByLift,
    visibleLifts,
  ]);

  useEffect(() => {
    if (!highlightIdentity) return;
    const handle = requestAnimationFrame(() => {
      chartSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => cancelAnimationFrame(handle);
  }, [highlightIdentity]);

  const highlightedVariationCanonical = useMemo(() => {
    if (!highlightedExercise || !highlightedLift) return null;
    const exactWeight = Math.round(highlightedExercise.weight_lbs);
    const exact = e1rmTrends.find(
      (point) =>
        liftMatches(point.lift_category, highlightedLift) &&
        point.program_number === highlightedExercise.program_number &&
        point.week_number === highlightedExercise.week_number &&
        point.day_number === highlightedExercise.day_number &&
        point.reps === highlightedExercise.reps &&
        Math.round(point.weight_lbs) === exactWeight &&
        point.exercise_name === highlightedExercise.exercise_name,
    );
    const fallback = exact
      ? null
      : e1rmTrends.find(
          (point) =>
            liftMatches(point.lift_category, highlightedLift) &&
            point.program_number === highlightedExercise.program_number &&
            point.week_number === highlightedExercise.week_number &&
            point.day_number === highlightedExercise.day_number &&
            point.reps === highlightedExercise.reps,
        );
    return (exact ?? fallback)?.canonical_exercise_name?.trim() || null;
  }, [e1rmTrends, highlightedExercise, highlightedLift]);

  useEffect(() => {
    if (!highlightIdentity || !highlightedLift || !highlightedVariationCanonical) {
      return;
    }
    const handle = requestAnimationFrame(() => {
      setVariationByLift((currentSelection) => {
        const current =
          currentSelection[highlightedLift].size > 0
            ? currentSelection[highlightedLift]
            : effectiveSelectedVariations[highlightedLift];
        if (current.has(highlightedVariationCanonical)) return currentSelection;
        const next = new Set(current);
        next.add(highlightedVariationCanonical);
        return { ...currentSelection, [highlightedLift]: next };
      });
    });
    return () => cancelAnimationFrame(handle);
  }, [
    effectiveSelectedVariations,
    highlightedLift,
    highlightedVariationCanonical,
    highlightIdentity,
  ]);

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
        label: compareSeriesLabel({
          ...seriesItem,
          primaryOnly: hasPrimaryDays && seriesItem.primaryOnly,
        }),
        color: COMPARE_COLORS[index % COMPARE_COLORS.length],
      })),
    [compareSeries, hasPrimaryDays],
  );
  const activeChartSeries = useMemo<ProgressionChartSeries[]>(
    () =>
      compareMode
        ? compareChartSeries
        : chartMode === "e1rm"
          ? series.series.filter(
              (item) => !item.lift || visibleLifts.has(item.lift),
            )
          : LIFTS.filter((lift) => visibleLifts.has(lift.key)),
    [chartMode, compareChartSeries, compareMode, series.series, visibleLifts],
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
  const volumePeakLabel = useCallback(
    (peak: Types.VolumeResponsePeak) =>
      granularity === "week"
        ? `P${peak.program_number ?? "?"} W${peak.week_number}`
        : `P${peak.program_number ?? "?"}`,
    [granularity],
  );
  const volumeRowByLabel = useMemo(() => {
    const rows = new Map<string, ChartRow>();
    for (const row of series.rows) {
      rows.set(row.label, row);
    }
    return rows;
  }, [series.rows]);
  const visibleVolumeProfiles = useMemo(() => {
    const profiles = volumeResponseData?.profiles ?? [];
    return LIFTS.map((lift) =>
      profiles.find((profile) => liftMatches(profile.lift_category, lift.key)),
    ).filter((profile): profile is Types.VolumeResponseProfile => {
      if (!profile) return false;
      const lift = LIFTS.find((item) => liftMatches(profile.lift_category, item.key));
      return lift != null && visibleLifts.has(lift.key);
    });
  }, [visibleLifts, volumeResponseData]);
  const volumePeakMoments = useMemo<VolumePeakMoment[]>(() => {
    const moments: VolumePeakMoment[] = [];
    for (const profile of visibleVolumeProfiles) {
      const lift = LIFTS.find((item) => liftMatches(profile.lift_category, item.key));
      if (!lift) continue;
      profile.peaks.forEach((peak, index) => {
        const label = volumePeakLabel(peak);
        const row = volumeRowByLabel.get(label);
        const value = row?.[lift.key];
        if (typeof value !== "number") return;
        moments.push({
          lift: lift.key,
          label,
          rank: index + 1,
          peak,
          volumeLbs: value,
          color: lift.color,
        });
      });
    }
    return moments;
  }, [visibleVolumeProfiles, volumePeakLabel, volumeRowByLabel]);
  const volumePeakMarkers = useMemo<VolumePeakMarker[]>(
    () =>
      overlayPeaks
        ? volumePeakMoments.map((moment) => ({
            lift: moment.lift,
            label: moment.label,
            rank: moment.rank,
          }))
        : [],
    [overlayPeaks, volumePeakMoments],
  );

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
  const highlightMarker = useMemo(() => {
    if (
      !highlightedExercise ||
      !highlightedLift ||
      compareMode ||
      chartMode !== "e1rm"
    ) {
      return null;
    }
    const label = `P${highlightedExercise.program_number} W${highlightedExercise.week_number}`;
    const row = displayRows.find((item) => item.label === label);
    if (!row) return null;

    const liftSeries = activeChartSeries.filter(
      (item) => item.lift === highlightedLift,
    );
    const exactSeries = liftSeries.find((item) => {
      const meta = row[`${item.key}__meta`];
      if (!isSeriesPointMeta(meta)) return false;
      return (
        meta.exerciseName === highlightedExercise.exercise_name &&
        meta.weekNumber === highlightedExercise.week_number &&
        meta.dayNumber === highlightedExercise.day_number &&
        meta.reps === highlightedExercise.reps &&
        Math.round(meta.weightLbs) === Math.round(highlightedExercise.weight_lbs)
      );
    });
    const targetSeries = exactSeries ?? (liftSeries.length === 1 ? liftSeries[0] : null);
    if (!targetSeries) return null;
    const value = row[targetSeries.key];
    if (typeof value !== "number") return null;
    return {
      label,
      y: value,
      color: targetSeries.color,
    };
  }, [
    activeChartSeries,
    chartMode,
    compareMode,
    displayRows,
    highlightedExercise,
    highlightedLift,
  ]);
  const chartableRows = useMemo(
    () =>
      displayRows.filter((row) =>
        activeChartSeries.some((item) => typeof row[item.key] === "number"),
      ),
    [activeChartSeries, displayRows],
  );
  const chartHasData = chartableRows.length >= 2;

  const displayCompetitionMaxes = useMemo<
    Partial<Record<LiftKey, number | null>> | undefined
  >(() => {
    if (!competitionMaxes) return undefined;
    const next: Partial<Record<LiftKey, number | null>> = {};
    for (const lift of LIFTS) {
      const value = competitionMaxes[lift.key];
      next[lift.key] =
        value == null ? null : unit === "lbs" ? value : convertWeight(value, unit);
    }
    return next;
  }, [competitionMaxes, unit]);

  const filtersDirty = useMemo(() => {
    const defaultLifts = new Set<LiftKey>(["squat", "bench", "deadlift"]);
    const variationsDirty = LIFTS.some(
      (lift) =>
        !setEquals(
          effectiveSelectedVariations[lift.key],
          defaultSelectedVariations[lift.key],
        ),
    );
    return (
      repFilter !== "1-3" ||
      primaryOnly ||
      !setEquals(visibleLifts, defaultLifts) ||
      variationsDirty ||
      selectedProgramIds.size > 0
    );
  }, [
    defaultSelectedVariations,
    effectiveSelectedVariations,
    primaryOnly,
    repFilter,
    selectedProgramIds,
    visibleLifts,
  ]);

  const resetFilters = () => {
    setRepFilter("1-3");
    setPrimaryOnly(false);
    setVisibleLifts(new Set<LiftKey>(["squat", "bench", "deadlift"]));
    setVariationByLift(emptyVariationSelection());
    setSelectedProgramIds(new Set<number>());
  };

  const clearHighlightedExercise = useCallback(() => {
    restoreHighlightSnapshot();
    onClearHighlight();
  }, [onClearHighlight, restoreHighlightSnapshot]);

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
    patch: Partial<Pick<CompareSeries, "lift" | "repFilter" | "primaryOnly">>,
  ) => {
    setCompareSeries((prev) =>
      prev.map((seriesItem) =>
        seriesItem.id === id ? { ...seriesItem, ...patch } : seriesItem,
      ),
    );
  };

  const addCompareSeries = () => {
    setCompareSeries((prev) =>
      prev.length >= COMPARE_MAX_SERIES
        ? prev
        : [
            ...prev,
            {
              id: newCompareSeriesId(),
              lift: "squat",
              repFilter: "1-3",
              primaryOnly: false,
            },
          ],
    );
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
  const compareSlotsLeft = Math.max(0, COMPARE_MAX_SERIES - compareSeries.length);
  const compareLoading = compareSeriesQueries.some((query) => query.isLoading);
  const isChartLoading =
    programsLoading ||
    (compareMode
      ? compareLoading
      : chartMode === "volume"
        ? volumeLoading
        : e1rmLoading || (e1rmTrends.length === 0 && dataQualityLoading));
  const emptyState = useMemo(() => {
    if (compareMode) {
      const suggestions: string[] = [];
      if (compareSeries.some((item) => item.repFilter !== "all")) {
        suggestions.push("widening one or more series rep ranges");
      }
      if (hasPrimaryDays && compareSeries.some((item) => item.primaryOnly)) {
        suggestions.push("turning off Primary day only on a series");
      }
      if (blockFilterActive) suggestions.push("clearing the block filter");
      return {
        title: "No compare rows match the current series.",
        detail:
          suggestions.length > 0
            ? `Try ${suggestions.join(", ")}.`
            : "Try adding a broader series or importing more training history.",
      };
    }

    if (chartMode === "volume") {
      if (volumeTrends.length === 0) {
        return {
          title: "No volume data yet.",
          detail: "Import training programs with weekly volume to build this chart.",
        };
      }
      const suggestions: string[] = [];
      if (blockFilterActive) suggestions.push("clearing the block filter");
      if (visibleLifts.size < LIFTS.length) suggestions.push("enabling more lifts");
      return {
        title: "No volume rows match the current filters.",
        detail:
          suggestions.length > 0
            ? `Try ${suggestions.join(", ")}.`
            : "Try importing more volume history.",
      };
    }

    const hasAnyProgressionData =
      dataQuality != null ? dataQuality.total_top_sets > 0 : e1rmTrends.length > 0;
    if (!hasAnyProgressionData) {
      return {
        title: "No progression data yet.",
        detail: "Import training programs with top sets to build this chart.",
      };
    }
    const suggestions: string[] = [];
    if (repFilter !== "all") suggestions.push("widening the rep range");
    if (usePrimaryFilter) suggestions.push("turning off Primary day");
    if (blockFilterActive) suggestions.push("clearing the block filter");
    if (visibleLifts.size < LIFTS.length) suggestions.push("enabling more lifts");
    const variationIsNarrow = LIFTS.some((lift) => {
      if (!visibleLifts.has(lift.key)) return false;
      const optionCount = variations[lift.key].length;
      const selectedCount = effectiveSelectedVariations[lift.key].size;
      return optionCount > selectedCount && selectedCount > 0;
    });
    if (variationIsNarrow) suggestions.push("selecting more variations");
    return {
      title: "No e1RM rows match the current filters.",
      detail:
        suggestions.length > 0
          ? `Try ${suggestions.join(", ")}.`
          : "Try importing more training history.",
    };
  }, [
    blockFilterActive,
    chartMode,
    compareMode,
    compareSeries,
    dataQuality,
    e1rmTrends.length,
    effectiveSelectedVariations,
    hasPrimaryDays,
    repFilter,
    usePrimaryFilter,
    variations,
    visibleLifts,
    volumeTrends.length,
  ]);
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
                  style={{ minWidth: 240, maxWidth: 360 }}
                >
                  <div style={{ maxHeight: 300, overflowY: "auto" }}>
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
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowManageVariations(true)}
                  >
                    Manage variations
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {hasPrimaryDays && (
                <button
                  type="button"
                  onClick={() => setPrimaryOnly((value) => !value)}
                  aria-pressed={primaryOnly}
                  title="Show only the athlete's primary training day for each lift"
                  style={pillButton(primaryOnly)}
                >
                  Primary day
                </button>
              )}
            </>
          )}

          {!compareMode && chartMode === "volume" && (
            <>
              <span aria-hidden style={CONTROL_DIVIDER} />
              <button
                type="button"
                onClick={() => setOverlayPeaks((value) => !value)}
                aria-pressed={overlayPeaks}
                title="Show numbered peak moments on the volume chart"
                style={pillButton(overlayPeaks)}
              >
                Overlay peaks
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

          {filtersDirty && (
            <>
              <span aria-hidden style={CONTROL_DIVIDER} />
              <button
                type="button"
                onClick={resetFilters}
                style={pillButton(false)}
                title="Reset rep range, primary day, lifts, variations, and blocks"
              >
                Reset filters
              </button>
            </>
          )}
        </div>

        {!compareMode && chartMode === "e1rm" && !hasPrimaryDays && (
          <div
            className="cloud-panel-raised"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid rgba(245, 158, 11, 0.30)",
              background: "rgba(245, 158, 11, 0.10)",
              color: "var(--cloud-warning-text)",
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            <span style={{ fontWeight: 700 }}>Primary days are not set.</span>
            <span>
              Set primary days from the athlete menu to filter this chart to main
              training days.
            </span>
          </div>
        )}

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
                    gridTemplateColumns: hasPrimaryDays
                      ? "10px minmax(108px, 1fr) minmax(124px, 1fr) auto auto"
                      : "10px minmax(108px, 1fr) minmax(124px, 1fr) auto",
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
                  {hasPrimaryDays && (
                    <button
                      type="button"
                      onClick={() =>
                        updateCompareSeries(seriesItem.id, {
                          primaryOnly: !seriesItem.primaryOnly,
                        })
                      }
                      aria-pressed={seriesItem.primaryOnly}
                      style={{
                        ...pillButton(seriesItem.primaryOnly),
                        justifyContent: "center",
                        padding: "6px 10px",
                      }}
                    >
                      Primary day only
                    </button>
                  )}
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={addCompareSeries}
                disabled={compareSeries.length >= COMPARE_MAX_SERIES}
                style={{
                  alignSelf: "flex-start",
                  background: "var(--cloud-panel)",
                  border: "1px solid var(--cloud-border)",
                  color:
                    compareSeries.length >= COMPARE_MAX_SERIES
                      ? "var(--cloud-text-dim)"
                      : "var(--cloud-primary-text)",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: 999,
                  cursor:
                    compareSeries.length >= COMPARE_MAX_SERIES
                      ? "not-allowed"
                      : "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "0.02em",
                  opacity: compareSeries.length >= COMPARE_MAX_SERIES ? 0.65 : 1,
                }}
              >
                Add series
              </button>
              <span
                style={{
                  color: "var(--cloud-text-dim)",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {compareSlotsLeft} slot{compareSlotsLeft === 1 ? "" : "s"} left
              </span>
            </div>
          </section>
        )}

        <div
          ref={chartSectionRef}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--cloud-s3)",
          }}
        >
          {highlightedExercise && (
            <div
              className="cloud-panel-raised"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid rgba(245, 158, 11, 0.36)",
                background: "rgba(245, 158, 11, 0.11)",
                color: "var(--cloud-warning-text)",
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  minWidth: 0,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "var(--cloud-warning-text)",
                    boxShadow: "0 0 0 4px rgba(245, 158, 11, 0.18)",
                    flex: "0 0 auto",
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "var(--cloud-text)", fontWeight: 800 }}>
                    Showing {highlightedExercise.exercise_name}
                  </div>
                  <div
                    style={{
                      color: "var(--cloud-text-muted)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {highlightedExercise.reps} x{" "}
                    {Math.round(
                      convertWeight(highlightedExercise.weight_lbs, unit),
                    ).toLocaleString("en-US")}{" "}
                    {unit} from P{highlightedExercise.program_number} W
                    {highlightedExercise.week_number} D
                    {highlightedExercise.day_number}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={clearHighlightedExercise}
                style={{
                  border: "1px solid rgba(245, 158, 11, 0.42)",
                  background: "var(--cloud-panel)",
                  color: "var(--cloud-warning-text)",
                  borderRadius: 999,
                  padding: "5px 10px",
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}
              >
                Clear
              </button>
            </div>
          )}

          {!compareMode &&
            chartMode === "e1rm" &&
            dataQuality &&
            dataQuality.total_top_sets > 0 &&
            chartHasData && (
              <DataQualityBanner
                athleteId={athleteId}
                data={dataQuality}
                isOpen={dataQualityOpen}
                onToggle={() => setDataQualityOpen((value) => !value)}
                unit={unit}
              />
            )}

          {isChartLoading ? (
            <ChartStateCard
              eyebrow="Progression"
              title="Loading chart data."
              detail="Checking the athlete's training history and active filters."
              loading
            />
          ) : !chartHasData ? (
            <ChartStateCard
              eyebrow="Progression"
              title={emptyState.title}
              detail={emptyState.detail}
            />
          ) : (
            <ProgressionChart
              rows={displayRows}
              visibleLifts={visibleLifts}
              unit={unit}
              mode={compareMode ? "e1rm" : chartMode}
              series={
                compareMode || chartMode === "e1rm" ? activeChartSeries : undefined
              }
              competitionMaxes={
                !compareMode && chartMode === "e1rm"
                  ? displayCompetitionMaxes
                  : undefined
              }
              tracksRpe={tracksRpe}
              volumePeakMarkers={
                !compareMode && chartMode === "volume" ? volumePeakMarkers : undefined
              }
              highlightMarker={
                !compareMode && chartMode === "e1rm" ? highlightMarker : null
              }
            />
          )}
        </div>

        {!compareMode && chartMode === "volume" && chartHasData && (
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
              VOLUME RESPONSE
            </div>
            {volumeResponseLoading ? (
              <div style={{ color: "var(--cloud-text-dim)", fontSize: 12 }}>
                Analyzing volume response.
              </div>
            ) : visibleVolumeProfiles.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {visibleVolumeProfiles.map((profile) => (
                  <VolumeResponseTag
                    key={profile.lift_category}
                    profile={profile}
                  />
                ))}
              </div>
            ) : (
              <div style={{ color: "var(--cloud-text-dim)", fontSize: 12 }}>
                No volume response tags are available for the selected lifts.
              </div>
            )}
          </section>
        )}

        {!compareMode && chartMode === "volume" && chartHasData && (
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
              PEAK MOMENTS
            </div>
            {volumeResponseLoading ? (
              <div style={{ color: "var(--cloud-text-dim)", fontSize: 12 }}>
                Loading peak moments.
              </div>
            ) : volumePeakMoments.length === 0 ? (
              <div style={{ color: "var(--cloud-text-dim)", fontSize: 12 }}>
                No peak moments match the current volume chart.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {LIFTS.filter((lift) => visibleLifts.has(lift.key)).map((lift) => {
                  const moments = volumePeakMoments.filter(
                    (moment) => moment.lift === lift.key,
                  );
                  if (moments.length === 0) return null;
                  return (
                    <div
                      key={lift.key}
                      style={{
                        border: "1px solid var(--cloud-border)",
                        borderRadius: 8,
                        background: "var(--cloud-panel)",
                        padding: "10px 12px",
                      }}
                    >
                      <div
                        style={{
                          color: lift.color,
                          fontSize: 12,
                          fontWeight: 800,
                          marginBottom: 8,
                        }}
                      >
                        {lift.label}
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                          gap: 8,
                        }}
                      >
                        {moments.map((moment) => (
                          <div
                            key={`${moment.lift}-${moment.rank}-${moment.label}-${moment.peak.week_number}-${moment.peak.day_number}`}
                            style={{
                              border: "1px solid var(--cloud-border)",
                              borderRadius: 8,
                              background: "rgba(255,255,255,0.02)",
                              padding: "8px 10px",
                              display: "grid",
                              gap: 3,
                              fontSize: 12,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                color: "var(--cloud-text)",
                                fontWeight: 700,
                              }}
                            >
                              <span
                                style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: "50%",
                                  display: "inline-grid",
                                  placeItems: "center",
                                  border: `2px solid ${moment.color}`,
                                  color: "var(--cloud-text)",
                                  background: "var(--cloud-surface-raised)",
                                  fontSize: 10,
                                  fontWeight: 800,
                                }}
                              >
                                {moment.rank}
                              </span>
                              <span>{moment.label}</span>
                            </div>
                            <div style={{ color: "var(--cloud-text-muted)" }}>
                              Volume {formatPeak(moment.volumeLbs)}
                            </div>
                            <div
                              title={moment.peak.exercise_name}
                              style={{
                                color: "var(--cloud-text-muted)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {moment.peak.exercise_name}
                            </div>
                            <div style={{ color: "var(--cloud-text-dim)" }}>
                              W{moment.peak.week_number} D{moment.peak.day_number}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {!compareMode && chartHasData && blockPeaks.length > 0 && (
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

        {!compareMode && chartHasData && peakEfforts.length > 0 && (
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
                    gridTemplateColumns: showRpeFields
                      ? "minmax(150px, 1.4fr) minmax(88px, 0.7fr) minmax(56px, 0.45fr) minmax(76px, 0.6fr) minmax(130px, 1fr)"
                      : "minmax(150px, 1.4fr) minmax(88px, 0.7fr) minmax(76px, 0.6fr) minmax(130px, 1fr)",
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
                  {showRpeFields && <span>RPE</span>}
                  <span>e1RM</span>
                  <span>Block</span>
                </div>
                {peakEfforts.map((effort) => (
                  <div
                    key={effort.canonicalName}
                    style={{
                      display: "grid",
                      gridTemplateColumns: showRpeFields
                        ? "minmax(150px, 1.4fr) minmax(88px, 0.7fr) minmax(56px, 0.45fr) minmax(76px, 0.6fr) minmax(130px, 1fr)"
                        : "minmax(150px, 1.4fr) minmax(88px, 0.7fr) minmax(76px, 0.6fr) minmax(130px, 1fr)",
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
                    {showRpeFields && (
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
                    )}
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
