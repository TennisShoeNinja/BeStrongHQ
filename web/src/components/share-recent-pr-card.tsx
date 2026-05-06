'use client';

import { forwardRef } from 'react';
import * as Types from '@/lib/types';

const CARD_WIDTH = 1080;
const CARD_HEIGHT_SINGLE = 1350;
const CARD_HEIGHT_LIST = 1620;
import {
  SHARE_BRAND,
  ShareCardLockup,
  CardEyebrow,
} from '@/components/share-card-brand';

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
              {isList ? 'Recent PRs' : 'New PR'}
            </div>
          </div>
          <div
            style={{
              fontSize: 20,
              color: SHARE_BRAND.fgMuted,
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
        background: `linear-gradient(135deg, ${SHARE_BRAND.blueGlowSoft} 0%, rgba(12,92,171,0.02) 100%)`,
        border: `1px solid ${SHARE_BRAND.blueGlowRim}`,
        borderRadius: 14,
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
          background: SHARE_BRAND.blue,
          borderRadius: 2,
        }}
      />
      <CardEyebrow size="lg">Personal record</CardEyebrow>
      <div
        style={{
          fontSize: 60,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          marginTop: 12,
          color: SHARE_BRAND.paper,
        }}
      >
        {liftDisplayName(entry)}
      </div>
      <div
        style={{
          fontSize: 168,
          fontWeight: 600,
          letterSpacing: '-0.035em',
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
          marginBottom: 4,
        }}
      >
        <CardEyebrow size="lg">Personal records</CardEyebrow>
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
          ? `linear-gradient(135deg, ${SHARE_BRAND.blueGlowSoft} 0%, rgba(12,92,171,0.02) 100%)`
          : SHARE_BRAND.panel,
        border: isFirst
          ? `1px solid ${SHARE_BRAND.blueGlowRim}`
          : `1px solid ${SHARE_BRAND.border}`,
        borderRadius: 14,
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
            color: SHARE_BRAND.paper,
          }}
        >
          {liftDisplayName(entry)}
        </div>
        <div
          style={{
            fontSize: 16,
            color: SHARE_BRAND.fgMuted,
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
            fontWeight: 600,
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
              color: SHARE_BRAND.blueText,
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
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: SHARE_BRAND.fgDim,
          width: 110,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 500,
          color: SHARE_BRAND.paper,
        }}
      >
        {value}
      </div>
    </div>
  );
}
