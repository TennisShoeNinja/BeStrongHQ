'use client';

import { ArrowLeft } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { BadgeEvent, EarnedBadge } from '@/lib/badges';

interface BadgeDetailModalProps {
  badge: EarnedBadge | null;
  badges?: EarnedBadge[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBadgeSelect?: (badge: EarnedBadge | null) => void;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Date unknown';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function sortEvents(events: BadgeEvent[]): BadgeEvent[] {
  return [...events].sort((a, b) =>
    (a.meet_date ?? '').localeCompare(b.meet_date ?? ''),
  );
}

export function BadgeDetailModal({
  badge,
  badges = [],
  open,
  onOpenChange,
  onBadgeSelect,
}: BadgeDetailModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] sm:!max-w-[480px]"
        style={{
          maxWidth: 480,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <DialogHeader
          style={{
            alignItems: 'center',
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          {badge !== null && badges.length > 1 && (
            <button
              type="button"
              onClick={() => onBadgeSelect?.(null)}
              className="cloud-text-muted"
              style={{
                alignSelf: 'flex-start',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                border: '1px solid var(--cloud-border)',
                borderRadius: 999,
                background: 'var(--cloud-panel)',
                padding: '5px 9px',
                cursor: 'pointer',
                fontSize: 12,
                lineHeight: 1,
                marginBottom: 4,
              }}
            >
              <ArrowLeft size={13} strokeWidth={1.8} aria-hidden="true" />
              All Achievements
            </button>
          )}
          {badge && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                marginTop: 8,
                marginBottom: 12,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/badges/${badge.id}.png`}
                alt={badge.label}
                width={192}
                height={192}
                draggable={false}
                style={{
                  display: 'block',
                  width: 192,
                  height: 192,
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 8px 20px rgba(0, 0, 0, 0.4))',
                }}
              />
            </div>
          )}
          <DialogTitle
            style={{
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: '-0.015em',
              textAlign: 'center',
            }}
          >
            {badge === null ? 'All Achievements' : badge.label}
          </DialogTitle>
          <DialogDescription
            className="cloud-text-muted"
            style={{ fontSize: 13, lineHeight: 1.45, textAlign: 'center' }}
          >
            {badge === null
              ? 'Every earned badge for this athlete.'
              : badge.description}
          </DialogDescription>
        </DialogHeader>

        {badge === null ? (
          <AchievementList badges={badges} onBadgeSelect={onBadgeSelect} />
        ) : (
          <div
            style={{
              marginTop: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              flex: 1,
              minHeight: 0,
            }}
          >
            <div
              aria-hidden="true"
              style={{
                height: 1,
                background: 'var(--cloud-border)',
                marginTop: 2,
                flexShrink: 0,
              }}
            />
            <div
              className="cloud-text-muted"
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {badge.count > 1 ? `Earned ${badge.count}×` : 'Earned'}
            </div>
            <ol
              style={{
                margin: 0,
                padding: 0,
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                overflowY: 'auto',
                minHeight: 0,
                flex: 1,
                paddingRight: 4,
              }}
            >
              {sortEvents(badge.events).map((event, idx) => (
                <li
                  key={`${event.meet_key}-${idx}`}
                  className="cloud-panel"
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      className="cloud-text"
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {event.meet_name ?? 'Untitled meet'}
                    </div>
                    {event.detail && (
                      <div
                        className="cloud-text-muted"
                        style={{ fontSize: 11, marginTop: 2 }}
                      >
                        {event.detail}
                      </div>
                    )}
                  </div>
                  <div
                    className="cloud-text-muted"
                    style={{ fontSize: 12, flexShrink: 0 }}
                  >
                    {formatDate(event.meet_date)}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AchievementList({
  badges,
  onBadgeSelect,
}: {
  badges: EarnedBadge[];
  onBadgeSelect?: (badge: EarnedBadge | null) => void;
}) {
  return (
    <div
      style={{
        marginTop: 6,
        overflowY: 'auto',
        minHeight: 0,
        paddingRight: 2,
      }}
    >
      <div
        role="list"
        aria-label="All achievements"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 10,
        }}
      >
        {badges.map((badge) => (
          <button
            type="button"
            role="listitem"
            key={badge.id}
            onClick={() => onBadgeSelect?.(badge)}
            className="cloud-panel"
            style={{
              padding: 10,
              borderRadius: 10,
              cursor: 'pointer',
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 7,
              textAlign: 'center',
              transition: 'border-color 0.15s ease, background 0.15s ease',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/badges/${badge.id}.png`}
              alt=""
              width={64}
              height={64}
              draggable={false}
              style={{
                display: 'block',
                width: 64,
                height: 64,
                objectFit: 'contain',
                filter: 'drop-shadow(0 6px 14px rgba(0, 0, 0, 0.35))',
              }}
            />
            <span
              className="cloud-text"
              style={{
                fontSize: 12,
                fontWeight: 600,
                lineHeight: 1.25,
                overflowWrap: 'anywhere',
              }}
            >
              {badge.label}
            </span>
            {badge.count > 1 && (
              <span
                className="cloud-text-muted"
                style={{
                  fontSize: 11,
                  lineHeight: 1.2,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                Earned {badge.count}×
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
