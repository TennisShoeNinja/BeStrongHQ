import type { MaxHistoryEntry, MeetResultEntry } from '@/lib/types';

export interface BadgeEvent {
  meet_key: string;
  meet_name: string | null;
  meet_date: string | null;
  detail?: string | null;
}

export interface EarnedBadge {
  id: string;
  label: string;
  description: string;
  tier: 'milestone' | 'win' | 'longevity' | 'lift' | 'dots' | 'special' | 'pr';
  count: number;
  events: BadgeEvent[];
}

interface MeetSummary {
  meet_key: string;
  meet_id: number | null;
  meet_name: string | null;
  meet_date: string | null;
  federation: string | null;
  squat_lbs: number;
  bench_lbs: number;
  deadlift_lbs: number;
  total_lbs: number;
  total_kg: number;
  best_dots: number | null;
  place_numeric: number | null;
  attempts_total: number;
  attempts_made: number;
}

const LBS_PER_KG = 2.20462262;

function meetKey(r: MeetResultEntry): string {
  return r.meet_id != null
    ? `id:${r.meet_id}`
    : `nd:${r.meet_name ?? ''}|${r.meet_date ?? ''}`;
}

function parsePlace(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

function buildMeetSummaries(rows: MeetResultEntry[]): MeetSummary[] {
  const map = new Map<string, MeetSummary>();
  for (const r of rows) {
    const key = meetKey(r);
    let s = map.get(key);
    if (!s) {
      s = {
        meet_key: key,
        meet_id: r.meet_id,
        meet_name: r.meet_name,
        meet_date: r.meet_date,
        federation: r.federation,
        squat_lbs: 0,
        bench_lbs: 0,
        deadlift_lbs: 0,
        total_lbs: 0,
        total_kg: 0,
        best_dots: null,
        place_numeric: parsePlace(r.place),
        attempts_total: 0,
        attempts_made: 0,
      };
      map.set(key, s);
    }
    s.attempts_total += 1;
    if (r.made) s.attempts_made += 1;
    if (r.made) {
      const lift = r.lift.toLowerCase();
      if (lift === 'squat' && r.weight_lbs > s.squat_lbs) s.squat_lbs = r.weight_lbs;
      if (lift === 'bench' && r.weight_lbs > s.bench_lbs) s.bench_lbs = r.weight_lbs;
      if (lift === 'deadlift' && r.weight_lbs > s.deadlift_lbs) s.deadlift_lbs = r.weight_lbs;
    }
    if (r.dots_score != null) {
      if (s.best_dots == null || r.dots_score > s.best_dots) s.best_dots = r.dots_score;
    }
    if (s.place_numeric == null) {
      const p = parsePlace(r.place);
      if (p != null) s.place_numeric = p;
    }
  }
  for (const s of map.values()) {
    s.total_lbs = s.squat_lbs + s.bench_lbs + s.deadlift_lbs;
    s.total_kg = s.total_lbs / LBS_PER_KG;
  }
  return Array.from(map.values())
    .filter((s) => s.total_lbs > 0)
    .sort((a, b) => (a.meet_date ?? '').localeCompare(b.meet_date ?? ''));
}

function eventFor(s: MeetSummary, detail?: string | null): BadgeEvent {
  return {
    meet_key: s.meet_key,
    meet_name: s.meet_name,
    meet_date: s.meet_date,
    detail: detail ?? null,
  };
}

function diffMonths(fromIso: string, toIso: string): number {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
}

function diffYears(fromIso: string, toIso: string): number {
  return diffMonths(fromIso, toIso) / 12;
}

export interface BadgeEvaluatorInput {
  meetResults: MeetResultEntry[];
  maxHistory?: MaxHistoryEntry[];
}

export function evaluateBadges(
  input: BadgeEvaluatorInput | MeetResultEntry[],
): EarnedBadge[] {
  const { meetResults, maxHistory } = Array.isArray(input)
    ? { meetResults: input, maxHistory: [] as MaxHistoryEntry[] }
    : { meetResults: input.meetResults, maxHistory: input.maxHistory ?? [] };
  const earned: EarnedBadge[] = [];
  appendMeetBadges(earned, meetResults);
  appendPRHistoryBadges(earned, maxHistory);
  return earned;
}

function appendMeetBadges(earned: EarnedBadge[], rows: MeetResultEntry[]): void {
  const meets = buildMeetSummaries(rows);
  if (meets.length === 0) return;

  earned.push({
    id: 'first-meet',
    label: 'First Meet',
    description: 'Stepped on a sanctioned platform for the first time.',
    tier: 'milestone',
    count: 1,
    events: [eventFor(meets[0])],
  });

  const meetCountTiers = [5, 10, 25, 50];
  for (const tier of meetCountTiers) {
    if (meets.length >= tier) {
      earned.push({
        id: `meets-${tier}`,
        label: `${tier} Meets`,
        description: `Competed in ${tier} sanctioned meets.`,
        tier: 'milestone',
        count: 1,
        events: [eventFor(meets[tier - 1])],
      });
    }
  }

  const wins = meets.filter((m) => m.place_numeric === 1);
  if (wins.length > 0) {
    earned.push({
      id: 'first-place',
      label: 'First-Place Finish',
      description: `Won ${wins.length === 1 ? 'a meet' : `${wins.length} meets`} outright.`,
      tier: 'win',
      count: wins.length,
      events: wins.map((m) => eventFor(m)),
    });
  }

  let consecutiveWins = 0;
  let bestStreak = 0;
  const threePeatEvents: BadgeEvent[] = [];
  for (const m of meets) {
    if (m.place_numeric === 1) {
      consecutiveWins += 1;
      if (consecutiveWins === 3) {
        threePeatEvents.push(eventFor(m, 'Closed out a 3-meet win streak.'));
      }
      if (consecutiveWins > bestStreak) bestStreak = consecutiveWins;
    } else {
      consecutiveWins = 0;
    }
  }
  if (threePeatEvents.length > 0) {
    earned.push({
      id: 'three-peat',
      label: 'Three-Peat',
      description: 'Won three sanctioned meets in a row.',
      tier: 'win',
      count: threePeatEvents.length,
      events: threePeatEvents,
    });
  }

  const winsByFed = new Map<string, MeetSummary[]>();
  for (const m of wins) {
    const fed = (m.federation ?? '').trim().toUpperCase();
    if (!fed) continue;
    const list = winsByFed.get(fed) ?? [];
    list.push(m);
    winsByFed.set(fed, list);
  }
  if (winsByFed.size >= 2) {
    const events: BadgeEvent[] = [];
    for (const [fed, list] of winsByFed) {
      const first = list[0];
      events.push(eventFor(first, fed));
    }
    earned.push({
      id: 'multi-fed-champ',
      label: 'Multi-Fed Champ',
      description: 'Took 1st place in 2 or more federations.',
      tier: 'win',
      count: winsByFed.size,
      events,
    });
  }

  if (meets.length >= 2) {
    const first = meets[0].meet_date;
    const latest = meets[meets.length - 1].meet_date;
    if (first && latest) {
      const years = diffYears(first, latest);
      const tiers = [
        { years: 1, label: '1 Year Career', id: 'career-1y' },
        { years: 3, label: '3 Year Career', id: 'career-3y' },
        { years: 5, label: '5 Year Career', id: 'career-5y' },
        { years: 10, label: '10 Year Career', id: 'career-10y' },
      ];
      for (const t of tiers) {
        if (years >= t.years) {
          earned.push({
            id: t.id,
            label: t.label,
            description: `${t.years} years between first and latest meet.`,
            tier: 'longevity',
            count: 1,
            events: [eventFor(meets[meets.length - 1])],
          });
        }
      }
    }
  }

  const totalTiersKg = [500, 600, 700, 800, 900];
  for (const tier of totalTiersKg) {
    const first = meets.find((m) => m.total_kg >= tier);
    if (first) {
      earned.push({
        id: `total-${tier}kg`,
        label: `${tier}kg Total`,
        description: `First sanctioned total at or above ${tier}kg.`,
        tier: 'lift',
        count: 1,
        events: [eventFor(first, `${first.total_kg.toFixed(1)}kg`)],
      });
    }
  }

  const dotsTiers = [400, 450, 500, 550];
  for (const tier of dotsTiers) {
    const first = meets.find((m) => (m.best_dots ?? 0) >= tier);
    if (first) {
      earned.push({
        id: `dots-${tier}`,
        label: `${tier} DOTS`,
        description: `First sanctioned DOTS score at or above ${tier}.`,
        tier: 'dots',
        count: 1,
        events: [eventFor(first, `${first.best_dots?.toFixed(2) ?? ''} DOTS`)],
      });
    }
  }

  const nineForNine = meets.filter((m) => m.attempts_total >= 9 && m.attempts_made === m.attempts_total);
  if (nineForNine.length > 0) {
    earned.push({
      id: 'nine-for-nine',
      label: '9 for 9',
      description: 'Made every attempt at a meet.',
      tier: 'special',
      count: nineForNine.length,
      events: nineForNine.map((m) => eventFor(m)),
    });
  }

  for (let i = 1; i < meets.length; i++) {
    const prev = meets[i - 1];
    const curr = meets[i];
    if (!prev.meet_date || !curr.meet_date) continue;
    const months = diffMonths(prev.meet_date, curr.meet_date);
    if (months < 12) continue;
    const beatPrior = curr.total_lbs > prev.total_lbs;
    if (!beatPrior) continue;
    earned.push({
      id: 'comeback',
      label: 'Comeback',
      description: 'Hit a meet PR after 12 or more months away from competition.',
      tier: 'special',
      count: 1,
      events: [eventFor(curr, `${Math.round(months)} months between meets`)],
    });
    break;
  }
}

const BIG_LIFTS = new Set(['squat', 'bench', 'deadlift', 'bench press']);

function canonLift(entry: MaxHistoryEntry): string {
  const raw = (entry.exercise_name || entry.lift || '').trim().toLowerCase();
  if (raw === 'bench press') return 'bench';
  return raw;
}

function isBigLift(entry: MaxHistoryEntry): boolean {
  const raw = (entry.exercise_name || entry.lift || '').trim().toLowerCase();
  return BIG_LIFTS.has(raw);
}

function isOneRepMax(entry: MaxHistoryEntry): boolean {
  return entry.reps == null || entry.reps === 1;
}

function prEventFor(
  entry: MaxHistoryEntry,
  detail?: string | null,
): BadgeEvent {
  const liftLabel =
    (entry.exercise_name || entry.lift || 'Lift').replace(/\b\w/g, (c) =>
      c.toUpperCase(),
    );
  return {
    meet_key: `mh:${entry.id}`,
    meet_name: liftLabel,
    meet_date: entry.recorded_at?.slice(0, 10) ?? null,
    detail: detail ?? null,
  };
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function appendPRHistoryBadges(
  earned: EarnedBadge[],
  rows: MaxHistoryEntry[],
): void {
  if (rows.length === 0) return;

  const sorted = [...rows].sort((a, b) =>
    (a.recorded_at ?? '').localeCompare(b.recorded_at ?? ''),
  );

  // Lifetime PR count tiers — every MaxHistory row is a PR moment.
  const prCountTiers = [5, 10, 25, 50, 100];
  for (const tier of prCountTiers) {
    if (sorted.length >= tier) {
      earned.push({
        id: `pr-count-${tier}`,
        label: `${tier} PRs`,
        description: `Logged ${tier} personal records across all lifts.`,
        tier: 'pr',
        count: 1,
        events: [prEventFor(sorted[tier - 1])],
      });
    }
  }

  // PR streak — consecutive months with at least one PR. Picks the longest run.
  let bestRunLength = 0;
  let bestRunEndIndex = -1;
  let curRunLength = 0;
  let curRunPrevMonth: string | null = null;
  let curRunStartIdx = 0;
  for (let i = 0; i < sorted.length; i++) {
    const recorded = sorted[i].recorded_at;
    if (!recorded) continue;
    const mk = monthKey(recorded);
    if (mk === curRunPrevMonth) continue; // same month: streak unchanged
    if (curRunPrevMonth && isNextMonth(curRunPrevMonth, mk)) {
      curRunLength += 1;
    } else {
      curRunLength = 1;
      curRunStartIdx = i;
    }
    curRunPrevMonth = mk;
    if (curRunLength > bestRunLength) {
      bestRunLength = curRunLength;
      bestRunEndIndex = i;
    }
  }
  const streakTiers = [3, 6, 12];
  for (const tier of streakTiers) {
    if (bestRunLength >= tier) {
      earned.push({
        id: `pr-streak-${tier}`,
        label: `${tier}-Month PR Streak`,
        description: `Logged a personal record in ${tier} consecutive months.`,
        tier: 'pr',
        count: 1,
        events: [
          prEventFor(
            sorted[bestRunEndIndex >= 0 ? bestRunEndIndex : sorted.length - 1],
            `${bestRunLength}-month streak`,
          ),
        ],
      });
    }
  }

  // Triple Threat — first time S, B, and D each got a 1RM PR within a 90-day window.
  const oneRMBig = sorted.filter((r) => isBigLift(r) && isOneRepMax(r));
  for (let i = 0; i < oneRMBig.length; i++) {
    const lifts = new Set<string>();
    let lastIdx = -1;
    for (let j = i; j < oneRMBig.length; j++) {
      const a = oneRMBig[i].recorded_at;
      const b = oneRMBig[j].recorded_at;
      if (!a || !b) continue;
      if (diffDays(a, b) > 90) break;
      lifts.add(canonLift(oneRMBig[j]));
      lastIdx = j;
      if (lifts.size === 3) {
        earned.push({
          id: 'triple-threat',
          label: 'Triple Threat',
          description:
            'Hit a 1RM PR on squat, bench, and deadlift inside a 90-day window.',
          tier: 'pr',
          count: 1,
          events: [
            prEventFor(
              oneRMBig[lastIdx],
              `S+B+D PRs within 90 days, closing on ${oneRMBig[lastIdx].recorded_at?.slice(0, 10) ?? ''}`,
            ),
          ],
        });
        i = oneRMBig.length; // break outer
        break;
      }
    }
  }

  // Big Jump — single PR that increased old → new by at least 20 lbs.
  const jumps = sorted.filter(
    (r) =>
      r.old_value != null && r.old_value > 0 && r.new_value - r.old_value >= 20,
  );
  if (jumps.length > 0) {
    const events = jumps.slice(-5).map((r) =>
      prEventFor(
        r,
        `+${Math.round(r.new_value - (r.old_value ?? 0))} lbs (${Math.round(r.old_value ?? 0)} → ${Math.round(r.new_value)})`,
      ),
    );
    earned.push({
      id: 'big-jump',
      label: 'Big Jump',
      description: 'Bumped a personal record by 20 lbs or more in a single jump.',
      tier: 'pr',
      count: jumps.length,
      events,
    });
  }
}

function isNextMonth(prevYM: string, currYM: string): boolean {
  const [py, pm] = prevYM.split('-').map(Number);
  const [cy, cm] = currYM.split('-').map(Number);
  if (!py || !pm || !cy || !cm) return false;
  if (cy === py && cm === pm + 1) return true;
  if (cy === py + 1 && pm === 12 && cm === 1) return true;
  return false;
}

function diffDays(fromIso: string, toIso: string): number {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return Infinity;
  return Math.abs((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
