'use client';

import { forwardRef, type ReactNode } from 'react';
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

const CARD_WIDTH = 1080;
const ACCENT = '#ef4444';

interface TierStyle {
  ring: string;
  bg: string;
  fg: string;
  icon: (props: { className?: string }) => ReactNode;
}

const TIER_STYLE: Record<EarnedBadge['tier'], TierStyle> = {
  milestone: {
    ring: 'rgba(99, 102, 241, 0.55)',
    bg: 'rgba(99, 102, 241, 0.12)',
    fg: '#a5b4fc',
    icon: (p) => <Sparkles {...p} />,
  },
  win: {
    ring: 'rgba(234, 179, 8, 0.6)',
    bg: 'rgba(234, 179, 8, 0.12)',
    fg: '#facc15',
    icon: (p) => <Trophy {...p} />,
  },
  longevity: {
    ring: 'rgba(148, 163, 184, 0.55)',
    bg: 'rgba(148, 163, 184, 0.12)',
    fg: '#cbd5e1',
    icon: (p) => <Hourglass {...p} />,
  },
  lift: {
    ring: 'rgba(239, 68, 68, 0.6)',
    bg: 'rgba(239, 68, 68, 0.12)',
    fg: '#fca5a5',
    icon: (p) => <Dumbbell {...p} />,
  },
  dots: {
    ring: 'rgba(16, 185, 129, 0.6)',
    bg: 'rgba(16, 185, 129, 0.12)',
    fg: '#6ee7b7',
    icon: (p) => <Target {...p} />,
  },
  special: {
    ring: 'rgba(244, 114, 182, 0.6)',
    bg: 'rgba(244, 114, 182, 0.12)',
    fg: '#f9a8d4',
    icon: (p) => <Medal {...p} />,
  },
  pr: {
    ring: 'rgba(251, 146, 60, 0.6)',
    bg: 'rgba(251, 146, 60, 0.12)',
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
            Achievements
          </div>
        </div>
        <div style={{ fontSize: 22, color: 'rgba(250,250,250,0.7)', fontWeight: 500 }}>
          {athleteName}
        </div>
      </div>

      <div style={{ marginTop: 36 }}>
        <div
          style={{
            fontSize: 80,
            fontWeight: 700,
            letterSpacing: '-0.04em',
            lineHeight: 1.0,
          }}
        >
          {badges.length}
        </div>
        <div
          style={{
            fontSize: 22,
            color: 'rgba(250,250,250,0.7)',
            marginTop: 8,
          }}
        >
          {badges.length === 1 ? 'achievement unlocked' : 'achievements unlocked'}
          {tiers.size > 0 && (
            <span style={{ color: 'rgba(250,250,250,0.5)' }}>
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

function BadgeCardTile({ badge }: { badge: EarnedBadge }) {
  const tier = TIER_STYLE[badge.tier];
  const Icon = ID_ICON[badge.id] ?? tier.icon;
  return (
    <div
      style={{
        background: tier.bg,
        border: `1px solid ${tier.ring}`,
        borderRadius: 18,
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
          width: 56,
          height: 56,
          borderRadius: 14,
          background: 'rgba(0,0,0,0.35)',
          border: `1px solid ${tier.ring}`,
          color: tier.fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon className="h-7 w-7" />
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: '-0.015em',
          marginTop: 4,
          color: 'rgba(250,250,250,0.95)',
        }}
      >
        {badge.label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: 'rgba(250,250,250,0.55)',
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
            background: 'rgba(0,0,0,0.5)',
            border: `1px solid ${tier.ring}`,
            color: tier.fg,
            fontSize: 14,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            letterSpacing: '-0.02em',
          }}
        >
          {badge.count}
          <span style={{ opacity: 0.6, marginLeft: 1 }}>x</span>
        </div>
      )}
    </div>
  );
}
