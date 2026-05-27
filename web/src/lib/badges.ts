import type { MeetResultEntry, PREventEntry } from '@/lib/types';

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
const MILESTONE_EPSILON = 1e-6;

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
  prEvents?: PREventEntry[];
}

export type ChainName =
  | 'meets'
  | 'career'
  | 'totals'
  | 'dots'
  | 'pr-count'
  | 'pr-streak';

export interface ChainMember {
  id: string;
  rank: number;
}

export const BADGE_CHAINS: Record<ChainName, ChainMember[]> = {
  meets: [
    { id: 'first-meet', rank: 1 },
    { id: 'meets-5', rank: 5 },
    { id: 'meets-10', rank: 10 },
    { id: 'meets-15', rank: 15 },
    { id: 'meets-25', rank: 25 },
    { id: 'meets-50', rank: 50 },
  ],
  career: [
    { id: 'career-1y', rank: 1 },
    { id: 'career-3y', rank: 3 },
    { id: 'career-5y', rank: 5 },
    { id: 'career-10y', rank: 10 },
  ],
  totals: [
    { id: 'total-500kg', rank: 500 },
    { id: 'total-600kg', rank: 600 },
    { id: 'total-700kg', rank: 700 },
    { id: 'total-800kg', rank: 800 },
    { id: 'total-900kg', rank: 900 },
  ],
  dots: [
    { id: 'dots-400', rank: 400 },
    { id: 'dots-450', rank: 450 },
    { id: 'dots-500', rank: 500 },
    { id: 'dots-550', rank: 550 },
  ],
  'pr-count': [
    { id: 'pr-count-3', rank: 3 },
    { id: 'pr-count-10', rank: 10 },
    { id: 'pr-count-25', rank: 25 },
    { id: 'pr-count-50', rank: 50 },
  ],
  'pr-streak': [
    { id: 'pr-streak-3', rank: 3 },
    { id: 'pr-streak-5', rank: 5 },
    { id: 'pr-streak-10', rank: 10 },
  ],
};

const CHAIN_VISUAL_TIER: Record<string, number> = {
  'first-meet': 1,
  'meets-5': 1,
  'meets-10': 1,
  'meets-15': 1,
  'meets-25': 2,
  'meets-50': 3,
  'career-1y': 1,
  'career-3y': 1,
  'career-5y': 2,
  'career-10y': 3,
  'total-500kg': 1,
  'total-600kg': 1,
  'total-700kg': 2,
  'total-800kg': 2,
  'total-900kg': 3,
  'dots-400': 1,
  'dots-450': 1,
  'dots-500': 2,
  'dots-550': 2,
  'pr-count-3': 1,
  'pr-count-10': 1,
  'pr-count-25': 2,
  'pr-count-50': 3,
  'pr-streak-3': 1,
  'pr-streak-5': 2,
  'pr-streak-10': 3,
};

const EVENT_PRESTIGE: Record<string, number> = {
  'first-place': 3,
  comeback: 3,
  'triple-threat': 3,
  'multi-fed-champ': 3,
  'three-peat': 2,
  'win-streak-3': 2,
  'nine-for-nine': 1,
  'big-jump': 1,
};

export function getBadgePrestige(badge: EarnedBadge): number {
  const chainTier = CHAIN_VISUAL_TIER[badge.id];
  if (chainTier != null) return chainTier;
  return EVENT_PRESTIGE[badge.id] ?? 1;
}

function chainEventLabel(chainName: ChainName, member: ChainMember): string {
  if (chainName === 'meets') {
    return member.id === 'first-meet' ? 'First meet' : `${member.rank} meets`;
  }
  if (chainName === 'career') {
    return member.rank === 1 ? '1 year' : `${member.rank} years`;
  }
  if (chainName === 'totals') return `${member.rank}kg`;
  if (chainName === 'dots') return `${member.rank} DOTS`;
  if (chainName === 'pr-count') return `${member.rank} PRs`;
  return `${member.rank} blocks`;
}

