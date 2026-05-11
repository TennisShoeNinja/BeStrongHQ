'use client';

import { useState } from 'react';
import type { EarnedBadge } from '@/lib/badges';
import { BadgeDetailModal } from '@/components/badge-detail-modal';

interface BadgeRowProps {
  badges: EarnedBadge[];
  emptyHint?: string;
  size?: number;
}

export function BadgeRow({ badges, emptyHint, size = 56 }: BadgeRowProps) {
  const [selected, setSelected] = useState<EarnedBadge | null>(null);

  if (badges.length === 0) {
    if (!emptyHint) return null;
    return (
      <div className="cloud-text-muted" style={{ fontSize: 12 }}>
        {emptyHint}
      </div>
    );
  }

  return (
    <>
      <div
        className="flex flex-wrap"
        style={{ gap: 12 }}
        role="list"
        aria-label="Achievements"
      >
        {badges.map((badge) => (
          <BadgeTile
            key={badge.id}
            badge={badge}
            size={size}
            onClick={() => setSelected(badge)}
          />
        ))}
      </div>
      <BadgeDetailModal
        badge={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </>
  );
}

function BadgeTile({
  badge,
  size,
  onClick,
}: {
  badge: EarnedBadge;
  size: number;
  onClick: () => void;
}) {
  const pillHeight = Math.max(20, Math.round(size * 0.38));
  const pillFontSize = Math.max(10, Math.round(size * 0.19));

  return (
    <button
      type="button"
      onClick={onClick}
      role="listitem"
      title={badge.label}
      style={{
        position: 'relative',
        width: size,
        height: size,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        transition: 'transform 0.12s ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
      }}
      aria-label={`${badge.label}${badge.count > 1 ? ` (${badge.count} times)` : ''}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/badges/${badge.id}.png`}
        alt={badge.label}
        width={size}
        height={size}
        draggable={false}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />
      {badge.count > 1 && (
        <span
          style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            minWidth: pillHeight,
            height: pillHeight,
            padding: `0 ${Math.max(6, Math.round(size * 0.11))}px`,
            borderRadius: 999,
            background: 'var(--cloud-surface, #09090b)',
            border: '1px solid rgba(124, 180, 237, 0.5)',
            color: 'var(--cloud-primary-text, #7cb4ed)',
            fontSize: pillFontSize,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            letterSpacing: 0,
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.45)',
          }}
        >
          {badge.count}
          <span style={{ opacity: 0.6, marginLeft: 1 }}>x</span>
        </span>
      )}
    </button>
  );
}
