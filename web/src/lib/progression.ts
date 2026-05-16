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
 *  2. e1RM trend points are indexed by program/week/day, not calendar
 *     date, so timestamps are derived by offsetting from program start.
 */
import type {
  E1RMDataPoint,
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

export type ChartRow = { ts: number } & Record<string, number | undefined>;

export interface LiftSeriesRow extends ChartRow {
  ts: number;
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

/**
 * Build a unified time-series dataset for the multi-lift chart. Per lift,
 * take the competition variation's e1RM points and merge them into rows
 * keyed by timestamp (max e1RM wins when a lift has two top sets a day).
 */
export function buildLiftSeries(
  points: E1RMDataPoint[],
  programs: ProgramListResponse[],
  selectedProgramIds?: Set<number>,
): LiftSeries {
  const startByProgram = programStartTimestamps(programs);
  const filteredPoints = selectedProgramIds
    ? points.filter((p) => p.program_id != null && selectedProgramIds.has(p.program_id))
    : points;

  const variation: Record<LiftKey, string | null> = {
    squat: competitionVariation(filteredPoints, "squat"),
    bench: competitionVariation(filteredPoints, "bench"),
    deadlift: competitionVariation(filteredPoints, "deadlift"),
  };

  const rowByTs = new Map<number, LiftSeriesRow>();
  const available: Record<LiftKey, boolean> = {
    squat: false,
    bench: false,
    deadlift: false,
  };

  for (const lift of ["squat", "bench", "deadlift"] as LiftKey[]) {
    const canon = variation[lift];
    if (!canon) continue;
    for (const p of filteredPoints) {
      if (p.e1rm == null) continue;
      if (!liftMatches(p.lift_category, lift)) continue;
      if ((p.canonical_exercise_name ?? "").trim() !== canon) continue;
      const ts = pointTimestamp(p, startByProgram);
      if (ts == null) continue;
      let row = rowByTs.get(ts);
      if (!row) {
        row = { ts };
        rowByTs.set(ts, row);
      }
      const prev = row[lift];
      if (prev == null || p.e1rm > prev) row[lift] = p.e1rm;
      available[lift] = true;
    }
  }

  const rows = Array.from(rowByTs.values()).sort((a, b) => a.ts - b.ts);
  return { rows, available, variation };
}

export function buildCompareSeries(
  inputs: { id: string; lift: LiftKey; points: E1RMDataPoint[] }[],
  programs: ProgramListResponse[],
): { rows: ChartRow[]; available: Record<string, boolean> } {
  const startByProgram = programStartTimestamps(programs);

  const rowByTs = new Map<number, ChartRow>();
  const available: Record<string, boolean> = {};

  for (const input of inputs) {
    available[input.id] = false;
    const canon = competitionVariation(input.points, input.lift);
    if (!canon) continue;

    for (const p of input.points) {
      if (p.e1rm == null) continue;
      if (!liftMatches(p.lift_category, input.lift)) continue;
      if ((p.canonical_exercise_name ?? "").trim() !== canon) continue;
      const ts = pointTimestamp(p, startByProgram);
      if (ts == null) continue;
      let row = rowByTs.get(ts);
      if (!row) {
        row = { ts };
        rowByTs.set(ts, row);
      }
      const prev = row[input.id];
      if (prev == null || p.e1rm > prev) row[input.id] = p.e1rm;
      available[input.id] = true;
    }
  }

  const rows = Array.from(rowByTs.values()).sort((a, b) => a.ts - b.ts);
  return { rows, available };
}

/**
 * Build compact per-program peak e1RM rows using the same competition
 * variation choice as the main e1RM series.
 */
export function peaksByBlock(
  points: E1RMDataPoint[],
  programs: ProgramListResponse[],
): BlockPeaks[] {
  const variation: Record<LiftKey, string | null> = {
    squat: competitionVariation(points, "squat"),
    bench: competitionVariation(points, "bench"),
    deadlift: competitionVariation(points, "deadlift"),
  };
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

/** Offset a program/week-indexed volume point to a calendar timestamp. */
function volumePointTimestamp(
  p: VolumeDataPoint,
  startByProgramNumber: Map<number, number>,
): number | null {
  if (p.program_number == null) return null;
  const start = startByProgramNumber.get(p.program_number);
  if (start == null) return null;
  const offsetDays = Math.max(0, (p.week_number - 1) * 7);
  return start + offsetDays * 86400000;
}

/**
 * Build weekly training-volume rows in the same shape as e1RM rows so the
 * progression chart can render either mode unchanged.
 */
export function buildVolumeSeries(
  volumePoints: VolumeDataPoint[],
  programs: ProgramListResponse[],
  selectedProgramIds?: Set<number>,
): LiftSeries {
  const startByProgramNumber = new Map<number, number>();
  const selectedProgramNumbers = new Set<number>();
  for (const prog of programs) {
    const d = parseLocalDate(prog.date_start);
    if (prog.program_number != null && d) {
      startByProgramNumber.set(prog.program_number, d.getTime());
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
  const rowByTs = new Map<number, LiftSeriesRow>();
  const lifts = LIFTS.map((l) => l.key);

  for (const p of volumePoints) {
    if (selectedProgramIds) {
      if (p.program_number == null || !selectedProgramNumbers.has(p.program_number)) {
        continue;
      }
    }
    const ts = volumePointTimestamp(p, startByProgramNumber);
    for (const lift of lifts) {
      const value = p[volumeFieldByLift[lift]];
      if (value == null) continue;
      if (ts == null) continue;
      let row = rowByTs.get(ts);
      if (!row) {
        row = { ts };
        rowByTs.set(ts, row);
      }
      row[lift] = value;
      available[lift] = true;
    }
  }

  const rows = Array.from(rowByTs.values()).sort((a, b) => a.ts - b.ts);
  return { rows, available, variation };
}

/** Block-boundary timestamps for chart reference lines. */
export function blockBoundaryTimestamps(
  programs: ProgramListResponse[],
  selectedProgramIds?: Set<number>,
): number[] {
  return programs
    .filter((p) => !selectedProgramIds || selectedProgramIds.has(p.id))
    .map((p) => parseLocalDate(p.date_start)?.getTime())
    .filter((t): t is number => t != null)
    .sort((a, b) => a - b);
}
