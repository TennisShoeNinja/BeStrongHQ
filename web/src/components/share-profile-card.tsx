'use client';

import { forwardRef, type CSSProperties } from 'react';
import * as Types from '@/lib/types';

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1920;
const ACCENT = '#ef4444';

const LIFTS = ['squat', 'bench', 'deadlift'] as const;
type Lift = (typeof LIFTS)[number];

interface BestPerLift {
  weight_lbs: number;
  meet_name: string | null;
}

interface MeetTotal {
  meet_key: string;
  meet_name: string | null;
  meet_date: string | null;
  squat_lbs: number;
  bench_lbs: number;
  deadlift_lbs: number;
  total_lbs: number;
  dots_score: number | null;
}

function bestMadeByLift(
  rows: Types.MeetResultEntry[],
  meetKey: string,
  lift: Lift,
): number {
  let best = 0;
  for (const r of rows) {
    const rowKey =
      r.meet_id != null ? `id:${r.meet_id}` : `nd:${r.meet_name ?? ''}|${r.meet_date ?? ''}`;
    if (rowKey !== meetKey) continue;
    if (r.lift.toLowerCase() !== lift) continue;
    if (!r.made) continue;
    if (r.weight_lbs > best) best = r.weight_lbs;
  }
  return best;
}

function buildMeetTotals(rows: Types.MeetResultEntry[]): MeetTotal[] {
  const keys = new Map<
    string,
    { name: string | null; date: string | null; dots: number | null }
  >();
  for (const r of rows) {
    const key =
      r.meet_id != null ? `id:${r.meet_id}` : `nd:${r.meet_name ?? ''}|${r.meet_date ?? ''}`;
    const prev = keys.get(key);
    const dots =
      r.dots_score != null && (prev?.dots == null || r.dots_score > prev.dots)
        ? r.dots_score
        : prev?.dots ?? null;
    keys.set(key, {
      name: prev?.name ?? r.meet_name,
      date: prev?.date ?? r.meet_date,
      dots,
    });
  }
  const totals: MeetTotal[] = [];
  for (const [key, info] of keys) {
    const squat = bestMadeByLift(rows, key, 'squat');
    const bench = bestMadeByLift(rows, key, 'bench');
    const deadlift = bestMadeByLift(rows, key, 'deadlift');
    if (squat + bench + deadlift === 0) continue;
    totals.push({
      meet_key: key,
      meet_name: info.name,
      meet_date: info.date,
      squat_lbs: squat,
      bench_lbs: bench,
      deadlift_lbs: deadlift,
      total_lbs: squat + bench + deadlift,
      dots_score: info.dots,
    });
  }
  totals.sort((a, b) => (a.meet_date ?? '').localeCompare(b.meet_date ?? ''));
  return totals;
}

function bestLiftAcrossMeets(rows: Types.MeetResultEntry[], lift: Lift): BestPerLift | null {
  let best: BestPerLift | null = null;
  for (const r of rows) {
    if (r.lift.toLowerCase() !== lift) continue;
    if (!r.made) continue;
    if (best == null || r.weight_lbs > best.weight_lbs) {
      best = { weight_lbs: r.weight_lbs, meet_name: r.meet_name };
    }
  }
  return best;
}

function formatLbs(value: number | null | undefined, fractional = false): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (fractional && value % 1 !== 0) return `${value.toFixed(1)} lbs`;
  return `${Math.round(value)} lbs`;
}

