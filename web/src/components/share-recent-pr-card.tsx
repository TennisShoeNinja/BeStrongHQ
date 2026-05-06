'use client';

import { forwardRef } from 'react';
import * as Types from '@/lib/types';

const CARD_WIDTH = 1080;
const CARD_HEIGHT_SINGLE = 1350;
const CARD_HEIGHT_LIST = 1620;
const ACCENT = '#ef4444';

export interface ShareRecentPRDisplayOptions {
  showDate: boolean;
  showContext: boolean;
  showPrevious: boolean;
}

interface ShareRecentPRCardProps {
  athleteName: string;
  teamName: string;
  entries: Types.MaxHistoryEntry[];
  options: ShareRecentPRDisplayOptions;
}

function formatLbs(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value % 1 !== 0) return `${value.toFixed(1)} lbs`;
  return `${Math.round(value)} lbs`;
}

function formatDelta(oldValue: number | null, newValue: number): string | null {
  if (oldValue == null || !Number.isFinite(oldValue) || oldValue <= 0) return null;
  const diff = newValue - oldValue;
  if (diff <= 0) return null;
  const rounded = diff % 1 === 0 ? Math.round(diff) : Math.round(diff * 10) / 10;
  return `+${rounded} lbs`;
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function liftDisplayName(entry: Types.MaxHistoryEntry): string {
  const raw = (entry.exercise_name || entry.lift || '').trim();
  if (!raw) return 'Lift';
  const lower = raw.toLowerCase();
  if (entry.reps && entry.reps > 1) {
    return `${raw} ${entry.reps}RM`;
  }
  return lower
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function contextLine(entry: Types.MaxHistoryEntry): string | null {
  const parts: string[] = [];
  if (entry.source && entry.source.toLowerCase() !== 'training') {
    parts.push(entry.source);
  }
  if (entry.note) parts.push(entry.note);
  if (parts.length === 0 && entry.source) parts.push(entry.source);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export const ShareRecentPRCard = forwardRef<HTMLDivElement, ShareRecentPRCardProps>(
  function ShareRecentPRCard({ athleteName, teamName, entries, options }, ref) {
    const isList = entries.length > 1;
    const cardHeight = isList ? CARD_HEIGHT_LIST : CARD_HEIGHT_SINGLE;
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
              {isList ? 'Recent PRs' : 'New PR'}
            </div>
          </div>
          <div
            style={{
              fontSize: 20,
              color: 'rgba(250,250,250,0.7)',
              fontWeight: 500,
            }}
          >
            {athleteName}
          </div>
        </div>

        <div style={{ marginTop: 56, flex: 1, display: 'flex', flexDirection: 'column' }}>
          {isList ? (
            <PRList entries={entries} options={options} />
          ) : (
            <PRSingle entry={entries[0]} options={options} />
          )}
        </div>

        <div
          style={{
            marginTop: 'auto',
            paddingTop: 32,
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
  },
);

function PRSingle({
  entry,
  options,
}: {
  entry: Types.MaxHistoryEntry;
  options: ShareRecentPRDisplayOptions;
}) {
  if (!entry) return null;
  const delta = formatDelta(entry.old_value, entry.new_value);
  const date = formatDate(entry.recorded_at);
  const context = contextLine(entry);

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(239,68,68,0.10) 0%, rgba(239,68,68,0.02) 100%)',
        border: `1px solid ${ACCENT}40`,
        borderRadius: 24,
        padding: '64px 56px',
        position: 'relative',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 56,
          bottom: 56,
          width: 4,
          background: ACCENT,
          borderRadius: 2,
        }}
      />
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: ACCENT,
        }}
      >
        Personal Record
      </div>
      <div
        style={{
          fontSize: 60,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          marginTop: 12,
          color: 'rgba(250,250,250,0.92)',
        }}
      >
        {liftDisplayName(entry)}
      </div>
      <div
        style={{
          fontSize: 168,
          fontWeight: 700,
          letterSpacing: '-0.04em',
          lineHeight: 1.0,
          marginTop: 24,
        }}
      >
        {formatLbs(entry.new_value)}
      </div>

      <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {options.showPrevious && delta && entry.old_value != null && (
          <MetaLine
            label="Previous"
            value={`${formatLbs(entry.old_value)}  ${delta}`}
          />
        )}
        {options.showDate && date && <MetaLine label="On" value={date} />}
        {options.showContext && context && <MetaLine label="From" value={context} />}
      </div>
    </div>
  );
}

function PRList({
  entries,
  options,
}: {
  entries: Types.MaxHistoryEntry[];
  options: ShareRecentPRDisplayOptions;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: ACCENT,
          marginBottom: 4,
        }}
      >
        Personal Records
      </div>
      {entries.map((entry, i) => (
        <PRListRow
          key={`${entry.id ?? i}`}
          entry={entry}
          options={options}
          isFirst={i === 0}
        />
      ))}
    </div>
  );
}

function PRListRow({
  entry,
  options,
  isFirst,
}: {
  entry: Types.MaxHistoryEntry;
  options: ShareRecentPRDisplayOptions;
  isFirst: boolean;
}) {
  const delta = formatDelta(entry.old_value, entry.new_value);
  const date = formatDate(entry.recorded_at);
  const context = contextLine(entry);
  return (
    <div
      style={{
        background: isFirst
          ? 'linear-gradient(135deg, rgba(239,68,68,0.10) 0%, rgba(239,68,68,0.02) 100%)'
          : 'rgba(255,255,255,0.03)',
        border: isFirst
          ? `1px solid ${ACCENT}40`
          : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 18,
        padding: '24px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 24,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 36,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: 'rgba(250,250,250,0.92)',
          }}
        >
          {liftDisplayName(entry)}
        </div>
        <div
          style={{
            fontSize: 16,
            color: 'rgba(250,250,250,0.55)',
            marginTop: 6,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          {options.showDate && date && <span>{date}</span>}
          {options.showContext && context && <span>{context}</span>}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            lineHeight: 1.0,
          }}
        >
          {formatLbs(entry.new_value)}
        </div>
        {options.showPrevious && delta && (
          <div
            style={{
              fontSize: 16,
              color: ACCENT,
              fontWeight: 600,
              marginTop: 4,
              letterSpacing: '0.02em',
            }}
          >
            {delta}
          </div>
        )}
      </div>
    </div>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'rgba(250,250,250,0.45)',
          width: 110,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 500,
          color: 'rgba(250,250,250,0.85)',
        }}
      >
        {value}
      </div>
    </div>
  );
}
