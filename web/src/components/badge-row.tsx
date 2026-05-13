'use client';

import { useState } from 'react';
import { getBadgePrestige, type EarnedBadge } from '@/lib/badges';
import { BadgeDetailModal } from '@/components/badge-detail-modal';

interface BadgeRowProps {
  badges: EarnedBadge[];
  emptyHint?: string;
  size?: number;
  maxVisible?: number;
}

export function BadgeRow({
  badges,
  emptyHint,
  size = 40,
  maxVisible = 3,
}: BadgeRowProps) {
  const [selected, setSelected] = useState<EarnedBadge | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  if (badges.length === 0) {
    if (!emptyHint) return null;
    return (
      <div className="cloud-text-muted" style={{ fontSize: 12 }}>
        {emptyHint}
      </div>
    );
  }

  const safeMaxVisible = Math.max(1, maxVisible);
  const visibleBadges =
    badges.length > safeMaxVisible
      ? badges
          .map((badge, index) => ({ badge, index }))
          .sort((a, b) => {
            const byPrestige = getBadgePrestige(b.badge) - getBadgePrestige(a.badge);
            if (byPrestige !== 0) return byPrestige;
            const byCount = b.badge.count - a.badge.count;
            if (byCount !== 0) return byCount;
            return a.index - b.index;
          })
          .slice(0, safeMaxVisible)
          .map(({ badge }) => badge)
      : badges;
  const overflowCount = Math.max(0, badges.length - visibleBadges.length);

  return (
    <>
      <div
        className="flex flex-wrap"
        style={{ gap: 8 }}
        role="list"
        aria-label="Achievements"
      >
        {visibleBadges.map((badge) => (
          <BadgeTile
            key={badge.id}
            badge={badge}
            size={size}
            onClick={() => {
              setSelected(badge);
              setModalOpen(true);
            }}
          />
        ))}
        {overflowCount > 0 && (
          <OverflowChip
            count={overflowCount}
            size={size}
            onClick={() => {
              setSelected(null);
              setModalOpen(true);
            }}
          />
        )}
      </div>
      <BadgeDetailModal
        badge={selected}
        badges={badges}
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setSelected(null);
        }}
        onBadgeSelect={setSelected}
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
    </button>
  );
}

function OverflowChip({
  count,
  size,
  onClick,
}: {
  count: number;
  size: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="listitem"
      onClick={onClick}
      title={`View ${count} more achievements`}
      aria-label={`View ${count} more achievements`}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        border: '1px solid rgba(124, 180, 237, 0.55)',
        background: 'rgba(12, 92, 171, 0.14)',
        color: 'var(--cloud-primary-text, #7cb4ed)',
        cursor: 'pointer',
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.max(12, Math.round(size * 0.32)),
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        boxShadow: '0 0 0 1px rgba(12, 92, 171, 0.12)',
        transition: 'border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.borderColor = 'rgba(124, 180, 237, 0.85)';
        el.style.background = 'rgba(12, 92, 171, 0.22)';
        el.style.boxShadow = '0 0 0 3px rgba(12, 92, 171, 0.16)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.borderColor = 'rgba(124, 180, 237, 0.55)';
        el.style.background = 'rgba(12, 92, 171, 0.14)';
        el.style.boxShadow = '0 0 0 1px rgba(12, 92, 171, 0.12)';
      }}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(12, 92, 171, 0.18)';
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = '0 0 0 1px rgba(12, 92, 171, 0.12)';
      }}
    >
      +{count}
    </button>
  );
}
