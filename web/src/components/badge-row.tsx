'use client';

import { useState, type ReactNode } from 'react';
import {
  Sparkles,
  Trophy,
  Medal,
  Crown,
  Hourglass,
  Dumbbell,
  Target,
  CheckCheck,
  RotateCcw,
  TrendingUp,
  Flame,
  Layers,
  Zap,
} from 'lucide-react';
import type { EarnedBadge } from '@/lib/badges';
import { BadgeDetailModal } from '@/components/badge-detail-modal';

interface TierStyle {
  ring: string;
  bg: string;
  fg: string;
  icon: (props: { className?: string }) => ReactNode;
}

const TIER_STYLE: Record<EarnedBadge['tier'], TierStyle> = {
  milestone: {
    ring: 'rgba(99, 102, 241, 0.45)',
    bg: 'rgba(99, 102, 241, 0.10)',
    fg: '#a5b4fc',
    icon: (p) => <Sparkles {...p} />,
  },
  win: {
    ring: 'rgba(234, 179, 8, 0.55)',
    bg: 'rgba(234, 179, 8, 0.10)',
    fg: '#facc15',
    icon: (p) => <Trophy {...p} />,
  },
  longevity: {
    ring: 'rgba(148, 163, 184, 0.5)',
    bg: 'rgba(148, 163, 184, 0.10)',
    fg: '#cbd5e1',
    icon: (p) => <Hourglass {...p} />,
  },
  lift: {
    ring: 'rgba(239, 68, 68, 0.5)',
    bg: 'rgba(239, 68, 68, 0.10)',
    fg: '#fca5a5',
    icon: (p) => <Dumbbell {...p} />,
  },
  dots: {
    ring: 'rgba(16, 185, 129, 0.5)',
    bg: 'rgba(16, 185, 129, 0.10)',
    fg: '#6ee7b7',
    icon: (p) => <Target {...p} />,
  },
  special: {
    ring: 'rgba(244, 114, 182, 0.55)',
    bg: 'rgba(244, 114, 182, 0.10)',
    fg: '#f9a8d4',
    icon: (p) => <Medal {...p} />,
  },
  pr: {
    ring: 'rgba(251, 146, 60, 0.55)',
    bg: 'rgba(251, 146, 60, 0.10)',
    fg: '#fdba74',
    icon: (p) => <TrendingUp {...p} />,
  },
};

const ID_ICON: Record<string, (p: { className?: string }) => ReactNode> = {
  'first-place': (p) => <Trophy {...p} />,
  'three-peat': (p) => <Crown {...p} />,
  'multi-fed-champ': (p) => <Crown {...p} />,
  comeback: (p) => <RotateCcw {...p} />,
  'nine-for-nine': (p) => <CheckCheck {...p} />,
  'pr-streak-3': (p) => <Flame {...p} />,
  'pr-streak-6': (p) => <Flame {...p} />,
  'pr-streak-12': (p) => <Flame {...p} />,
  'triple-threat': (p) => <Layers {...p} />,
  'big-jump': (p) => <Zap {...p} />,
};

interface BadgeRowProps {
  badges: EarnedBadge[];
  emptyHint?: string;
}

export function BadgeRow({ badges, emptyHint }: BadgeRowProps) {
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
  onClick,
}: {
  badge: EarnedBadge;
  onClick: () => void;
}) {
  const tier = TIER_STYLE[badge.tier];
  const Icon = ID_ICON[badge.id] ?? tier.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      role="listitem"
      title={badge.label}
      style={{
        position: 'relative',
        width: 56,
        height: 56,
        borderRadius: 14,
        background: tier.bg,
        border: `1px solid ${tier.ring}`,
        color: tier.fg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
        transition: 'transform 0.12s ease, background 0.12s ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
      }}
      aria-label={`${badge.label}${badge.count > 1 ? ` (${badge.count} times)` : ''}`}
    >
      <Icon className="h-6 w-6" />
      {badge.count > 1 && (
        <span
          style={{
            position: 'absolute',
            bottom: -4,
            right: -4,
            minWidth: 22,
            height: 22,
            padding: '0 6px',
            borderRadius: 999,
            background: 'var(--cloud-surface-raised, #18181b)',
            border: `1px solid ${tier.ring}`,
            color: tier.fg,
            fontSize: 11,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            letterSpacing: '-0.02em',
          }}
        >
          {badge.count}
          <span style={{ opacity: 0.6, marginLeft: 1 }}>x</span>
        </span>
      )}
    </button>
  );
}
