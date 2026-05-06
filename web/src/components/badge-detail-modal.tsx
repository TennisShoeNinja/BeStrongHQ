'use client';

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
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
    (b.meet_date ?? '').localeCompare(a.meet_date ?? ''),
  );
}

export function BadgeDetailModal({
  badge,
  open,
  onOpenChange,
}: BadgeDetailModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] sm:!max-w-md"
        style={{ maxWidth: 460 }}
      >
        <DialogHeader>
          <DialogTitle
            style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em' }}
          >
            {badge?.label ?? 'Achievement'}
          </DialogTitle>
          <DialogDescription
            className="cloud-text-muted"
            style={{ fontSize: 13, lineHeight: 1.45 }}
          >
            {badge?.description ?? ''}
          </DialogDescription>
        </DialogHeader>

        {badge && (
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              className="cloud-text-muted"
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 600,
              }}
            >
              {badge.count > 1
                ? `Earned ${badge.count}×`
                : 'Earned'}
            </div>
            <ol
              style={{
                margin: 0,
                padding: 0,
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
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