function decorateChainEvent(
  chainName: ChainName,
  member: ChainMember,
  event: BadgeEvent,
): BadgeEvent {
  const label = chainEventLabel(chainName, member);
  const detail = event.detail?.trim();
  return {
    ...event,
    detail: detail && detail !== label ? `${label}, ${detail}` : label,
  };
}

function sortBadgeEvents(a: BadgeEvent, b: BadgeEvent): number {
  const byDate = (a.meet_date ?? '').localeCompare(b.meet_date ?? '');
  if (byDate !== 0) return byDate;
  return (a.detail ?? '').localeCompare(b.detail ?? '');
}

function collapseChains(earned: EarnedBadge[]): EarnedBadge[] {
  const byId = new Map(earned.map((badge) => [badge.id, badge]));
  const dropped = new Set<string>();
  const mergedEvents = new Map<string, BadgeEvent[]>();

  for (const [chainName, members] of Object.entries(BADGE_CHAINS) as Array<
    [ChainName, ChainMember[]]
  >) {
    const earnedInChain = members
      .filter((member) => byId.has(member.id))
      .sort((a, b) => a.rank - b.rank);
    if (earnedInChain.length <= 1) continue;

    const top = earnedInChain[earnedInChain.length - 1];
    const chainEvents: BadgeEvent[] = [];
    for (const member of earnedInChain) {
      const badge = byId.get(member.id);
      if (!badge) continue;
      if (member.id !== top.id) dropped.add(member.id);
      chainEvents.push(
        ...badge.events.map((event) =>
          decorateChainEvent(chainName, member, event),
        ),
      );
    }
    mergedEvents.set(top.id, chainEvents.sort(sortBadgeEvents));
  }

  return earned
    .filter((badge) => !dropped.has(badge.id))
    .map((badge) => {
      const events = mergedEvents.get(badge.id);
      return events ? { ...badge, events } : badge;
    });
}