function yearOf(date: string | null | undefined): number | null {
  if (!date) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

function formatMonthYear(date: string | null | undefined): string {
  if (!date) return '';
  const parts = date.split('-');
  if (parts.length < 2) return date;
  const [y, m] = parts.map(Number);
  if (!y || !m) return date;
  const month = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' });
  return `${month} ${y}`;
}

function buildChartPath(totals: MeetTotal[]): {
  path: string;
  dots: { x: number; y: number }[];
  yMin: number;
  yMax: number;
  width: number;
  height: number;
} {
  const width = 940;
  const height = 360;
  if (totals.length === 0) {
    return { path: '', dots: [], yMin: 0, yMax: 0, width, height };
  }
  const values = totals.map((t) => t.total_lbs);
  const yMin = Math.min(...values);
  const yMax = Math.max(...values);
  const yRange = Math.max(yMax - yMin, 1);
  const denom = Math.max(totals.length - 1, 1);
  const points = totals.map((t, i) => {
    const x = (i / denom) * width;
    const y = height - ((t.total_lbs - yMin) / yRange) * (height - 40) - 20;
    return { x, y };
  });
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  return { path, dots: points, yMin, yMax, width, height };
}

interface ShareProfileCardProps {
  athlete: Types.AthleteResponse;
  meetResults: Types.MeetResultEntry[];
  teamName: string;
}

export const ShareProfileCard = forwardRef<HTMLDivElement, ShareProfileCardProps>(
  function ShareProfileCard({ athlete, meetResults, teamName }, ref) {
    const meetTotals = buildMeetTotals(meetResults);
    const bestTotalMeet =
      meetTotals.length > 0
        ? meetTotals.reduce((a, b) => (a.total_lbs >= b.total_lbs ? a : b))
        : null;
    const bestDots = meetResults.reduce<number | null>((best, r) => {
      if (r.dots_score == null) return best;
      if (best == null) return r.dots_score;
      return r.dots_score > best ? r.dots_score : best;
    }, null);
    const bestLifts: Record<Lift, BestPerLift | null> = {
      squat: bestLiftAcrossMeets(meetResults, 'squat'),
      bench: bestLiftAcrossMeets(meetResults, 'bench'),
      deadlift: bestLiftAcrossMeets(meetResults, 'deadlift'),
    };
    const fallbackLifts: Record<Lift, BestPerLift | null> = {
      squat: athlete.squat_max_lbs
        ? { weight_lbs: athlete.squat_max_lbs, meet_name: null }
        : null,
      bench: athlete.bench_max_lbs
        ? { weight_lbs: athlete.bench_max_lbs, meet_name: null }
        : null,
      deadlift: athlete.deadlift_max_lbs
        ? { weight_lbs: athlete.deadlift_max_lbs, meet_name: null }
        : null,
    };
    const liftFor = (l: Lift): BestPerLift | null => bestLifts[l] ?? fallbackLifts[l];

    const chart = buildChartPath(meetTotals);

    const meetCount = meetTotals.length;
    const firstYear = yearOf(meetTotals[0]?.meet_date ?? null);
    const lastYear = yearOf(meetTotals[meetTotals.length - 1]?.meet_date ?? null);

    const sexLabel =
      athlete.sex === 'M' ? 'Men' : athlete.sex === 'F' ? 'Women' : null;

    const headline =
      bestTotalMeet?.total_lbs ??
      (athlete.total_lbs && athlete.total_lbs > 0 ? athlete.total_lbs : null);
    const headlineMeetName =
      bestTotalMeet?.meet_name ?? athlete.next_meet_name ?? null;

    return (
      <div
        ref={ref}
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          background: 'radial-gradient(ellipse at top, #1c0a0a 0%, #0a0a0a 45%, #050505 100%)',
          color: '#fafafa',
          fontFamily: 'var(--font-sans), -apple-system, BlinkMacSystemFont, sans-serif',
          padding: 64,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
          border: `1px solid ${ACCENT}33`,
          borderRadius: 32,
        }}
      >
        <CardHeader teamName={teamName} />

        <div style={{ marginTop: 80 }}>
          <h1
            style={{
              fontSize: 88,
              lineHeight: 1.0,
              fontWeight: 700,
              letterSpacing: '-0.04em',
              margin: 0,
            }}
          >
            {athlete.name}
          </h1>
          <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
            {sexLabel && <CardPill>{sexLabel}</CardPill>}
            {athlete.division && <CardPill>{athlete.division}</CardPill>}
            {athlete.weight_class && <CardPill>{athlete.weight_class}</CardPill>}
          </div>
        </div>

        <BestTotalPanel
          headline={headline}
          headlineMeetName={headlineMeetName}
          bestDots={bestDots}
        />

        <ChartPanel chart={chart} totals={meetTotals} />

        <BestLiftsPanel
          squat={liftFor('squat')}
          bench={liftFor('bench')}
          deadlift={liftFor('deadlift')}
        />

        <FooterStats
          meetCount={meetCount}
          firstYear={firstYear}
          lastYear={lastYear}
        />

        <CardFooter teamName={teamName} />
      </div>
    );
  },
);

function CardHeader({ teamName }: { teamName: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          {teamName}
          <span style={{ color: ACCENT, marginLeft: 8 }}>HQ</span>
        </div>
        <div
          style={{
            fontSize: 14,
            color: 'rgba(250,250,250,0.5)',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            marginTop: 4,
          }}
        >
          Profile Card
        </div>
      </div>
    </div>
  );
}

function CardPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 22,
        padding: '8px 18px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.10)',
        color: 'rgba(250,250,250,0.85)',
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  );
}

