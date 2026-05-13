import {
  getNextMilestones,
  getRecentAchievements,
  type AthleteLifetimeStats,
  type EarnedBadge,
  type NextMilestone,
  type RecentAchievement,
} from '@/lib/badges';

interface HighlightsLineProps {
  badges: EarnedBadge[];
  athleteStats: AthleteLifetimeStats;
}

function formatRelative(iso: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T00:00:00`)
    : new Date(iso);
  if (Number.isNaN(date.getTime())) return 'date unknown';

  const days = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 86400000),
  );
  if (days < 7) return `${days}d ago`;
  if (days < 61) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30.4375)}mo ago`;
  return `${Math.floor(days / 365.25)}y ago`;
}

function cleanLiftName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (normalized === 'bench press') return 'bench';
  return normalized;
}

function formatLatest(achievement: RecentAchievement): string {
  const label = achievement.label.trim();
  const jump = label.match(/^\+(\d+(?:\.\d+)?)\s*(?:lbs?|kg)\b/i);
  if (jump && achievement.meet_name) {
    const amount = Math.round(Number(jump[1]));
    const lift = cleanLiftName(achievement.meet_name);
    if (amount > 0 && lift) {
      return `Latest +${amount} ${lift} ${formatRelative(achievement.meet_date)}`;
    }
  }
  return `Latest ${label} ${formatRelative(achievement.meet_date)}`;
}

function formatDistance(milestone: NextMilestone): string {
  const distance =
    milestone.unit === 'meets'
      ? Math.ceil(milestone.distance)
      : Math.max(1, Math.ceil(milestone.distance));

  if (milestone.unit === 'kg') return `${distance}kg away`;
  if (milestone.unit === 'DOTS') return `${distance} DOTS away`;
  return `${distance} ${distance === 1 ? 'meet' : 'meets'} away`;
}

function formatMilestoneLabel(label: string): string {
  return label
    .replace('Total', 'total')
    .replace('Meets', 'meets')
    .replace('Meet', 'meet');
}

function pickClosestMilestone(
  badges: EarnedBadge[],
  athleteStats: AthleteLifetimeStats,
): NextMilestone | null {
  const milestones = getNextMilestones(badges, athleteStats);
  if (milestones.length === 0) return null;
  return [...milestones].sort((a, b) => a.distance - b.distance)[0];
}

export function HighlightsLine({
  badges,
  athleteStats,
}: HighlightsLineProps) {
  const latest = getRecentAchievements(badges, 1)[0] ?? null;
  const next = pickClosestMilestone(badges, athleteStats);

  if (!latest && !next) return null;

  const parts = [
    latest ? formatLatest(latest) : null,
    next
      ? `Next ${formatMilestoneLabel(next.label)}, ${formatDistance(next)}`
      : null,
  ].filter(Boolean);

  return (
    <div
      className="cloud-text-muted"
      aria-label="Achievement highlights"
      style={{
        display: 'flex',
        alignItems: 'baseline',
        minWidth: 0,
        maxWidth: '100%',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        fontSize: 12,
        lineHeight: 1.4,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span
        style={{
          flexShrink: 0,
          marginRight: 12,
          color: 'var(--cloud-primary-text, #7cb4ed)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        Achievements
      </span>
      <span
        style={{
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {parts.map((part, index) => (
          <span key={part}>
            {index > 0 && (
              <span aria-hidden="true" style={{ margin: '0 10px' }}>
                ·
              </span>
            )}
            <span>{part}</span>
          </span>
        ))}
      </span>
    </div>
  );
}
