'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toBlob, toPng } from 'html-to-image';
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
import {
  ShareRecentPRSticker,
  STICKER_DIMENSIONS,
  type StickerOrientation,
} from '@/components/share-pr-sticker';
import apiClient from '@/lib/api';
import * as Types from '@/lib/types';

const CARD_NATIVE_WIDTH = 1080;
const PREVIEW_WIDTH = 320;
const PREVIEW_SCALE = PREVIEW_WIDTH / CARD_NATIVE_WIDTH;
const RECENT_LIMIT = 8;

type ShareMode = 'card' | 'sticker';

interface ShareRecentPRDialogProps {
  athlete: Types.AthleteResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataSource?: {
    queryKey?: (...parts: readonly unknown[]) => readonly unknown[];
    maxHistory?: () => Promise<Types.MaxHistoryEntry[]>;
  };
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
  dataSource,
}: ShareRecentPRDialogProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<ShareMode>('card');
  const [stickerOrientation, setStickerOrientation] =
    useState<StickerOrientation>('vertical');
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
    queryKey: dataSource?.queryKey?.('max-history') ?? ['max-history', athlete.id],
    queryFn: dataSource?.maxHistory ?? (() => apiClient.getMaxHistory(athlete.id)),
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

  useEffect(() => {
    if (mode !== 'sticker') return;
    setSelectedIds((prev) => {
      if (prev.size <= 1) return prev;
      const latest = recent.find((r) => prev.has(r.id));
      if (!latest) return prev;
      return new Set([latest.id]);
    });
  }, [mode, recent]);

  const selectedEntries = useMemo(
    () =>
      recent.filter((r) => selectedIds.has(r.id)).sort((a, b) =>
        (b.recorded_at ?? '').localeCompare(a.recorded_at ?? ''),
      ),
    [recent, selectedIds],
  );

  function toggleId(id: number) {
    setSelectedIds((prev) => {
      if (mode === 'sticker') {
        return new Set([id]);
      }
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const isSticker = mode === 'sticker';
  const stickerDims = STICKER_DIMENSIONS[stickerOrientation];

  function exportOptions() {
    if (!cardRef.current) return null;
    if (isSticker) {
      return {
        cacheBust: true,
        pixelRatio: 2,
        width: stickerDims.width,
        height: stickerDims.height,
        backgroundColor: undefined,
        skipFonts: true,
      };
    }
    return {
      cacheBust: true,
      pixelRatio: 2,
      width: CARD_NATIVE_WIDTH,
      height: cardRef.current.offsetHeight,
      backgroundColor: '#050505',
      skipFonts: true,
    };
  }

  function safeFilename(suffix: string): string {
    const safeName = athlete.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${safeName || 'athlete'}-${suffix}.png`;
  }

  async function handleDownload() {
    if (!cardRef.current || selectedEntries.length === 0) return;
    setDownloading(true);
    setError(null);
    try {
      const opts = exportOptions();
      if (!opts) return;
      const dataUrl = await toPng(cardRef.current, opts);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = safeFilename(isSticker ? 'pr-sticker' : 'pr-card');
      link.click();
    } catch (err) {
      console.error('PR share export failed', err);
      setError(err instanceof Error ? err.message : 'Could not export image');
    } finally {
      setDownloading(false);
    }
  }

  async function handleCopy() {
    if (!cardRef.current || selectedEntries.length === 0) return;
    setCopying(true);
    setCopied(false);
    setError(null);
    try {
      const opts = exportOptions();
      if (!opts) return;
      const blob = await toBlob(cardRef.current, opts);
      if (!blob) {
        throw new Error('Could not render image');
      }
      if (
        typeof navigator === 'undefined' ||
        typeof navigator.clipboard === 'undefined' ||
        typeof window === 'undefined' ||
        typeof window.ClipboardItem === 'undefined'
      ) {
        throw new Error("This browser can't copy images. Use Download.");
      }
      await navigator.clipboard.write([
        new window.ClipboardItem({ 'image/png': blob }),
      ]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error('PR share copy failed', err);
      setError(err instanceof Error ? err.message : 'Could not copy image');
    } finally {
      setCopying(false);
    }
  }

  const isLoading = open && historyQuery.isLoading;
  const cardHeightPx = selectedEntries.length > 1 ? 1620 : 1350;
  const stickerEntry = selectedEntries[0];
  const previewBoxHeight = isSticker
    ? stickerDims.height * (PREVIEW_WIDTH / stickerDims.width)
    : cardHeightPx * PREVIEW_SCALE;
  const stickerPreviewScale = PREVIEW_WIDTH / stickerDims.width;

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
          Pick a PR. Card mode is full-bleed for posts; sticker is transparent
          for layering on Stories or Reels.
        </p>

        <ModeToggle mode={mode} onChange={setMode} />

        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <PRPickList
              recent={recent}
              isLoading={isLoading}
              selectedIds={selectedIds}
              onToggle={toggleId}
              singleSelect={isSticker}
            />
            {isSticker ? (
              <OrientationPanel
                orientation={stickerOrientation}
                onChange={setStickerOrientation}
                showPrevious={options.showPrevious}
                onTogglePrevious={(v) =>
                  setOptions({ ...options, showPrevious: v })
                }
              />
            ) : (
              <OptionsPanel options={options} onChange={setOptions} />
            )}
          </div>

          <div
            style={{
              width: PREVIEW_WIDTH + 32,
              background: isSticker
                ? 'repeating-conic-gradient(var(--cloud-surface) 0% 25%, var(--cloud-surface-raised) 0% 50%) 50% / 16px 16px'
                : 'var(--cloud-surface)',
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
            ) : isSticker ? (
              <div
                style={{
                  width: PREVIEW_WIDTH,
                  height: previewBoxHeight,
                  position: 'relative',
                  overflow: 'hidden',
                  alignSelf: 'center',
                }}
              >
                <div
                  style={{
                    transform: `scale(${stickerPreviewScale})`,
                    transformOrigin: 'top left',
                    width: stickerDims.width,
                  }}
                >
                  {stickerEntry && (
                    <ShareRecentPRSticker
                      ref={cardRef}
                      entry={stickerEntry}
                      orientation={stickerOrientation}
                      showPrevious={options.showPrevious}
                    />
                  )}
                </div>
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
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
          }}
        >
          {copied && (
            <span
              style={{
                fontSize: 12,
                color: 'rgb(110, 231, 183)',
                marginRight: 4,
              }}
            >
              Copied to clipboard
            </span>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={downloading || copying}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleCopy}
            disabled={
              copying ||
              downloading ||
              isLoading ||
              selectedEntries.length === 0
            }
          >
            {copying ? 'Copying…' : 'Copy'}
          </Button>
          <Button
            onClick={handleDownload}
            disabled={
              downloading ||
              copying ||
              isLoading ||
              selectedEntries.length === 0
            }
          >
            {downloading ? 'Rendering…' : 'Download PNG'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: ShareMode;
  onChange: (m: ShareMode) => void;
}) {
  return (
    <div
      className="cloud-panel"
      style={{
        display: 'inline-flex',
        gap: 4,
        padding: 4,
        borderRadius: 999,
        alignSelf: 'flex-start',
      }}
    >
      {(
        [
          ['card', 'Card'],
          ['sticker', 'Sticker'],
        ] as const
      ).map(([k, label]) => {
        const active = mode === k;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            className={active ? 'cloud-btn cloud-btn-primary' : 'cloud-btn cloud-btn-ghost'}
            style={{
              padding: '4px 14px',
              fontSize: 12,
              borderRadius: 999,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function OrientationPanel({
  orientation,
  onChange,
  showPrevious,
  onTogglePrevious,
}: {
  orientation: StickerOrientation;
  onChange: (o: StickerOrientation) => void;
  showPrevious: boolean;
  onTogglePrevious: (v: boolean) => void;
}) {
  return (
    <div
      className="cloud-panel"
      style={{
        padding: 12,
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        className="cloud-text-muted"
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
        }}
      >
        Sticker layout
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {(
          [
            ['vertical', 'Vertical'],
            ['horizontal', 'Horizontal'],
          ] as const
        ).map(([k, label]) => {
          const active = orientation === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onChange(k)}
              className={active ? 'cloud-btn cloud-btn-primary' : 'cloud-btn cloud-btn-ghost'}
              style={{ padding: '4px 12px', fontSize: 12 }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 13,
          cursor: 'pointer',
          marginTop: 4,
        }}
      >
        <span className="cloud-text">Show previous best</span>
        <input
          type="checkbox"
          checked={showPrevious}
          onChange={(e) => onTogglePrevious(e.target.checked)}
          style={{ accentColor: '#0C5CAB' }}
        />
      </label>
    </div>
  );
}

function PRPickList({
  recent,
  isLoading,
  selectedIds,
  onToggle,
  singleSelect = false,
}: {
  recent: Types.MaxHistoryEntry[];
  isLoading: boolean;
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  singleSelect?: boolean;
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
                ? 'rgba(12, 92, 171, 0.55)'
                : 'var(--cloud-border)',
            }}
          >
            <input
              type={singleSelect ? 'radio' : 'checkbox'}
              name={singleSelect ? 'pr-single-select' : undefined}
              checked={checked}
              onChange={() => onToggle(entry.id)}
              style={{ accentColor: '#0C5CAB' }}
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
                    style={{ color: '#7CB4ED', marginLeft: 8, fontWeight: 600 }}
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
