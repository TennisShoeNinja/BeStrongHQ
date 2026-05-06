'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toPng } from 'html-to-image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShareCompHistoryCard } from '@/components/share-comp-history-card';
import apiClient from '@/lib/api';
import * as Types from '@/lib/types';

const CARD_NATIVE_WIDTH = 1080;
const PREVIEW_WIDTH = 360;
const PREVIEW_SCALE = PREVIEW_WIDTH / CARD_NATIVE_WIDTH;

interface ShareCompHistoryDialogProps {
  athlete: Types.AthleteResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareCompHistoryDialog({
  athlete,
  open,
  onOpenChange,
}: ShareCompHistoryDialogProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxRows, setMaxRows] = useState(14);

  const brandingQuery = useQuery({
    queryKey: ['branding'],
    queryFn: () => apiClient.getBranding(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const teamName = brandingQuery.data?.team_name?.trim() || 'BeStrong';

  const meetResultsQuery = useQuery({
    queryKey: ['meet-results', athlete.id],
    queryFn: () => apiClient.listMeetResults(athlete.id),
    enabled: open,
  });

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  async function handleDownload() {
    if (!cardRef.current) return;
    setDownloading(true);
    setError(null);
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        width: CARD_NATIVE_WIDTH,
        height: cardRef.current.offsetHeight,
        backgroundColor: '#050505',
        skipFonts: true,
      });
      const safeName = athlete.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${safeName || 'athlete'}-comp-history.png`;
      link.click();
    } catch (err) {
      console.error('Comp history export failed', err);
      setError(err instanceof Error ? err.message : 'Could not export image');
    } finally {
      setDownloading(false);
    }
  }

  const meetResults = meetResultsQuery.data ?? [];
  const isLoading = open && meetResultsQuery.isLoading;
  const meetCount = (() => {
    const ids = new Set<string>();
    for (const r of meetResults) {
      ids.add(
        r.meet_id != null
          ? `id:${r.meet_id}`
          : `nd:${r.meet_name ?? ''}|${r.meet_date ?? ''}`,
      );
    }
    return ids.size;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)]"
        style={{ maxWidth: 540 }}
      >
        <DialogHeader>
          <DialogTitle
            style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em' }}
          >
            Share Competition History
          </DialogTitle>
        </DialogHeader>

        <p
          className="cloud-text-muted"
          style={{ fontSize: 13, marginTop: -8, marginBottom: 4 }}
        >
          Recent meet rows in a shareable card. Pick how many to include.
        </p>

        <div
          className="cloud-panel"
          style={{
            padding: 12,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div className="cloud-text" style={{ fontSize: 13 }}>
            Show last
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[8, 14, 20, 30].map((n) => {
              const disabled = meetCount > 0 && n > meetCount + 1;
              const active = maxRows === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMaxRows(n)}
                  disabled={disabled}
                  className={active ? 'cloud-btn cloud-btn-primary' : 'cloud-btn cloud-btn-ghost'}
                  style={{
                    padding: '4px 12px',
                    fontSize: 12,
                    opacity: disabled ? 0.4 : 1,
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            background: 'var(--cloud-surface)',
            border: '1px solid var(--cloud-border)',
            borderRadius: 12,
            padding: 16,
            overflow: 'auto',
            maxHeight: 480,
          }}
        >
          {isLoading ? (
            <div
              className="cloud-text-muted"
              style={{ padding: '120px 0', fontSize: 13 }}
            >
              Loading meet history…
            </div>
          ) : meetCount === 0 ? (
            <div
              className="cloud-text-muted"
              style={{ padding: '60px 0', fontSize: 13, textAlign: 'center' }}
            >
              No meets found for this athlete yet.
            </div>
          ) : (
            <div
              style={{
                width: PREVIEW_WIDTH,
                position: 'relative',
              }}
            >
              <div
                style={{
                  transform: `scale(${PREVIEW_SCALE})`,
                  transformOrigin: 'top left',
                  width: CARD_NATIVE_WIDTH,
                }}
              >
                <ShareCompHistoryCard
                  ref={cardRef}
                  athleteName={athlete.name}
                  teamName={teamName}
                  meetResults={meetResults}
                  maxRows={maxRows}
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <div
            style={{ fontSize: 13, color: 'rgb(248, 113, 113)', marginTop: 4 }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 8,
          }}
        >
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={downloading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDownload}
            disabled={downloading || isLoading || meetCount === 0}
          >
            {downloading ? 'Rendering…' : 'Download PNG'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
