'use client';

import { forwardRef } from 'react';
import * as Types from '@/lib/types';

const CARD_WIDTH = 1080;
const ACCENT = '#ef4444';

interface MeetSummary {
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

function buildMeetSummaries(rows: Types.MeetResultEntry[]): MeetSummary[] {
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
  }
  for (const s of map.values()) {
    s.total_lbs = s.squat_lbs + s.bench_lbs + s.deadlift_lbs;
  }
  return Array.from(map.values())
    .filter((s) => s.total_lbs > 0)
    .sort((a, b) => (b.meet_date ?? '').localeCompare(a.meet_date ?? ''));
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
  meetResults: Types.MeetResultEntry[];
  maxRows?: number;
}

export const ShareCompHistoryCard = forwardRef<
  HTMLDivElement,
  ShareCompHistoryCardProps
>(function ShareCompHistoryCard(
  { athleteName, teamName, meetResults, maxRows = 14 },
  ref,
) {
  const allMeets = buildMeetSummaries(meetResults);
  const meets = allMeets.slice(0, maxRows);
  const wins = allMeets.filter((m) => m.place_numeric === 1).length;
  const bestTotal =
    allMeets.length > 0
      ? Math.max(...allMeets.map((m) => m.total_lbs))
      : 0;
  const bestDots = allMeets.reduce<number | null>((best, m) => {
    if (m.dots_score == null) return best;
    if (best == null) return m.dots_score;
    return m.dots_score > best ? m.dots_score : best;
  }, null);

  const rowHeight = 72;
  const headerSpace = 360;
  const footerSpace = 110;
  const tableSpace = (meets.length + 1) * rowHeight + 24;
  const cardHeight = headerSpace + tableSpace + footerSpace;

  return (
    <div
      ref={ref}
      style={{
        width: CARD_WIDTH,
        height: cardHeight,
        background: 'radial-gradient(ellipse at top, #1c0a0a 0%, #0a0a0a 45%, #050505 100%)',
        color: '#fafafa',
        fontFamily: 'var(--font-sans), -apple-system, BlinkMacSystemFont, sans-serif',
        padding: 64,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${ACCENT}33`,
        borderRadius: 32,
        overflow: 'hidden',
      }}
    >
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
            Competition History
          </div>
        </div>
        <div style={{ fontSize: 22, color: 'rgba(250,250,250,0.7)', fontWeight: 500 }}>
          {athleteName}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, marginTop: 36 }}>
        <SummaryTile label="Meets" value={String(allMeets.length)} />
        <SummaryTile label="Wins" value={String(wins)} accent={wins > 0} />
        <SummaryTile label="Best Total" value={`${formatLbs(bestTotal)} lbs`} />
        <SummaryTile
          label="Best DOTS"
          value={bestDots != null ? bestDots.toFixed(2) : '—'}
        />
      </div>

      <div
        style={{
          marginTop: 28,
          flex: 1,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20,
          overflow: 'hidden',
        }}
      >
        <TableHeader />
        {meets.map((m, i) => (
          <TableRow key={m.meet_key} meet={m} alt={i % 2 === 1} />
        ))}
        {allMeets.length > meets.length && (
          <div
            style={{
              padding: '14px 24px',
              fontSize: 14,
              color: 'rgba(250,250,250,0.5)',
              textAlign: 'center',
            }}
          >
            + {allMeets.length - meets.length} more
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 24,
          paddingTop: 24,
          borderTop: `1px solid ${ACCENT}33`,
          fontSize: 16,
          color: 'rgba(250,250,250,0.55)',
        }}
      >
        {teamName}
        <span style={{ color: ACCENT, marginLeft: 6 }}>HQ</span>
        <span style={{ marginLeft: 8 }}>powerlifting analytics</span>
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
          ? 'linear-gradient(135deg, rgba(239,68,68,0.10), rgba(239,68,68,0.02))'
          : 'rgba(255,255,255,0.03)',
        border: accent
          ? `1px solid ${ACCENT}40`
          : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: '18px 22px',
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: accent ? ACCENT : 'rgba(250,250,250,0.5)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 32,
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

const COL_STYLE = {
  date: { width: 130 },
  place: { width: 56 },
  meet: { flex: 1, minWidth: 0 },
  squat: { width: 70, textAlign: 'right' as const },
  bench: { width: 70, textAlign: 'right' as const },
  deadlift: { width: 80, textAlign: 'right' as const },
  total: { width: 96, textAlign: 'right' as const },
  dots: { width: 76, textAlign: 'right' as const },
};

function TableHeader() {
  const labelStyle = {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: 'rgba(250,250,250,0.45)',
  };
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '20px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
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

function TableRow({ meet, alt }: { meet: MeetSummary; alt: boolean }) {
  const cell = {
    fontSize: 16,
    fontWeight: 500,
    color: 'rgba(250,250,250,0.85)',
  };
  const totalCell = {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: '-0.01em',
  };
  const isWin = meet.place_numeric === 1;
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
      <div style={{ ...cell, ...COL_STYLE.date, color: 'rgba(250,250,250,0.6)' }}>
        {formatMeetDate(meet.meet_date)}
      </div>
      <div style={{ ...cell, ...COL_STYLE.place, fontSize: 22 }}>
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
          }}
        >
          {meet.meet_name ?? '—'}
        </div>
        {meet.federation && (
          <div
            style={{
              fontSize: 12,
              color: 'rgba(250,250,250,0.45)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginTop: 2,
            }}
          >
            {meet.federation}
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
          color: isWin ? ACCENT : 'rgba(250,250,250,0.95)',
        }}
      >
        {formatLbs(meet.total_lbs)}
      </div>
      <div style={{ ...cell, ...COL_STYLE.dots, color: 'rgba(250,250,250,0.6)' }}>
        {meet.dots_score != null ? meet.dots_score.toFixed(2) : '—'}
      </div>
    </div>
  );
}
