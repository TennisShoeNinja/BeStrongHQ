'use client';

import { forwardRef } from 'react';
import * as Types from '@/lib/types';
import {
  SHARE_BRAND,
  ShareCardLockup,
} from '@/components/share-card-brand';

export type StickerOrientation = 'vertical' | 'horizontal';

interface ShareRecentPRStickerProps {
  entry: Types.MaxHistoryEntry;
  orientation: StickerOrientation;
  showPrevious: boolean;
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

function liftDisplayName(entry: Types.MaxHistoryEntry): string {
  const raw = (entry.exercise_name || entry.lift || '').trim();
  if (!raw) return 'Lift';
  const titled = raw
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  if (entry.reps && entry.reps > 1) return `${titled} ${entry.reps}RM`;
  return titled;
}

const STICKER_DIMS = {
  vertical: { width: 720, height: 900 },
  horizontal: { width: 1200, height: 280 },
};

export const ShareRecentPRSticker = forwardRef<
  HTMLDivElement,
  ShareRecentPRStickerProps
>(function ShareRecentPRSticker({ entry, orientation, showPrevious }, ref) {
  const dims = STICKER_DIMS[orientation];
  const delta = formatDelta(entry.old_value, entry.new_value);
  const lift = liftDisplayName(entry);
  const weight = formatLbs(entry.new_value);

  const isVertical = orientation === 'vertical';

  return (
    <div
      ref={ref}
      style={{
        width: dims.width,
        height: dims.height,
        background: 'transparent',
        color: SHARE_BRAND.paper,
        fontFamily: SHARE_BRAND.fontSans,
        fontVariantNumeric: 'tabular-nums',
        padding: isVertical ? '64px 56px' : '40px 56px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: isVertical ? 'column' : 'row',
        alignItems: isVertical ? 'flex-start' : 'center',
        justifyContent: isVertical ? 'space-between' : 'space-between',
        gap: isVertical ? 0 : 32,
        textShadow: '0 2px 12px rgba(0, 0, 0, 0.45)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: isVertical ? 'column' : 'row',
          alignItems: isVertical ? 'flex-start' : 'baseline',
          gap: isVertical ? 12 : 24,
          minWidth: 0,
          flex: isVertical ? 'none' : 1,
        }}
      >
        <div
          style={{
            fontSize: isVertical ? 56 : 56,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: SHARE_BRAND.fgMuted,
            lineHeight: 1.0,
          }}
        >
          {lift}
        </div>
        <div
          style={{
            fontSize: isVertical ? 168 : 144,
            fontWeight: 600,
            letterSpacing: '-0.04em',
            lineHeight: 1.0,
            color: SHARE_BRAND.paper,
            whiteSpace: 'nowrap',
          }}
        >
          {weight}
        </div>
        {showPrevious && delta && (
          <div
            style={{
              fontSize: isVertical ? 36 : 32,
              fontWeight: 600,
              color: SHARE_BRAND.blueText,
              letterSpacing: '0.02em',
              lineHeight: 1.0,
              marginTop: isVertical ? 8 : 0,
            }}
          >
            {delta}
          </div>
        )}
      </div>

      <div
        style={{
          alignSelf: isVertical ? 'flex-start' : 'center',
          opacity: 0.95,
          fontSize: isVertical ? 22 : 22,
        }}
      >
        <ShareCardLockup size={isVertical ? 'md' : 'md'} />
      </div>
    </div>
  );
});

export const STICKER_DIMENSIONS = STICKER_DIMS;
