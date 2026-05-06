'use client';

import { forwardRef } from 'react';
import * as Types from '@/lib/types';
import {
  SHARE_BRAND,
  ShareCardLockup,
  CardEyebrow,
} from '@/components/share-card-brand';

const CARD_WIDTH = 1080;
const SUCCESS_GREEN = '#34D399';

export interface MeetSummary {
  meet_key: string;
  meet_name: string | null;
  meet_date: string | null;
  federation: string | null;
  weight_class: string | null;
  squat_lbs: number;
  bench_lbs: number;
  deadlift_lbs: number;
  total_lbs: number;
  dots_score: number | null;
  place_numeric: number | null;
}

function meetKey(r: Types.MeetResultEntry): string {
  return r.meet_id != null
    ? `id:${r.meet_id}`
    : `nd:${r.meet_name ?? ''}|${r.meet_date ?? ''}`;
}

function parsePlace(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Aggregate meet-result attempt rows into one summary per meet.
 * Result is sorted newest first (descending by date).
 */
export function buildMeetSummaries(
  rows: Types.MeetResultEntry[],
): MeetSummary[] {
  const map = new Map<string, MeetSummary>();
  for (const r of rows) {
    const key = meetKey(r);
    let s = map.get(key);
    if (!s) {
      s = {
        meet_key: key,
        meet_name: r.meet_name,
        meet_date: r.meet_date,
        federation: r.federation,
        weight_class: r.weight_class,
        squat_lbs: 0,
        bench_lbs: 0,
        deadlift_lbs: 0,
        total_lbs: 0,
        dots_score: null,
        place_numeric: parsePlace(r.place),
      };
      map.set(key, s);
    }
    if (r.made) {
      const lift = r.lift.toLowerCase();
      if (lift === 'squat' && r.weight_lbs > s.squat_lbs) s.squat_lbs = r.weight_lbs;
      if (lift === 'bench' && r.weight_lbs > s.bench_lbs) s.bench_lbs = r.weight_lbs;
      if (lift === 'deadlift' && r.weight_lbs > s.deadlift_lbs) s.deadlift_lbs = r.weight_lbs;
    }
    if (r.dots_score != null && (s.dots_score == null || r.dots_score > s.dots_score)) {
      s.dots_score = r.dots_score;
    }
    if (s.place_numeric == null) {
      const p = parsePlace(r.place);
      if (p != null) s.place_numeric = p;
    }
    if (!s.weight_class && r.weight_class) {
      s.weight_class = r.weight_class;
    }
    if (!s.federation && r.federation) {
      s.federation = r.federation;
    }
  }
  for (const s of map.values()) {
    s.total_lbs = s.squat_lbs + s.bench_lbs + s.deadlift_lbs;
  }
  return Array.from(map.values())
    .filter((s) => s.total_lbs > 0)
    .sort((a, b) => (b.meet_date ?? '').localeCompare(a.meet_date ?? ''));
}

/**
 * Apply the "hide drops" rule. Walk meets oldest-first and drop any that
 * scored a lower total than the previous kept meet. The oldest stays
 * because it has no prior to compare to. Returns meets sorted newest first.
 */
export function hideNegativeDeltas(meets: MeetSummary[]): MeetSummary[] {
  if (meets.length === 0) return meets;
  const oldestFirst = [...meets].sort((a, b) =>
    (a.meet_date ?? '').localeCompare(b.meet_date ?? ''),
  );
  const kept: MeetSummary[] = [];
  for (const m of oldestFirst) {
    if (kept.length === 0) {
      kept.push(m);
      continue;
    }
    const prior = kept[kept.length - 1];
    if (m.total_lbs >= prior.total_lbs) kept.push(m);
  }
  return kept.sort((a, b) =>
    (b.meet_date ?? '').localeCompare(a.meet_date ?? ''),
  );
}

function formatLbs(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return `${Math.round(value)}`;
}

function formatMeetDate(date: string | null): string {
  if (!date) return '';
  const parts = date.split('-');
  if (parts.length !== 3) return date;
  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d) return date;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatPlace(n: number | null): string {
  if (n == null) return '—';
  if (n === 1) return '🥇';
  if (n === 2) return '🥈';
  if (n === 3) return '🥉';
  const mod100 = n % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? 'th'
      : ['st', 'nd', 'rd'][(n % 10) - 1] ?? 'th';
  return `${n}${suffix}`;
}

interface ShareCompHistoryCardProps {
  athleteName: string;
  teamName: string;
  /** Already filtered + selected, sorted newest first. */
  meets: MeetSummary[];
}

export const ShareCompHistoryCard = forwardRef<
  HTMLDivElement,
  ShareCompHistoryCardProps
>(function ShareCompHistoryCard({ athleteName, teamName, meets }, ref) {
  const wins = meets.filter((m) => m.place_numeric === 1).length;
  const bestTotal =
    meets.length > 0 ? Math.max(...meets.map((m) => m.total_lbs)) : 0;
  const bestDots = meets.reduce<number | null>((best, m) => {
    if (m.dots_score == null) return best;
    if (best == null) return m.dots_score;
    return m.dots_score > best ? m.dots_score : best;
  }, null);

  // Deltas: meets[i].total - meets[i+1].total. The oldest (last in array)
  // has no delta. Negatives have already been filtered upstream by
  // hideNegativeDeltas, but we render defensively.
  const deltas = meets.map((m, i) => {
    const prior = meets[i + 1];
    if (!prior) return null;
    const diff = m.total_lbs - prior.total_lbs;
    if (diff <= 0) return null;
    return diff;
  });

  const rowHeight = 76;
  const headerSpace = 360;
  const footerSpace = 110;
  const tableSpace = (meets.length + 1) * rowHeight + 24;
  const cardHeight = Math.max(headerSpace + tableSpace + footerSpace, 1080);

  return (
    <div
      ref={ref}
      style={{
        width: CARD_WIDTH,
        height: cardHeight,
        background: SHARE_BRAND.bgGradient,
        color: SHARE_BRAND.paper,
        fontFamily: SHARE_BRAND.fontSans,
        fontVariantNumeric: 'tabular-nums',
        padding: 64,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${SHARE_BRAND.cardBorder}`,
        borderRadius: 20,
        overflow: 'hidden',
      }}
    >
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
            Competition history
          </div>
        </div>
        <div style={{ fontSize: 22, color: SHARE_BRAND.fgMuted, fontWeight: 500 }}>
          {athleteName}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, marginTop: 36 }}>
        <SummaryTile label="Meets" value={String(meets.length)} />
        <SummaryTile label="Wins" value={String(wins)} accent={wins > 0} />
        <SummaryTile label="Best total" value={`${formatLbs(bestTotal)} lbs`} />
        <SummaryTile
          label="Best DOTS"
          value={bestDots != null ? bestDots.toFixed(2) : '—'}
        />
      </div>

      <div
        style={{
          marginTop: 28,
          flex: 1,
          background: SHARE_BRAND.panel,
          border: `1px solid ${SHARE_BRAND.border}`,
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        <TableHeader />
        {meets.map((m, i) => (
          <TableRow
            key={m.meet_key}
            meet={m}
            alt={i % 2 === 1}
            delta={deltas[i]}
          />
        ))}
      </div>

      <div
        style={{
          marginTop: 24,
          paddingTop: 24,
          borderTop: `1px solid ${SHARE_BRAND.border}`,
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
        }}
      >
        <ShareCardLockup />
        <span style={{ fontSize: 16, color: SHARE_BRAND.fgMuted }}>
          powerlifting analytics
        </span>
      </div>
    </div>
  );
});

function SummaryTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        background: accent
          ? `linear-gradient(135deg, ${SHARE_BRAND.blueGlowSoft}, rgba(12,92,171,0.02))`
          : SHARE_BRAND.panel,
        border: accent
          ? `1px solid ${SHARE_BRAND.blueGlowRim}`
          : `1px solid ${SHARE_BRAND.border}`,
        borderRadius: 10,
        padding: '18px 22px',
      }}
    >
      <CardEyebrow size="sm">{label}</CardEyebrow>
      <div
        style={{
          fontSize: 32,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          marginTop: 6,
        }}
      >
        {value}
      </div>
    </div>
  );
}

const COL_STYLE = {
  date: { width: 130 },
  place: { width: 56 },
  meet: { flex: 1, minWidth: 0 },
  squat: { width: 70, textAlign: 'right' as const },
  bench: { width: 70, textAlign: 'right' as const },
  deadlift: { width: 80, textAlign: 'right' as const },
  total: { width: 130, textAlign: 'right' as const },
  dots: { width: 76, textAlign: 'right' as const },
};

function TableHeader() {
  const labelStyle = {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.10em',
    textTransform: 'uppercase' as const,
    color: SHARE_BRAND.fgFaint,
  };
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '20px 24px',
        borderBottom: `1px solid ${SHARE_BRAND.border}`,
      }}
    >
      <div style={{ ...labelStyle, ...COL_STYLE.date }}>Date</div>
      <div style={{ ...labelStyle, ...COL_STYLE.place }}>Place</div>
      <div style={{ ...labelStyle, ...COL_STYLE.meet }}>Competition</div>
      <div style={{ ...labelStyle, ...COL_STYLE.squat }}>Squat</div>
      <div style={{ ...labelStyle, ...COL_STYLE.bench }}>Bench</div>
      <div style={{ ...labelStyle, ...COL_STYLE.deadlift }}>Deadlift</div>
      <div style={{ ...labelStyle, ...COL_STYLE.total }}>Total</div>
      <div style={{ ...labelStyle, ...COL_STYLE.dots }}>DOTS</div>
    </div>
  );
}

function TableRow({
  meet,
  alt,
  delta,
}: {
  meet: MeetSummary;
  alt: boolean;
  delta: number | null;
}) {
  const cell = {
    fontSize: 16,
    fontWeight: 500,
    color: SHARE_BRAND.fgMuted,
  };
  const totalCell = {
    fontSize: 18,
    fontWeight: 600,
    letterSpacing: '-0.01em',
  };
  const isWin = meet.place_numeric === 1;
  const subline = [meet.federation, meet.weight_class]
    .filter(Boolean)
    .join(' · ');
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '16px 24px',
        background: alt ? 'rgba(255,255,255,0.015)' : 'transparent',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <div style={{ ...cell, ...COL_STYLE.date, color: SHARE_BRAND.fgMuted }}>
        {formatMeetDate(meet.meet_date)}
      </div>
      <div
        style={{
          ...cell,
          ...COL_STYLE.place,
          fontSize:
            meet.place_numeric != null &&
            meet.place_numeric >= 1 &&
            meet.place_numeric <= 3
              ? 22
              : 14,
          color:
            meet.place_numeric === 1
              ? SHARE_BRAND.paper
              : SHARE_BRAND.fgDim,
        }}
      >
        {formatPlace(meet.place_numeric)}
      </div>
      <div
        style={{
          ...cell,
          ...COL_STYLE.meet,
          minWidth: 0,
        }}
      >
        <div
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: isWin ? 600 : 500,
            color: SHARE_BRAND.paper,
          }}
        >
          {meet.meet_name ?? '—'}
        </div>
        {subline && (
          <div
            style={{
              fontSize: 12,
              color: SHARE_BRAND.fgFaint,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginTop: 2,
            }}
          >
            {subline}
          </div>
        )}
      </div>
      <div style={{ ...cell, ...COL_STYLE.squat }}>{formatLbs(meet.squat_lbs)}</div>
      <div style={{ ...cell, ...COL_STYLE.bench }}>{formatLbs(meet.bench_lbs)}</div>
      <div style={{ ...cell, ...COL_STYLE.deadlift }}>{formatLbs(meet.deadlift_lbs)}</div>
      <div
        style={{
          ...cell,
          ...COL_STYLE.total,
          ...totalCell,
          color: isWin ? SHARE_BRAND.blueText : SHARE_BRAND.paper,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'flex-end',
          gap: 8,
        }}
      >
        {delta != null && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: SUCCESS_GREEN,
              letterSpacing: '0',
            }}
          >
            +{Math.round(delta)}
          </span>
        )}
        <span>{formatLbs(meet.total_lbs)}</span>
      </div>
      <div style={{ ...cell, ...COL_STYLE.dots, color: SHARE_BRAND.fgMuted }}>
        {meet.dots_score != null ? meet.dots_score.toFixed(2) : '—'}
      </div>
    </div>
  );
}
