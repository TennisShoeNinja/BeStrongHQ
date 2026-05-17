/**
 * Progression chart core.
 *
 * Shared data shaping for the coach progression panel and (later) the
 * simplified athlete-portal view. Two rules drive the design:
 *
 *  1. The e1RM line must not mix lift variations. `lift_category` lumps
 *     competition + paused + tempo + SSB squats under "squat", and e1RM
 *     normalises for reps/RPE but NOT for variation difficulty. So per
 *     lift we plot exactly one variation (the competition lift).
 *  2. Chart rows are indexed by program block or program week labels so
 *     coaches see training blocks as the x-axis categories.
 */
import type {
  E1RMDataPoint,
  OutlierReferencePoint,
  ProgramListResponse,
  VolumeDataPoint,
} from "@/lib/types";
import parseLocalDate from "@/lib/parseLocalDate";

export type LiftKey = "squat" | "bench" | "deadlift";

export const LIFTS: { key: LiftKey; label: string; color: string }[] = [
  { key: "squat", label: "Squat", color: "#7CB4ED" },
  { key: "bench", label: "Bench", color: "#F59E0B" },
  { key: "deadlift", label: "Deadlift", color: "#34D399" },
];

export const COMPARE_COLORS = [
  "#7CB4ED",
  "#F59E0B",
  "#34D399",
  "#E879F9",
  "#F87171",
  "#A78BFA",
];

export type RepFilterKey =
  | "all"
  | "singles"
  | "doubles"
  | "triples"
  | "1-3"
  | "1-5";

export const REP_FILTERS: {
  key: RepFilterKey;
  label: string;
  minReps?: number;
  maxReps?: number;
}[] = [
  { key: "all", label: "All reps" },
  { key: "singles", label: "Singles", minReps: 1, maxReps: 1 },
  { key: "doubles", label: "Doubles", minReps: 2, maxReps: 2 },
  { key: "triples", label: "Triples", minReps: 3, maxReps: 3 },
  { key: "1-3", label: "1-3 reps", minReps: 1, maxReps: 3 },
  { key: "1-5", label: "1-5 reps", minReps: 1, maxReps: 5 },
];

export function repFilterRange(key: RepFilterKey): {
  minReps?: number;
  maxReps?: number;
} {
  const f = REP_FILTERS.find((r) => r.key === key);
  return { minReps: f?.minReps, maxReps: f?.maxReps };
}

export interface CompareSeries {
  id: string;
  lift: LiftKey;
  repFilter: RepFilterKey;
}

export type ProgressionGranularity = "block" | "week";

export interface ProgressionChartSeries {
  key: string;
  label: string;
  lift?: LiftKey;
  color: string;
}

export function compareSeriesLabel(series: CompareSeries): string {
  const lift = LIFTS.find((l) => l.key === series.lift)?.label ?? series.lift;
  const reps =
    REP_FILTERS.find((filter) => filter.key === series.repFilter)?.label ??
    series.repFilter;
  return `${lift} ${reps}`;
}

/** Match an exercise's `lift_category` tag to one of the three lifts. */
export function liftMatches(
  entryLift: string | null | undefined,
  target: LiftKey,
): boolean {
  const l = (entryLift ?? "").toLowerCase().trim();
  if (target === "squat") return l === "squat" || l === "s" || l === "sq";
  if (target === "bench") return l.startsWith("bench") || l === "b" || l === "bp";
  if (target === "deadlift") return l.startsWith("dead") || l === "dl" || l === "d";
  return false;
}

/**
 * Heuristic: is this canonical exercise name the competition lift rather
 * than a paused/tempo/SSB/pin variation? `canonical_exercise_name` is
 * lowercase with collapsed whitespace. There is no explicit "primary
 * variation" flag in the data model yet (see .mex/TODO.md), so this is a
 * best-effort match: a "comp"/"competition" name, or the bare lift word.
 */
export function isCompetitionName(canonical: string, lift: LiftKey): boolean {
  const c = canonical.toLowerCase().trim();
  if (!c) return false;
  if (c.includes("comp")) return true;
  if (lift === "squat") return c === "squat" || c === "back squat";
  if (lift === "bench") return c === "bench" || c === "bench press";
  if (lift === "deadlift") return c === "deadlift" || c === "conventional deadlift";
  return false;
}

