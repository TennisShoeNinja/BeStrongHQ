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
import { ShareProfileCard } from '@/components/share-profile-card';
import apiClient from '@/lib/api';
import * as Types from '@/lib/types';

const CARD_NATIVE_WIDTH = 1080;
const PREVIEW_WIDTH = 360;
const PREVIEW_SCALE = PREVIEW_WIDTH / CARD_NATIVE_WIDTH;

interface ShareProfileDialogProps {
  athlete: Types.AthleteResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareProfileDialog({
  athlete,
  open,
  onOpenChange,
}: ShareProfileDialogProps) {
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
      });
      const safeName = athlete.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${safeName || 'athlete'}-profile-card.png`;
      link.click();
    } catch (err) {
      console.error('Share profile export failed', err);
      setError(err instanceof Error ? err.message : 'Could not export image');
    } finally {
      setDownloading(false);
    }
  }

  const meetResults = meetResultsQuery.data ?? [];
  const isLoading = open && meetResultsQuery.isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] sm:!max-w-md"
        style={{ maxWidth: 480 }}
      >
        <DialogHeader>
          <DialogTitle
            style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em' }}
          >
            Share Profile
          </DialogTitle>
        </DialogHeader>

        <p
          className="cloud-text-muted"
          style={{ fontSize: 13, marginTop: -8, marginBottom: 8 }}
        >
          Download a 1080×1920 PNG ready for Instagram stories.
        </p>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            background: 'var(--cloud-surface)',
            border: '1px solid var(--cloud-border)',
            borderRadius: 12,
            padding: 16,
            overflow: 'hidden',
          }}
        >
          {isLoading ? (
            <div
              className="cloud-text-muted"
              style={{ padding: '120px 0', fontSize: 13 }}
            >
              Loading meet history…
            </div>
          ) : (
            <div
              style={{
                width: CARD_NATIVE_WIDTH * PREVIEW_SCALE,
                height: 1920 * PREVIEW_SCALE,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  transform: `scale(${PREVIEW_SCALE})`,
                  transformOrigin: 'top left',
                  width: CARD_NATIVE_WIDTH,
                }}
              >
                <ShareProfileCard
                  ref={cardRef}
                  athlete={athlete}
                  meetResults={meetResults}
                  teamName={teamName}
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <div
            style={{
              fontSize: 13,
              color: 'rgb(248, 113, 113)',
              marginTop: 4,
            }}
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
          <Button onClick={handleDownload} disabled={downloading || isLoading}>
            {downloading ? 'Rendering…' : 'Download PNG'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