export function evaluateBadges(
  input: BadgeEvaluatorInput | MeetResultEntry[],
): EarnedBadge[] {
  const { meetResults, prEvents } = Array.isArray(input)
    ? { meetResults: input, prEvents: [] as PREventEntry[] }
    : { meetResults: input.meetResults, prEvents: input.prEvents ?? [] };
  const earned: EarnedBadge[] = [];
  appendMeetBadges(earned, meetResults);
  appendPRHistoryBadges(earned, prEvents);
  return collapseChains(earned);
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

  const meetCountTiers = [5, 10, 15, 25, 50];
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

function prEventFor(
  entry: PREventEntry,
  detail?: string | null,
): BadgeEvent {
  return {
    meet_key: `pr:${entry.program_id}:${entry.variation_canon}`,
    meet_name: entry.program_name || entry.variation,
    meet_date: entry.recorded_at?.slice(0, 10) ?? null,
    detail: detail ?? null,
  };
}

function competitionLift(entry: PREventEntry): 'squat' | 'bench' | 'deadlift' | null {
  const name = `${entry.variation_canon} ${entry.variation}`.toLowerCase();
  if (name.includes('squat')) return 'squat';
  if (name.includes('bench')) return 'bench';
  if (name.includes('deadlift')) return 'deadlift';
  return null;
}

function appendPRHistoryBadges(
  earned: EarnedBadge[],
  rows: PREventEntry[],
): void {
  if (rows.length === 0) return;

  const sorted = [...rows].sort((a, b) =>
    (a.recorded_at ?? '').localeCompare(b.recorded_at ?? ''),
  );
  const competitionPRs = sorted.filter((r) => r.is_competition);

  const prCountTiers = [3, 10, 25, 50];
  for (const tier of prCountTiers) {
    if (competitionPRs.length >= tier) {
      earned.push({
        id: `pr-count-${tier}`,
        label: `${tier} PRs`,
        description: `Logged ${tier} celebration PRs across the competition lifts.`,
        tier: 'pr',
        count: 1,
        events: [prEventFor(competitionPRs[tier - 1])],
      });
    }
  }

  let bestRunLength = 0;
  let bestRunEndIndex = -1;
  let curRunLength = 0;
  let curRunPrevProgramNumber: number | null = null;
  const compPrograms = new Map<number, PREventEntry>();
  for (const event of competitionPRs) {
    if (event.program_number == null) continue;
    if (!compPrograms.has(event.program_number)) {
      compPrograms.set(event.program_number, event);
    }
  }
  const programEvents = Array.from(compPrograms.values()).sort((a, b) =>
    (a.program_number ?? 0) - (b.program_number ?? 0),
  );
  for (let i = 0; i < programEvents.length; i++) {
    const programNumber = programEvents[i].program_number;
    if (
      curRunPrevProgramNumber != null &&
      programNumber != null &&
      programNumber === curRunPrevProgramNumber + 1
    ) {
      curRunLength += 1;
    } else {
      curRunLength = 1;
    }
    curRunPrevProgramNumber = programNumber;
    if (curRunLength > bestRunLength) {
      bestRunLength = curRunLength;
      bestRunEndIndex = i;
    }
  }
  const streakTiers = [3, 5, 10];
  for (const tier of streakTiers) {
    if (bestRunLength >= tier) {
      earned.push({
        id: `pr-streak-${tier}`,
        label: `${tier}-Block PR Streak`,
        description: `Logged a competition PR in ${tier} consecutive blocks.`,
        tier: 'pr',
        count: 1,
        events: [
          prEventFor(
            programEvents[bestRunEndIndex >= 0 ? bestRunEndIndex : programEvents.length - 1],
            `${bestRunLength}-block streak`,
          ),
        ],
      });
    }
  }

  const liftedCompPRs = competitionPRs
    .map((event) => ({ event, lift: competitionLift(event) }))
    .filter(
      (item): item is { event: PREventEntry; lift: 'squat' | 'bench' | 'deadlift' } =>
        item.lift != null,
    );
  for (let i = 0; i < liftedCompPRs.length; i++) {
    const lifts = new Set<string>();
    let lastIdx = -1;
    for (let j = i; j < liftedCompPRs.length; j++) {
      const a = liftedCompPRs[i].event.recorded_at;
      const b = liftedCompPRs[j].event.recorded_at;
      if (!a || !b) continue;
      if (diffDays(a, b) > 90) break;
      lifts.add(liftedCompPRs[j].lift);
      lastIdx = j;
      if (lifts.size === 3) {
        earned.push({
          id: 'triple-threat',
          label: 'Triple Threat',
          description:
            'Logged squat, bench, and deadlift celebration PRs inside a 90-day window.',
          tier: 'pr',
          count: 1,
          events: [
            prEventFor(
              liftedCompPRs[lastIdx].event,
              `S+B+D PRs within 90 days, closing on ${liftedCompPRs[lastIdx].event.recorded_at?.slice(0, 10) ?? ''}`,
            ),
          ],
        });
        i = liftedCompPRs.length;
        break;
      }
    }
  }

  const jumps = competitionPRs.filter((r) => r.delta >= 20);
  if (jumps.length > 0) {
    const events = jumps.slice(-5).map((r) =>
      prEventFor(
        r,
        `+${Math.round(r.delta)} lbs (${Math.round(r.prev_best_e1rm)} to ${Math.round(r.e1rm)})`,
      ),
    );
    earned.push({
      id: 'big-jump',
      label: 'Big Jump',
      description: 'Raised a competition block peak by 20 lbs or more in a single jump.',
      tier: 'pr',
      count: jumps.length,
      events,
    });
  }
}

function diffDays(fromIso: string, toIso: string): number {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return Infinity;
  return Math.abs((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