/**
 * Pick the competition variation for a lift: the comp-named variation
 * with the most data, else the densest variation. Returns the
 * `canonical_exercise_name`, or null when the lift has no plottable data.
 */
export function competitionVariation(
  points: E1RMDataPoint[],
  lift: LiftKey,
): string | null {
  const counts = new Map<string, number>();
  for (const p of points) {
    if (p.e1rm == null) continue;
    if (!liftMatches(p.lift_category, lift)) continue;
    const canon = (p.canonical_exercise_name ?? "").trim();
    if (!canon) continue;
    counts.set(canon, (counts.get(canon) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const comp = ranked.find(([canon]) => isCompetitionName(canon, lift));
  return (comp ?? ranked[0])[0];
}

export interface VariationOption {
  /** server canonical_exercise_name - the grouping key */
  canonical: string;
  /** representative raw exercise_name for display */
  label: string;
  /** plottable point count */
  count: number;
  /** heuristically the competition lift */
  isCompetition: boolean;
  /** newest plottable point timestamp */
  lastTs: number;
}

/**
 * Every variation of a lift the athlete has e1RM data for, sorted
 * competition-first then most-recent. Powers the variation picker.
 */
export function variationsForLift(
  points: E1RMDataPoint[],
  programs: ProgramListResponse[],
  lift: LiftKey,
): VariationOption[] {
  const startByProgram = programStartTimestamps(programs);
  const groups = new Map<
    string,
    { label: string; count: number; lastTs: number }
  >();
  for (const p of points) {
    if (p.e1rm == null) continue;
    if (!liftMatches(p.lift_category, lift)) continue;
    const canon = (p.canonical_exercise_name ?? "").trim();
    if (!canon) continue;
    let g = groups.get(canon);
    if (!g) {
      g = { label: p.exercise_name?.trim() || canon, count: 0, lastTs: 0 };
      groups.set(canon, g);
    }
    g.count += 1;
    const ts = pointTimestamp(p, startByProgram);
    if (ts != null && ts > g.lastTs) g.lastTs = ts;
  }
  const out: VariationOption[] = Array.from(groups.entries()).map(
    ([canonical, g]) => ({
      canonical,
      label: g.label,
      count: g.count,
      isCompetition: isCompetitionName(canonical, lift),
      lastTs: g.lastTs,
    }),
  );
  out.sort((a, b) => {
    if (a.isCompetition !== b.isCompetition) return a.isCompetition ? -1 : 1;
    if (b.lastTs !== a.lastTs) return b.lastTs - a.lastTs;
    return b.count - a.count;
  });
  return out;
}

export interface SeriesPointMeta {
  exerciseName: string;
  weightLbs: number;
  reps: number;
  actualRpe: number | null;
  e1rmLbs: number;
  weekNumber: number;
  dayNumber: number;
  sourceUrl: string | null;
  isOutlier: boolean;
  outlierReason: string | null;
  outlierAverageLbs: number | null;
  outlierReferencePoints: OutlierReferencePoint[];
}

export type ChartRowValue = number | string | SeriesPointMeta | undefined;

export type ChartRow = { label: string } & Record<string, ChartRowValue>;

export interface LiftSeriesRow extends ChartRow {
  label: string;
  squat?: number;
  bench?: number;
  deadlift?: number;
}

export interface LiftSeries {
  rows: LiftSeriesRow[];
  /** lifts with at least one plottable point */
  available: Record<LiftKey, boolean>;
  /** competition variation chosen per lift */
  variation: Record<LiftKey, string | null>;
  /** chart lines to render for the generated row keys */
  series: ProgressionChartSeries[];
}

export interface BlockPeaks {
  programId: number;
  programNumber: number | null;
  programName: string | null;
  peaks: Record<LiftKey, { e1rm: number; delta: number | null } | null>;
}

export interface PeakEffort {
  exerciseName: string;
  canonicalName: string;
  weightLbs: number;
  reps: number;
  rpe: number | null;
  e1rm: number;
  programNumber: number | null;
  programName: string | null;
}

function emptyLiftPeaks(): Record<LiftKey, { e1rm: number; delta: number | null } | null> {
  return {
    squat: null,
    bench: null,
    deadlift: null,
  };
}

/** Offset a program/week/day-indexed point to a calendar timestamp. */
function pointTimestamp(
  p: E1RMDataPoint,
  startByProgram: Map<number, number>,
): number | null {
  if (p.program_id == null) return null;
  const start = startByProgram.get(p.program_id);
  if (start == null) return null;
  const offsetDays = Math.max(0, (p.week_number - 1) * 7 + (p.day_number - 1));
  return start + offsetDays * 86400000;
}

function programStartTimestamps(programs: ProgramListResponse[]): Map<number, number> {
  const startByProgram = new Map<number, number>();
  for (const prog of programs) {
    const d = parseLocalDate(prog.date_start);
    if (prog.id != null && d) startByProgram.set(prog.id, d.getTime());
  }
  return startByProgram;
}

function programNumberLabel(programNumber: number | null | undefined): string {
  return programNumber == null ? "P?" : `P${programNumber}`;
}

function bucketLabel(
  granularity: ProgressionGranularity,
  programNumber: number | null | undefined,
  weekNumber: number | null | undefined,
): string {
  const block = programNumberLabel(programNumber);
  return granularity === "week" ? `${block} W${weekNumber ?? "?"}` : block;
}

function programSortFields(
  program: ProgramListResponse | undefined,
  programNumber: number | null | undefined,
  weekNumber: number | null | undefined,
) {
  return {
    dateStart: parseLocalDate(program?.date_start)?.getTime() ?? 0,
    programNumber: programNumber ?? program?.program_number ?? Number.MAX_SAFE_INTEGER,
    weekNumber: weekNumber ?? Number.MAX_SAFE_INTEGER,
  };
}

function compareBucketOrder(
  a: ReturnType<typeof programSortFields>,
  b: ReturnType<typeof programSortFields>,
) {
  if (a.dateStart !== b.dateStart) return a.dateStart - b.dateStart;
  if (a.programNumber !== b.programNumber) return a.programNumber - b.programNumber;
  return a.weekNumber - b.weekNumber;
}

function pointBucketKey(
  p: E1RMDataPoint,
  granularity: ProgressionGranularity,
): string | null {
  const programKey =
    p.program_id != null
      ? `id:${p.program_id}`
      : p.program_number != null
        ? `num:${p.program_number}`
        : null;
  if (programKey == null) return null;
  return granularity === "week"
    ? `${programKey}:week:${p.week_number}`
    : programKey;
}

function stableSeriesKey(lift: LiftKey, canonical: string): string {
  let hash = 0;
  for (let i = 0; i < canonical.length; i += 1) {
    hash = (hash * 31 + canonical.charCodeAt(i)) >>> 0;
  }
  return `${lift}_${hash.toString(36)}`;
}

const VARIATION_COLORS: Record<LiftKey, string[]> = {
  squat: ["#7CB4ED", "#4A90D9", "#A8D0F5", "#2563EB"],
  bench: ["#F59E0B", "#FBBF24", "#D97706", "#FDE68A"],
  deadlift: ["#34D399", "#10B981", "#6EE7B7", "#059669"],
};

function variationColor(lift: LiftKey, index: number): string {
  const palette = VARIATION_COLORS[lift];
  return palette[index] ?? COMPARE_COLORS[(index - palette.length) % COMPARE_COLORS.length];
}

function variationLabels(
  points: E1RMDataPoint[],
  lift: LiftKey,
): Map<string, string> {
  const labels = new Map<string, string>();
  for (const p of points) {
    if (!liftMatches(p.lift_category, lift)) continue;
    const canonical = (p.canonical_exercise_name ?? "").trim();
    if (!canonical || labels.has(canonical)) continue;
    labels.set(canonical, p.exercise_name?.trim() || canonical);
  }
  return labels;
}

function seriesMetaKey(seriesKey: string): string {
  return `${seriesKey}__meta`;
}

/**
 * Build a unified categorical dataset for the multi-lift chart. Plots one
 * caller-chosen variation per lift, merged into rows keyed by block or week
 * (max e1RM wins when a lift has two top sets a day).
 */
export function buildLiftSeries(
  points: E1RMDataPoint[],
  programs: ProgramListResponse[],
  variationByLift: Record<LiftKey, Set<string>>,
  granularity: ProgressionGranularity,
  selectedProgramIds?: Set<number>,
): LiftSeries {
  const programById = new Map<number, ProgramListResponse>();
  for (const program of programs) {
    programById.set(program.id, program);
  }
  const filteredPoints = selectedProgramIds
    ? points.filter((p) => p.program_id != null && selectedProgramIds.has(p.program_id))
    : points;

  const representativeVariation: Record<LiftKey, string | null> = {
    squat: null,
    bench: null,
    deadlift: null,
  };

  const rowByBucket = new Map<
    string,
    { row: LiftSeriesRow; order: ReturnType<typeof programSortFields> }
  >();
  const chartSeries: ProgressionChartSeries[] = [];
  const available: Record<LiftKey, boolean> = {
    squat: false,
    bench: false,
    deadlift: false,
  };

  for (const lift of ["squat", "bench", "deadlift"] as LiftKey[]) {
    const selected = Array.from(variationByLift[lift] ?? []);
    if (selected.length === 0) continue;
    representativeVariation[lift] =
      selected.find((canonical) => isCompetitionName(canonical, lift)) ?? selected[0];
    const labels = variationLabels(filteredPoints, lift);

    selected.forEach((canon, index) => {
      const seriesKey = stableSeriesKey(lift, canon);
      chartSeries.push({
        key: seriesKey,
        label: labels.get(canon) ?? canon,
        lift,
        color: variationColor(lift, index),
      });

      for (const p of filteredPoints) {
        if (p.e1rm == null) continue;
        if (!liftMatches(p.lift_category, lift)) continue;
        if ((p.canonical_exercise_name ?? "").trim() !== canon) continue;
        const key = pointBucketKey(p, granularity);
        if (key == null) continue;
        const program =
          p.program_id == null ? undefined : programById.get(p.program_id);
        let bucket = rowByBucket.get(key);
        if (!bucket) {
          const programNumber = p.program_number ?? program?.program_number;
          bucket = {
            row: {
              label: bucketLabel(granularity, programNumber, p.week_number),
            },
            order: programSortFields(program, programNumber, p.week_number),
          };
          rowByBucket.set(key, bucket);
        }
        const row = bucket.row;
        const prev = row[seriesKey];
        if (typeof prev !== "number" || p.e1rm > prev) {
          row[seriesKey] = p.e1rm;
          row[seriesMetaKey(seriesKey)] = {
            exerciseName: p.exercise_name,
            weightLbs: p.weight_lbs,
            reps: p.reps,
            actualRpe: p.actual_rpe,
            e1rmLbs: p.e1rm,
            weekNumber: p.week_number,
            dayNumber: p.day_number,
            sourceUrl: p.google_sheet_url ?? program?.google_sheet_url ?? null,
            isOutlier: p.is_outlier === true,
            outlierReason: p.outlier_reason ?? null,
            outlierAverageLbs: p.outlier_average ?? null,
            outlierReferencePoints: p.outlier_reference_points ?? [],
          };
        }
        available[lift] = true;
      }
    });
  }

  const rows = Array.from(rowByBucket.values())
    .sort((a, b) => compareBucketOrder(a.order, b.order))
    .map((bucket) => bucket.row);
  return { rows, available, variation: representativeVariation, series: chartSeries };
}

export function buildCompareSeries(
  inputs: { id: string; lift: LiftKey; points: E1RMDataPoint[] }[],
  programs: ProgramListResponse[],
  granularity: ProgressionGranularity,
): { rows: ChartRow[]; available: Record<string, boolean> } {
  const programById = new Map<number, ProgramListResponse>();
  for (const program of programs) {
    programById.set(program.id, program);
  }

  const rowByBucket = new Map<
    string,
    { row: ChartRow; order: ReturnType<typeof programSortFields> }
  >();
  const available: Record<string, boolean> = {};

  for (const input of inputs) {
    available[input.id] = false;
    const canon = competitionVariation(input.points, input.lift);
    if (!canon) continue;

    for (const p of input.points) {
      if (p.e1rm == null) continue;
      if (!liftMatches(p.lift_category, input.lift)) continue;
      if ((p.canonical_exercise_name ?? "").trim() !== canon) continue;
      const key = pointBucketKey(p, granularity);
      if (key == null) continue;
      const program =
        p.program_id == null ? undefined : programById.get(p.program_id);
      let bucket = rowByBucket.get(key);
      if (!bucket) {
        const programNumber = p.program_number ?? program?.program_number;
        bucket = {
          row: {
            label: bucketLabel(granularity, programNumber, p.week_number),
          },
          order: programSortFields(program, programNumber, p.week_number),
        };
        rowByBucket.set(key, bucket);
      }
      const row = bucket.row;
      const prev = row[input.id];
      if (typeof prev !== "number" || p.e1rm > prev) row[input.id] = p.e1rm;
      available[input.id] = true;
    }
  }

  const rows = Array.from(rowByBucket.values())
    .sort((a, b) => compareBucketOrder(a.order, b.order))
    .map((bucket) => bucket.row);
  return { rows, available };
}

/**
 * Build compact per-program peak e1RM rows using the same competition
 * variation choice as the main e1RM series.
 */
export function peaksByBlock(
  points: E1RMDataPoint[],
  programs: ProgramListResponse[],
  variationByLift: Record<LiftKey, string | null>,
): BlockPeaks[] {
  const variation = variationByLift;
  const sortedPrograms = [...programs].sort((a, b) => {
    const aDate = parseLocalDate(a.date_start)?.getTime();
    const bDate = parseLocalDate(b.date_start)?.getTime();
    if (aDate != null && bDate != null && aDate !== bDate) return aDate - bDate;
    const aNumber = a.program_number ?? a.id;
    const bNumber = b.program_number ?? b.id;
    return aNumber - bNumber;
  });
  const pointsByProgram = new Map<number, E1RMDataPoint[]>();
  for (const p of points) {
    if (p.program_id == null || p.e1rm == null) continue;
    const list = pointsByProgram.get(p.program_id) ?? [];
    list.push(p);
    pointsByProgram.set(p.program_id, list);
  }

  const rows: BlockPeaks[] = [];
  let previousPeaks = emptyLiftPeaks();

  for (const program of sortedPrograms) {
    const blockPoints = pointsByProgram.get(program.id) ?? [];
    const currentRaw: Record<LiftKey, number | null> = {
      squat: null,
      bench: null,
      deadlift: null,
    };

    for (const lift of ["squat", "bench", "deadlift"] as LiftKey[]) {
      const canon = variation[lift];
      if (!canon) continue;
      for (const p of blockPoints) {
        if (p.e1rm == null) continue;
        if (!liftMatches(p.lift_category, lift)) continue;
        if ((p.canonical_exercise_name ?? "").trim() !== canon) continue;
        const prev = currentRaw[lift];
        if (prev == null || p.e1rm > prev) currentRaw[lift] = p.e1rm;
      }
    }

    const peaks = emptyLiftPeaks();
    for (const lift of ["squat", "bench", "deadlift"] as LiftKey[]) {
      const e1rm = currentRaw[lift];
      if (e1rm == null) continue;
      const previous = previousPeaks[lift]?.e1rm ?? null;
      peaks[lift] = {
        e1rm,
        delta: previous == null ? null : e1rm - previous,
      };
    }

    if (Object.values(peaks).some((peak) => peak != null)) {
      rows.push({
        programId: program.id,
        programNumber: program.program_number ?? null,
        programName: program.program_name ?? null,
        peaks,
      });
      previousPeaks = peaks;
    }
  }

  return rows;
}

/**
 * Rank the athlete's best e1RM effort for each distinct exercise variation.
 */
export function topEfforts(
  points: E1RMDataPoint[],
  programs: ProgramListResponse[],
  limit = 10,
): PeakEffort[] {
  const programById = new Map<number, ProgramListResponse>();
  for (const program of programs) {
    programById.set(program.id, program);
  }

  const peakByCanonical = new Map<string, E1RMDataPoint>();
  for (const point of points) {
    if (point.e1rm == null) continue;
    const canonical = point.canonical_exercise_name;
    const previous = peakByCanonical.get(canonical);
    if (!previous || previous.e1rm == null || point.e1rm > previous.e1rm) {
      peakByCanonical.set(canonical, point);
    }
  }

  return Array.from(peakByCanonical.values())
    .sort((a, b) => (b.e1rm ?? 0) - (a.e1rm ?? 0))
    .slice(0, limit)
    .map((point) => {
      const program =
        point.program_id == null ? undefined : programById.get(point.program_id);
      return {
        exerciseName: point.exercise_name,
        canonicalName: point.canonical_exercise_name,
        weightLbs: point.weight_lbs,
        reps: point.reps,
        rpe: point.actual_rpe,
        e1rm: point.e1rm ?? 0,
        programNumber: program?.program_number ?? null,
        programName: program?.program_name ?? null,
      };
    });
}

/**
 * Build weekly training-volume rows in the same shape as e1RM rows so the
 * progression chart can render either mode unchanged.
 */
export function buildVolumeSeries(
  volumePoints: VolumeDataPoint[],
  programs: ProgramListResponse[],
  granularity: ProgressionGranularity,
  selectedProgramIds?: Set<number>,
): LiftSeries {
  const programByNumber = new Map<number, ProgramListResponse>();
  const selectedProgramNumbers = new Set<number>();
  for (const prog of programs) {
    if (prog.program_number != null) {
      programByNumber.set(prog.program_number, prog);
    }
    if (
      selectedProgramIds &&
      selectedProgramIds.has(prog.id) &&
      prog.program_number != null
    ) {
      selectedProgramNumbers.add(prog.program_number);
    }
  }

  const variation: Record<LiftKey, string | null> = {
    squat: null,
    bench: null,
    deadlift: null,
  };
  const available: Record<LiftKey, boolean> = {
    squat: false,
    bench: false,
    deadlift: false,
  };
  const volumeFieldByLift: Record<
    LiftKey,
    "squat_volume" | "bench_volume" | "deadlift_volume"
  > = {
    squat: "squat_volume",
    bench: "bench_volume",
    deadlift: "deadlift_volume",
  };
  const rowByBucket = new Map<
    string,
    { row: LiftSeriesRow; order: ReturnType<typeof programSortFields> }
  >();
  const lifts = LIFTS.map((l) => l.key);
  const chartSeries: ProgressionChartSeries[] = LIFTS.map((lift) => ({
    key: lift.key,
    label: lift.label,
    lift: lift.key,
    color: lift.color,
  }));

  for (const p of volumePoints) {
    if (selectedProgramIds) {
      if (p.program_number == null || !selectedProgramNumbers.has(p.program_number)) {
        continue;
      }
    }
    if (p.program_number == null) continue;
    const key =
      granularity === "week"
        ? `num:${p.program_number}:week:${p.week_number}`
        : `num:${p.program_number}`;
    let bucket = rowByBucket.get(key);
    if (!bucket) {
      const program = programByNumber.get(p.program_number);
      bucket = {
        row: {
          label: bucketLabel(granularity, p.program_number, p.week_number),
        },
        order: programSortFields(program, p.program_number, p.week_number),
      };
      rowByBucket.set(key, bucket);
    }
    const row = bucket.row;
    for (const lift of lifts) {
      const value = p[volumeFieldByLift[lift]];
      if (value == null) continue;
      if (granularity === "block") {
        row[lift] = (row[lift] ?? 0) + value;
      } else {
        row[lift] = value;
      }
      available[lift] = true;
    }
  }

  const rows = Array.from(rowByBucket.values())
    .sort((a, b) => compareBucketOrder(a.order, b.order))
    .map((bucket) => bucket.row);
  return { rows, available, variation, series: chartSeries };
}
