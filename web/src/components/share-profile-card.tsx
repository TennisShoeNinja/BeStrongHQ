'use client';

import { forwardRef, type CSSProperties } from 'react';
import * as Types from '@/lib/types';
import {
  SHARE_BRAND,
  ShareCardLockup,
  CardEyebrow,
} from '@/components/share-card-brand';

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1920;

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
          background: SHARE_BRAND.bgGradient,
          color: SHARE_BRAND.paper,
          fontFamily: SHARE_BRAND.fontSans,
          fontVariantNumeric: 'tabular-nums',
          padding: 64,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
          border: `1px solid ${SHARE_BRAND.cardBorder}`,
          borderRadius: 20,
        }}
      >
        <CardHeader teamName={teamName} />

        <div style={{ marginTop: 80 }}>
          <h1
            style={{
              fontSize: 88,
              lineHeight: 1.0,
              fontWeight: 600,
              letterSpacing: '-0.035em',
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
        <CardEyebrow size="lg">{teamName}</CardEyebrow>
        <div
          style={{
            fontSize: 13,
            color: SHARE_BRAND.fgDim,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            marginTop: 6,
            fontWeight: 500,
          }}
        >
          Profile card
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
        background: SHARE_BRAND.panelHover,
        border: `1px solid ${SHARE_BRAND.borderStrong}`,
        color: SHARE_BRAND.fgMuted,
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
          background: `linear-gradient(135deg, ${SHARE_BRAND.blueGlowSoft} 0%, rgba(12,92,171,0.02) 100%)`,
          border: `1px solid ${SHARE_BRAND.blueGlowRim}`,
          borderRadius: 14,
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
            background: SHARE_BRAND.blue,
            borderRadius: 2,
          }}
        />
        <CardEyebrow>Best total</CardEyebrow>
        <div
          style={{
            fontSize: 96,
            fontWeight: 600,
            letterSpacing: '-0.035em',
            lineHeight: 1.0,
            marginTop: 12,
          }}
        >
          {formatLbs(headline)}
        </div>
        {headlineMeetName && (
          <div
            style={{
              fontSize: 22,
              color: SHARE_BRAND.fgMuted,
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
            background: SHARE_BRAND.panel,
            border: `1px solid ${SHARE_BRAND.border}`,
            borderRadius: 14,
            padding: '24px 28px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <CardEyebrow size="sm">Best DOTS</CardEyebrow>
          <div
            style={{
              fontSize: 44,
              fontWeight: 600,
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
        background: SHARE_BRAND.panel,
        border: `1px solid ${SHARE_BRAND.border}`,
        borderRadius: 14,
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
                fill={SHARE_BRAND.fgMuted}
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
            stroke={SHARE_BRAND.blue}
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
              fill={SHARE_BRAND.ink}
              stroke={SHARE_BRAND.blue}
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
          color: SHARE_BRAND.fgMuted,
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
        background: SHARE_BRAND.panel,
        border: `1px solid ${SHARE_BRAND.border}`,
        borderRadius: 14,
        padding: 32,
      }}
    >
      <div style={{ marginBottom: 24 }}>
        <CardEyebrow>Best lifts</CardEyebrow>
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
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: SHARE_BRAND.fgDim,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 56,
          fontWeight: 600,
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
            color: SHARE_BRAND.fgDim,
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
        background: SHARE_BRAND.panel,
        border: `1px solid ${SHARE_BRAND.border}`,
        borderRadius: 14,
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
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: SHARE_BRAND.fgDim,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 36,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CardFooter(_: { teamName: string }) {
  const wrapperStyle: CSSProperties = {
    marginTop: 'auto',
    paddingTop: 32,
    borderTop: `1px solid ${SHARE_BRAND.border}`,
  };
  return (
    <div style={wrapperStyle}>
      <ShareCardLockup />
      <div
        style={{
          fontSize: 16,
          color: SHARE_BRAND.fgMuted,
          marginTop: 6,
        }}
      >
        Powerlifting coaching analytics
      </div>
    </div>
  );
}
