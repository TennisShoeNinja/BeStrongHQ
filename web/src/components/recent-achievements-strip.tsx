import { getRecentAchievements, type EarnedBadge } from '@/lib/badges';

interface RecentAchievementsStripProps {
  badges: EarnedBadge[];
  limit?: number;
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

export function RecentAchievementsStrip({
  badges,
  limit = 3,
}: RecentAchievementsStripProps) {
  const achievements = getRecentAchievements(badges, limit);
  if (achievements.length === 0) return null;

  return (
    <div
      className="cloud-text-muted"
      aria-label="Recent achievements"
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
        Recently
      </span>
      <span
        style={{
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {achievements.map((achievement, index) => (
          <span key={`${achievement.badge_id}-${achievement.meet_date}-${index}`}>
            {index > 0 && (
              <span aria-hidden="true" style={{ margin: '0 10px' }}>
                ·
              </span>
            )}
            <span>{achievement.label}</span>
            <span aria-hidden="true" style={{ margin: '0 6px' }}>
              ·
            </span>
            <span>{formatRelative(achievement.meet_date)}</span>
          </span>
        ))}
      </span>
    </div>
  );
}