function BestTotalPanel({
  headline,
  headlineMeetName,
  bestDots,
}: {
  headline: number | null;
  headlineMeetName: string | null;
  bestDots: number | null;
}) {
  return (
    <div
      style={{
        marginTop: 56,
        display: 'flex',
        gap: 20,
        alignItems: 'stretch',
      }}
    >
      <div
        style={{
          flex: 1,
          background: 'linear-gradient(135deg, rgba(239,68,68,0.10) 0%, rgba(239,68,68,0.02) 100%)',
          border: `1px solid ${ACCENT}40`,
          borderRadius: 20,
          padding: '32px 36px',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 24,
            bottom: 24,
            width: 4,
            background: ACCENT,
            borderRadius: 2,
          }}
        />
        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: ACCENT,
          }}
        >
          Best Total
        </div>
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            letterSpacing: '-0.04em',
            lineHeight: 1.0,
            marginTop: 8,
          }}
        >
          {formatLbs(headline)}
        </div>
        {headlineMeetName && (
          <div
            style={{
              fontSize: 22,
              color: 'rgba(250,250,250,0.65)',
              marginTop: 12,
            }}
          >
            {headlineMeetName}
          </div>
        )}
      </div>

      {bestDots != null && (
        <div
          style={{
            width: 220,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 20,
            padding: '24px 28px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(250,250,250,0.5)',
            }}
          >
            Best DOTS
          </div>
          <div
            style={{
              fontSize: 44,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              marginTop: 6,
            }}
          >
            {bestDots.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}

function ChartPanel({
  chart,
  totals,
}: {
  chart: ReturnType<typeof buildChartPath>;
  totals: MeetTotal[];
}) {
  if (totals.length < 2) {
    return null;
  }
  const yLabels = [
    chart.yMax,
    Math.round((chart.yMax + chart.yMin) / 2),
    chart.yMin,
  ];
  const firstLabel = formatMonthYear(totals[0].meet_date);
  const lastLabel = formatMonthYear(totals[totals.length - 1].meet_date);

  return (
    <div
      style={{
        marginTop: 32,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: 28,
      }}
    >
      <svg
        width={chart.width}
        height={chart.height}
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        style={{ display: 'block' }}
      >
        {yLabels.map((v, i) => {
          const y = (i / (yLabels.length - 1)) * (chart.height - 40) + 20;
          return (
            <g key={`grid-${i}`}>
              <line
                x1={70}
                x2={chart.width}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
              />
              <text
                x={0}
                y={y + 5}
                fill="rgba(250,250,250,0.55)"
                fontSize={18}
                fontWeight={500}
              >
                {Math.round(v)}lb
              </text>
            </g>
          );
        })}
        <g transform="translate(70, 0)">
          <path
            d={chart.path}
            fill="none"
            stroke={ACCENT}
            strokeWidth={4}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {chart.dots.map((d, i) => (
            <circle
              key={`d-${i}`}
              cx={d.x}
              cy={d.y}
              r={6}
              fill="#0a0a0a"
              stroke={ACCENT}
              strokeWidth={3}
            />
          ))}
        </g>
      </svg>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 18,
          color: 'rgba(250,250,250,0.55)',
          marginTop: 8,
          paddingLeft: 70,
        }}
      >
        <span>{firstLabel}</span>
        <span>{lastLabel}</span>
      </div>
    </div>
  );
}

function BestLiftsPanel({
  squat,
  bench,
  deadlift,
}: {
  squat: BestPerLift | null;
  bench: BestPerLift | null;
  deadlift: BestPerLift | null;
}) {
  return (
    <div
      style={{
        marginTop: 32,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: 32,
      }}
    >
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: ACCENT,
          marginBottom: 24,
        }}
      >
        Best Lifts
      </div>
      <div style={{ display: 'flex', gap: 24 }}>
        <BestLiftCell label="Squat" lift={squat} />
        <BestLiftCell label="Bench" lift={bench} />
        <BestLiftCell label="Deadlift" lift={deadlift} />
      </div>
    </div>
  );
}

function BestLiftCell({ label, lift }: { label: string; lift: BestPerLift | null }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'rgba(250,250,250,0.55)',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 56,
          fontWeight: 700,
          letterSpacing: '-0.03em',
          lineHeight: 1.0,
        }}
      >
        {formatLbs(lift?.weight_lbs ?? null)}
      </div>
      {lift?.meet_name && (
        <div
          style={{
            fontSize: 16,
            color: 'rgba(250,250,250,0.5)',
            marginTop: 8,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {lift.meet_name}
        </div>
      )}
    </div>
  );
}

function FooterStats({
  meetCount,
  firstYear,
  lastYear,
}: {
  meetCount: number;
  firstYear: number | null;
  lastYear: number | null;
}) {
  if (meetCount === 0) return null;
  const careerLabel =
    firstYear && lastYear
      ? firstYear === lastYear
        ? String(firstYear)
        : `${firstYear} – ${lastYear}`
      : '—';
  return (
    <div
      style={{
        marginTop: 24,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: '24px 32px',
        display: 'flex',
        gap: 24,
      }}
    >
      <FooterStatCell label="Meets" value={String(meetCount)} />
      <FooterStatCell label="Career" value={careerLabel} />
      <FooterStatCell
        label="Latest"
        value={lastYear ? String(lastYear) : '—'}
      />
    </div>
  );
}

function FooterStatCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'rgba(250,250,250,0.5)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 36,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CardFooter({ teamName }: { teamName: string }) {
  const wrapperStyle: CSSProperties = {
    marginTop: 'auto',
    paddingTop: 32,
    borderTop: `1px solid ${ACCENT}33`,
  };
  return (
    <div style={wrapperStyle}>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        {teamName}
        <span style={{ color: ACCENT, marginLeft: 8 }}>HQ</span>
      </div>
      <div
        style={{
          fontSize: 16,
          color: 'rgba(250,250,250,0.55)',
          marginTop: 4,
        }}
      >
        Powerlifting coaching analytics
      </div>
    </div>
  );
}
