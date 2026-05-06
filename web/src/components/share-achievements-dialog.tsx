'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { toPng } from 'html-to-image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShareAchievementsCard } from '@/components/share-achievements-card';
import apiClient from '@/lib/api';
import { evaluateBadges } from '@/lib/badges';
import * as Types from '@/lib/types';

const CARD_NATIVE_WIDTH = 1080;
const PREVIEW_WIDTH = 360;
const PREVIEW_SCALE = PREVIEW_WIDTH / CARD_NATIVE_WIDTH;

interface ShareAchievementsDialogProps {
  athlete: Types.AthleteResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareAchievementsDialog({
  athlete,
  open,
  onOpenChange,
}: ShareAchievementsDialogProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brandingQuery = useQuery({
    queryKey: ['branding'],
    queryFn: () => apiClient.getBranding(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const teamName = brandingQuery.data?.team_name?.trim() || 'BeStrong';

  const [meetResultsQuery, maxHistoryQuery] = useQueries({
    queries: [
      {
        queryKey: ['meet-results', athlete.id],
        queryFn: () => apiClient.listMeetResults(athlete.id),
        enabled: open,
      },
      {
        queryKey: ['max-history', athlete.id],
        queryFn: () => apiClient.getMaxHistory(athlete.id),
        enabled: open,
      },
    ],
  });

  const badges = useMemo(
    () =>
      evaluateBadges({
        meetResults: meetResultsQuery.data ?? [],
        maxHistory: maxHistoryQuery.data ?? [],
      }),
    [meetResultsQuery.data, maxHistoryQuery.data],
  );

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
      link.download = `${safeName || 'athlete'}-achievements.png`;
      link.click();
    } catch (err) {
      console.error('Achievements export failed', err);
      setError(err instanceof Error ? err.message : 'Could not export image');
    } finally {
      setDownloading(false);
    }
  }

  const isLoading =
    open && (meetResultsQuery.isLoading || maxHistoryQuery.isLoading);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)]"
        style={{ maxWidth: 460 }}
      >
        <DialogHeader>
          <DialogTitle
            style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em' }}
          >
            Share Achievements
          </DialogTitle>
        </DialogHeader>

        <p
          className="cloud-text-muted"
          style={{ fontSize: 13, marginTop: -8, marginBottom: 4 }}
        >
          A single card showing every badge earned, ready for socials.
        </p>

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
              Loading achievements…
            </div>
          ) : badges.length === 0 ? (
            <div
              className="cloud-text-muted"
              style={{ padding: '60px 0', fontSize: 13, textAlign: 'center' }}
            >
              No achievements earned yet.
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
                <ShareAchievementsCard
                  ref={cardRef}
                  athleteName={athlete.name}
                  teamName={teamName}
                  badges={badges}
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
            disabled={downloading || isLoading || badges.length === 0}
          >
            {downloading ? 'Rendering…' : 'Download PNG'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
