import {
  getNextMilestones,
  type AthleteLifetimeStats,
  type EarnedBadge,
  type NextMilestone,
} from '@/lib/badges';

interface NextMilestoneChipProps {
  badges: EarnedBadge[];
  athleteStats: AthleteLifetimeStats;
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

export function NextMilestoneChip({
  badges,
  athleteStats,
}: NextMilestoneChipProps) {
  const milestones = getNextMilestones(badges, athleteStats);
  if (milestones.length === 0) return null;

  return (
    <div
      className="cloud-text-muted"
      aria-label="Next achievement milestones"
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
        Next
      </span>
      <span
        style={{
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {milestones.map((milestone, index) => (
          <span key={milestone.badge_id}>
            {index > 0 && (
              <span aria-hidden="true" style={{ margin: '0 10px' }}>
                ·
              </span>
            )}
            <span>{milestone.label}</span>
            <span aria-hidden="true" style={{ margin: '0 6px' }}>
              ·
            </span>
            <span>{formatDistance(milestone)}</span>
          </span>
        ))}
      </span>
    </div>
  );
}
