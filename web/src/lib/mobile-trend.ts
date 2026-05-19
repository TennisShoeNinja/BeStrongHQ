/**
 * Mobile progression "trend verdict": the up / flat / down read a coach
 * wants at a glance on their phone.
 *
 * For each lift we trend exactly one variation: the one the athlete
 * actually trained the most in the measured block. e1RM normalises for
 * reps but NOT for variation, so trending within a single block keeps the
 * series on one variation, and "most-trained" beats name-matching for
 * athletes who pull sumo, run tempo work, or switch their main variation
 * between blocks (a name-based "competition lift" guess silently picks a
 * stale or near-empty variation for those athletes).
 *
 * The verdict is the direction of that variation's e1RM across the block:
 * first point versus the latest. When the current block has no variation
 * with two-plus points (common early in a block) we fall back to the most
 * recent block that does, and the scope field records which.
 */
import type { E1RMDataPoint, ProgramListResponse } from "@/lib/types";
import { liftMatches, type LiftKey } from "@/lib/progression";

export type TrendDirection = "up" | "flat" | "down";

export interface LiftTrend {
  lift: LiftKey;
  /** null when no block has a two-plus-point variation to measure */
  direction: TrendDirection | null;
  /** latest e1RM of the measured variation, in lbs */
  currentE1rm: number | null;
  /** latest minus first of the measured block, in lbs */
  deltaLbs: number | null;
  /** e1RM values for the measured block, oldest to newest (sparkline) */
  series: number[];
  /** the measured block's data points behind the sparkline, oldest first */
  points: E1RMDataPoint[];
  /** which block the verdict was measured over */
  scope: "current" | "previous" | null;
  /** display name of the variation the verdict was measured from */
  variationLabel: string | null;
  /** week number of a mid-block peak the lift gave back by block end,
   *  or null when it ended at or near its high point */
  peakWeek: number | null;
}

/**
 * Flat band: a move within plus/minus this fraction of the block's first
 * e1RM reads as "holding" rather than up or down. Tunable.
 */
export const TREND_FLAT_BAND = 0.025;

function orderBySession(points: E1RMDataPoint[]): E1RMDataPoint[] {
  return [...points].sort((a, b) => {
    if (a.week_number !== b.week_number) return a.week_number - b.week_number;
    return a.day_number - b.day_number;
  });
}

function directionFor(first: number, last: number): TrendDirection {
  const band = Math.abs(first) * TREND_FLAT_BAND;
  if (last - first > band) return "up";
  if (last - first < -band) return "down";
  return "flat";
}

interface BlockVariation {
  /** raw exercise name for display */
  label: string;
  /** e1RM values oldest to newest */
  series: number[];
  /** the underlying points, oldest to newest */
  points: E1RMDataPoint[];
}

/**
 * Within one block's points, the variation the athlete trained the most.
 * Ties break toward the variation with more all-time volume, so a coach's
 * staple lift wins over an incidental one logged the same number of times.
 */
function dominantVariation(
  blockPoints: E1RMDataPoint[],
  allTimeCount: Map<string, number>,
): BlockVariation | null {
  const groups = new Map<string, E1RMDataPoint[]>();
  for (const p of blockPoints) {
    const canon = (p.canonical_exercise_name ?? "").trim();
    if (!canon) continue;
    const list = groups.get(canon) ?? [];
    list.push(p);
    groups.set(canon, list);
  }

  let bestCanon: string | null = null;
  let bestPoints: E1RMDataPoint[] = [];
  for (const [canon, pts] of groups) {
    const better =
      bestCanon == null ||
      pts.length > bestPoints.length ||
      (pts.length === bestPoints.length &&
        (allTimeCount.get(canon) ?? 0) >
          (allTimeCount.get(bestCanon) ?? 0));
    if (better) {
      bestCanon = canon;
      bestPoints = pts;
    }
  }
  if (bestCanon == null) return null;

  const ordered = orderBySession(bestPoints);
  return {
    label:
      ordered.find((p) => p.exercise_name?.trim())?.exercise_name?.trim() ??
      bestCanon,
    series: ordered.map((p) => p.e1rm as number),
    points: ordered,
  };
}

/**
 * Compute the trend verdict for one lift.
 *
 * @param allPoints every e1RM data point on record for the athlete
 * @param programs  the athlete's programs, most-recent-first (programs[0]
 *                  is the current block)
 */
export function computeLiftTrend(
  allPoints: E1RMDataPoint[],
  programs: ProgramListResponse[],
  lift: LiftKey,
): LiftTrend {
  const empty: LiftTrend = {
    lift,
    direction: null,
    currentE1rm: null,
    deltaLbs: null,
    series: [],
    points: [],
    scope: null,
    variationLabel: null,
    peakWeek: null,
  };

  const liftPoints = allPoints.filter(
    (p) => p.e1rm != null && liftMatches(p.lift_category, lift),
  );
  if (liftPoints.length === 0) return empty;

  // All-time volume per variation, used only to break per-block ties.
  const allTimeCount = new Map<string, number>();
  for (const p of liftPoints) {
    const canon = (p.canonical_exercise_name ?? "").trim();
    if (canon) allTimeCount.set(canon, (allTimeCount.get(canon) ?? 0) + 1);
  }

  const byProgram = new Map<number, E1RMDataPoint[]>();
  for (const p of liftPoints) {
    if (p.program_id == null) continue;
    const list = byProgram.get(p.program_id) ?? [];
    list.push(p);
    byProgram.set(p.program_id, list);
  }

  // Trend over the most recent block whose dominant variation has at least
  // two points. programs[0] is the current block.
  for (let i = 0; i < programs.length; i += 1) {
    const blockPoints = byProgram.get(programs[i].id);
    if (!blockPoints || blockPoints.length === 0) continue;
    const dom = dominantVariation(blockPoints, allTimeCount);
    if (!dom || dom.series.length < 2) continue;
    const first = dom.series[0];
    const last = dom.series[dom.series.length - 1];

    // Mid-block peak: the high point was not the last session, and the
    // lift gave back a meaningful amount by block end. Worth a look.
    let maxIdx = 0;
    for (let k = 1; k < dom.series.length; k += 1) {
      if (dom.series[k] > dom.series[maxIdx]) maxIdx = k;
    }
    const peak = dom.series[maxIdx];
    const peakWeek =
      maxIdx > 0 &&
      maxIdx < dom.series.length - 1 &&
      peak - last > Math.abs(peak) * TREND_FLAT_BAND
        ? dom.points[maxIdx].week_number
        : null;

    return {
      lift,
      direction: directionFor(first, last),
      currentE1rm: last,
      deltaLbs: last - first,
      series: dom.series,
      points: dom.points,
      scope: i === 0 ? "current" : "previous",
      variationLabel: dom.label,
      peakWeek,
    };
  }

  // No block dense enough for a verdict: surface the latest e1RM from the
  // most recent block that has any data, so the card still shows a number.
  for (let i = 0; i < programs.length; i += 1) {
    const blockPoints = byProgram.get(programs[i].id);
    if (!blockPoints || blockPoints.length === 0) continue;
    const dom = dominantVariation(blockPoints, allTimeCount);
    if (!dom || dom.series.length === 0) continue;
    return {
      ...empty,
      currentE1rm: dom.series[dom.series.length - 1],
      variationLabel: dom.label,
    };
  }

  return empty;
}
