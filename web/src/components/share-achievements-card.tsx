'use client';

import { forwardRef } from 'react';
import type { EarnedBadge } from '@/lib/badges';
import {
  SHARE_BRAND,
  ShareCardLockup,
  CardEyebrow,
} from '@/components/share-card-brand';

const CARD_WIDTH = 1080;
const MEDALLION_SIZE = 96;

interface ShareAchievementsCardProps {
  athleteName: string;
  teamName: string;
  badges: EarnedBadge[];
}

export const ShareAchievementsCard = forwardRef<
  HTMLDivElement,
  ShareAchievementsCardProps
>(function ShareAchievementsCard({ athleteName, teamName, badges }, ref) {
  const totalCount = badges.reduce((sum, b) => sum + Math.max(b.count, 1), 0);
  const tiers = new Set(badges.map((b) => b.tier));

  const cols = 3;
  const rows = Math.ceil(badges.length / cols);
  const tileHeight = 196;
  const headerSpace = 320;
  const footerSpace = 120;
  const cardHeight = headerSpace + rows * tileHeight + (rows - 1) * 16 + footerSpace;

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
            Achievements
          </div>
        </div>
        <div style={{ fontSize: 22, color: SHARE_BRAND.fgMuted, fontWeight: 500 }}>
          {athleteName}
        </div>
      </div>

      <div style={{ marginTop: 36 }}>
        <div
          style={{
            fontSize: 80,
            fontWeight: 600,
            letterSpacing: '-0.035em',
            lineHeight: 1.0,
          }}
        >
          {badges.length}
        </div>
        <div
          style={{
            fontSize: 22,
            color: SHARE_BRAND.fgMuted,
            marginTop: 8,
          }}
        >
          {badges.length === 1 ? 'achievement unlocked' : 'achievements unlocked'}
          {tiers.size > 0 && (
            <span style={{ color: SHARE_BRAND.fgDim }}>
              {' '}
              · {tiers.size} {tiers.size === 1 ? 'category' : 'categories'} · {totalCount} total
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: 40,
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 16,
        }}
      >
        {badges.map((badge) => (
          <BadgeCardTile key={badge.id} badge={badge} />
        ))}
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
});

function BadgeCardTile({ badge }: { badge: EarnedBadge }) {
  return (
    <div
      style={{
        background: SHARE_BRAND.panel,
        border: `1px solid ${SHARE_BRAND.border}`,
        borderRadius: 14,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        position: 'relative',
        minHeight: 196,
      }}
    >
      <div
        style={{
          width: MEDALLION_SIZE,
          height: MEDALLION_SIZE,
          position: 'relative',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/badges/${badge.id}.png`}
          alt={badge.label}
          width={MEDALLION_SIZE}
          height={MEDALLION_SIZE}
          draggable={false}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
        />
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: '-0.015em',
          marginTop: 4,
          color: SHARE_BRAND.paper,
        }}
      >
        {badge.label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: SHARE_BRAND.fgMuted,
          lineHeight: 1.4,
          flex: 1,
        }}
      >
        {badge.description}
      </div>
      {badge.count > 1 && (
        <div
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            minWidth: 32,
            height: 32,
            padding: '0 10px',
            borderRadius: 999,
            background: SHARE_BRAND.ink,
            border: '1px solid rgba(124, 180, 237, 0.5)',
            color: SHARE_BRAND.blueText,
            fontSize: 14,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            letterSpacing: 0,
            boxShadow: '0 1px 8px rgba(0, 0, 0, 0.45)',
          }}
        >
          {badge.count}
          <span style={{ opacity: 0.6, marginLeft: 1 }}>x</span>
        </div>
      )}
    </div>
  );
}
