'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toPng } from 'html-to-image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  ShareRecentPRCard,
  type ShareRecentPRDisplayOptions,
} from '@/components/share-recent-pr-card';
import apiClient from '@/lib/api';
import * as Types from '@/lib/types';

const CARD_NATIVE_WIDTH = 1080;
const PREVIEW_WIDTH = 320;
const PREVIEW_SCALE = PREVIEW_WIDTH / CARD_NATIVE_WIDTH;
const RECENT_LIMIT = 8;

interface ShareRecentPRDialogProps {
  athlete: Types.AthleteResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso ?? '';
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function liftLabel(entry: Types.MaxHistoryEntry): string {
  const raw = (entry.exercise_name || entry.lift || '').trim();
  if (!raw) return 'Lift';
  const titled = raw
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  if (entry.reps && entry.reps > 1) return `${titled} ${entry.reps}RM`;
  return titled;
}

export function ShareRecentPRDialog({
  athlete,
  open,
  onOpenChange,
}: ShareRecentPRDialogProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [options, setOptions] = useState<ShareRecentPRDisplayOptions>({
    showDate: true,
    showContext: true,
    showPrevious: true,
  });

  const brandingQuery = useQuery({
    queryKey: ['branding'],
    queryFn: () => apiClient.getBranding(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const teamName = brandingQuery.data?.team_name?.trim() || 'BeStrong';

  const historyQuery = useQuery({
    queryKey: ['max-history', athlete.id],
    queryFn: () => apiClient.getMaxHistory(athlete.id),
    enabled: open,
  });

  const recent = useMemo(() => {
    const rows = historyQuery.data ?? [];
    return [...rows]
      .sort((a, b) => (b.recorded_at ?? '').localeCompare(a.recorded_at ?? ''))
      .slice(0, RECENT_LIMIT);
  }, [historyQuery.data]);

  useEffect(() => {
    if (!open) {
      setError(null);
      return;
    }
    if (recent.length > 0 && selectedIds.size === 0) {
      setSelectedIds(new Set([recent[0].id]));
    }
  }, [open, recent, selectedIds.size]);

  useEffect(() => {
    if (!open) setSelectedIds(new Set());
  }, [open]);

  const selectedEntries = useMemo(
    () =>
      recent.filter((r) => selectedIds.has(r.id)).sort((a, b) =>
        (b.recorded_at ?? '').localeCompare(a.recorded_at ?? ''),
      ),
    [recent, selectedIds],
  );

  function toggleId(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDownload() {
    if (!cardRef.current || selectedEntries.length === 0) return;
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
      link.download = `${safeName || 'athlete'}-pr-card.png`;
      link.click();
    } catch (err) {
      console.error('PR share export failed', err);
      setError(err instanceof Error ? err.message : 'Could not export image');
    } finally {
      setDownloading(false);
    }
  }

  const isLoading = open && historyQuery.isLoading;
  const cardHeightPx = selectedEntries.length > 1 ? 1620 : 1350;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)]"
        style={{ maxWidth: 720 }}
      >
        <DialogHeader>
          <DialogTitle
            style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em' }}
          >
            Share Recent PR
          </DialogTitle>
        </DialogHeader>

        <p
          className="cloud-text-muted"
          style={{ fontSize: 13, marginTop: -8, marginBottom: 4 }}
        >
          Pick one PR for a single highlight, or several for a stacked list.
        </p>

        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <PRPickList
              recent={recent}
              isLoading={isLoading}
              selectedIds={selectedIds}
              onToggle={toggleId}
            />
            <OptionsPanel options={options} onChange={setOptions} />
          </div>

          <div
            style={{
              width: PREVIEW_WIDTH + 32,
              background: 'var(--cloud-surface)',
              border: '1px solid var(--cloud-border)',
              borderRadius: 12,
              padding: 16,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start',
              flexShrink: 0,
            }}
          >
            {selectedEntries.length === 0 ? (
              <div
                className="cloud-text-muted"
                style={{ padding: '120px 0', fontSize: 13, textAlign: 'center' }}
              >
                Select a PR to preview
              </div>
            ) : (
              <div
                style={{
                  width: PREVIEW_WIDTH,
                  height: cardHeightPx * PREVIEW_SCALE,
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
                  <ShareRecentPRCard
                    ref={cardRef}
                    athleteName={athlete.name}
                    teamName={teamName}
                    entries={selectedEntries}
                    options={options}
                  />
                </div>
              </div>
            )}
          </div>
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
          <Button
            onClick={handleDownload}
            disabled={downloading || isLoading || selectedEntries.length === 0}
          >
            {downloading ? 'Rendering…' : 'Download PNG'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PRPickList({
  recent,
  isLoading,
  selectedIds,
  onToggle,
}: {
  recent: Types.MaxHistoryEntry[];
  isLoading: boolean;
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
}) {
  if (isLoading) {
    return (
      <div className="cloud-text-muted" style={{ fontSize: 13, padding: 12 }}>
        Loading PR history…
      </div>
    );
  }
  if (recent.length === 0) {
    return (
      <div className="cloud-text-muted" style={{ fontSize: 13, padding: 12 }}>
        No recent PRs.
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        maxHeight: 280,
        overflowY: 'auto',
        paddingRight: 4,
      }}
    >
      {recent.map((entry, i) => {
        const checked = selectedIds.has(entry.id);
        return (
          <label
            key={entry.id}
            className="cloud-panel"
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              borderColor: checked
                ? 'rgba(239,68,68,0.5)'
                : 'var(--cloud-border)',
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(entry.id)}
              style={{ accentColor: '#ef4444' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="cloud-text"
                style={{ fontSize: 13, fontWeight: 500 }}
              >
                {liftLabel(entry)}
              </div>
              <div
                className="cloud-text-muted"
                style={{ fontSize: 11, marginTop: 2 }}
              >
                {formatShortDate(entry.recorded_at)}
                {i === 0 && (
                  <span
                    style={{ color: '#ef4444', marginLeft: 8, fontWeight: 600 }}
                  >
                    Latest
                  </span>
                )}
              </div>
            </div>
            <div
              className="cloud-text"
              style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}
            >
              {Math.round(entry.new_value)} lbs
            </div>
          </label>
        );
      })}
    </div>
  );
}

function OptionsPanel({
  options,
  onChange,
}: {
  options: ShareRecentPRDisplayOptions;
  onChange: (next: ShareRecentPRDisplayOptions) => void;
}) {
  function set<K extends keyof ShareRecentPRDisplayOptions>(
    key: K,
    value: ShareRecentPRDisplayOptions[K],
  ) {
    onChange({ ...options, [key]: value });
  }
  return (
    <div
      className="cloud-panel"
      style={{
        padding: 12,
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div
        className="cloud-text-muted"
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        Show on card
      </div>
      <ToggleRow
        label="Date"
        checked={options.showDate}
        onChange={(v) => set('showDate', v)}
      />
      <ToggleRow
        label="Program / source"
        checked={options.showContext}
        onChange={(v) => set('showContext', v)}
      />
      <ToggleRow
        label="Previous best"
        checked={options.showPrevious}
        onChange={(v) => set('showPrevious', v)}
      />
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 13,
        cursor: 'pointer',
      }}
    >
      <span className="cloud-text">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: '#ef4444' }}
      />
    </label>
  );
}
