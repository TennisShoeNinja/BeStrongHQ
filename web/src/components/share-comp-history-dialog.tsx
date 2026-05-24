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
  ShareCompHistoryCard,
  buildMeetSummaries,
  hideNegativeDeltas,
  type MeetSummary,
} from '@/components/share-comp-history-card';
import {
  ShareMeetRecapCard,
  RECAP_DIMENSIONS,
  type RecapMode,
  type RecapOrientation,
} from '@/components/share-meet-recap-card';
import apiClient from '@/lib/api';
import * as Types from '@/lib/types';

const TABLE_PREVIEW_WIDTH = 360;
const TABLE_NATIVE_WIDTH = 1080;
const TABLE_PREVIEW_SCALE = TABLE_PREVIEW_WIDTH / TABLE_NATIVE_WIDTH;
const RECAP_PREVIEW_WIDTH = 360;
const SELECTION_CAP = 10;
const DEFAULT_INITIAL_SELECTION = 8;

interface ShareCompHistoryDialogProps {
  athlete: Types.AthleteResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataSource?: {
    queryKey?: (...parts: readonly unknown[]) => readonly unknown[];
    meetResults?: () => Promise<Types.MeetResultEntry[]>;
  };
}

function shortDate(date: string | null): string {
  if (!date) return '';
  const parts = date.split('-');
  if (parts.length !== 3) return date;
  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d) return date;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ShareCompHistoryDialog({
  athlete,
  open,
  onOpenChange,
  dataSource,
}: ShareCompHistoryDialogProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hideDrops, setHideDrops] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  // Single-meet recap controls.
  const [recapMode, setRecapMode] = useState<RecapMode>('card');
  const [recapOrientation, setRecapOrientation] =
    useState<RecapOrientation>('vertical');

  const brandingQuery = useQuery({
    queryKey: ['branding'],
    queryFn: () => apiClient.getBranding(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const teamName = brandingQuery.data?.team_name?.trim() || 'BeStrong';

  const meetResultsQuery = useQuery({
    queryKey: dataSource?.queryKey?.('meet-results') ?? ['meet-results', athlete.id],
    queryFn: dataSource?.meetResults ?? (() => apiClient.listMeetResults(athlete.id)),
    enabled: open,
  });

  const allMeets = useMemo<MeetSummary[]>(() => {
    return buildMeetSummaries(meetResultsQuery.data ?? []);
  }, [meetResultsQuery.data]);

  // Default selection: most recent N meets up to the cap.
  useEffect(() => {
    if (!open) return;
    if (initialized) return;
    if (allMeets.length === 0) return;
    const initial = allMeets
      .slice(0, Math.min(allMeets.length, DEFAULT_INITIAL_SELECTION))
      .map((m) => m.meet_key);
    setSelectedKeys(new Set(initial));
    setInitialized(true);
  }, [allMeets, initialized, open]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setCopied(false);
      setInitialized(false);
      setSelectedKeys(new Set());
      setRecapMode('card');
      setRecapOrientation('vertical');
    }
  }, [open]);

  const renderedMeets = useMemo(() => {
    const picked = allMeets.filter((m) => selectedKeys.has(m.meet_key));
    return hideDrops ? hideNegativeDeltas(picked) : picked;
  }, [allMeets, selectedKeys, hideDrops]);

  const isSingle = renderedMeets.length === 1;
  const isSticker = isSingle && recapMode === 'sticker';

  function toggleKey(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (next.size >= SELECTION_CAP) return prev;
        next.add(key);
      }
      return next;
    });
  }

  function exportOptions() {
    if (!cardRef.current) return null;
    if (isSticker) {
      const dims = RECAP_DIMENSIONS.sticker[recapOrientation];
      return {
        cacheBust: true,
        pixelRatio: 2,
        width: dims.width,
        height: dims.height,
        backgroundColor: undefined,
        skipFonts: true,
      };
    }
    const width = isSingle
      ? RECAP_DIMENSIONS.card.width
      : TABLE_NATIVE_WIDTH;
    return {
      cacheBust: true,
      pixelRatio: 2,
      width,
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
    if (!cardRef.current || renderedMeets.length === 0) return;
    setDownloading(true);
    setError(null);
    try {
      const opts = exportOptions();
      if (!opts) return;
      const dataUrl = await toPng(cardRef.current, opts);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = safeFilename(
        isSticker
          ? 'meet-recap-sticker'
          : isSingle
            ? 'meet-recap'
            : 'comp-history',
      );
      link.click();
    } catch (err) {
      console.error('Comp history export failed', err);
      setError(err instanceof Error ? err.message : 'Could not export image');
    } finally {
      setDownloading(false);
    }
  }

  async function handleCopy() {
    if (!cardRef.current || renderedMeets.length === 0) return;
    setCopying(true);
    setCopied(false);
    setError(null);
    try {
      const opts = exportOptions();
      if (!opts) return;
      const blob = await toBlob(cardRef.current, opts);
      if (!blob) throw new Error('Could not render image');
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
      console.error('Comp history copy failed', err);
      setError(err instanceof Error ? err.message : 'Could not copy image');
    } finally {
      setCopying(false);
    }
  }

  const isLoading = open && meetResultsQuery.isLoading;
  const cap = SELECTION_CAP;
  const atCap = selectedKeys.size >= cap;

  // Preview sizing.
  const previewWidth = isSingle ? RECAP_PREVIEW_WIDTH : TABLE_PREVIEW_WIDTH;
  const previewScale = isSticker
    ? previewWidth / RECAP_DIMENSIONS.sticker[recapOrientation].width
    : isSingle
      ? previewWidth / RECAP_DIMENSIONS.card.width
      : TABLE_PREVIEW_SCALE;
  const previewHeight = isSticker
    ? RECAP_DIMENSIONS.sticker[recapOrientation].height * previewScale
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)]"
        style={{ maxWidth: 760 }}
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
          Pick up to {cap} meets. Selecting one meet swaps to a meet recap
          card you can render as a transparent sticker for Stories or Reels.
        </p>

        <div style={{ display: 'flex', gap: 16 }}>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <MeetCheckList
              meets={allMeets}
              isLoading={isLoading}
              selectedKeys={selectedKeys}
              onToggle={toggleKey}
              atCap={atCap}
            />

            <ToggleRow
              label="Hide drops (negative totals vs prior meet)"
              checked={hideDrops}
              onChange={setHideDrops}
            />

            {isSingle && (
              <RecapModePanel
                mode={recapMode}
                onModeChange={setRecapMode}
                orientation={recapOrientation}
                onOrientationChange={setRecapOrientation}
              />
            )}
          </div>

          <div
            style={{
              width: previewWidth + 32,
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
              maxHeight: 560,
              overflow: 'auto',
            }}
          >
            {renderedMeets.length === 0 ? (
              <div
                className="cloud-text-muted"
                style={{
                  padding: '60px 0',
                  fontSize: 13,
                  textAlign: 'center',
                }}
              >
                {allMeets.length === 0 && !isLoading
                  ? 'No meets found for this athlete yet.'
                  : 'Select at least one meet to preview.'}
              </div>
            ) : isSingle ? (
              <div
                style={{
                  width: previewWidth,
                  height: previewHeight ?? undefined,
                  position: 'relative',
                  overflow: 'hidden',
                  alignSelf: isSticker ? 'center' : 'flex-start',
                }}
              >
                <div
                  style={{
                    transform: `scale(${previewScale})`,
                    transformOrigin: 'top left',
                    width: isSticker
                      ? RECAP_DIMENSIONS.sticker[recapOrientation].width
                      : RECAP_DIMENSIONS.card.width,
                  }}
                >
                  <ShareMeetRecapCard
                    ref={cardRef}
                    meet={renderedMeets[0]}
                    athleteName={athlete.name}
                    teamName={teamName}
                    mode={recapMode}
                    orientation={recapOrientation}
                  />
                </div>
              </div>
            ) : (
              <div style={{ width: previewWidth, position: 'relative' }}>
                <div
                  style={{
                    transform: `scale(${TABLE_PREVIEW_SCALE})`,
                    transformOrigin: 'top left',
                    width: TABLE_NATIVE_WIDTH,
                  }}
                >
                  <ShareCompHistoryCard
                    ref={cardRef}
                    athleteName={athlete.name}
                    teamName={teamName}
                    meets={renderedMeets}
                  />
                </div>
              </div>
            )}
          </div>
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
              renderedMeets.length === 0
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
              renderedMeets.length === 0
            }
          >
            {downloading ? 'Rendering…' : 'Download PNG'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MeetCheckList({
  meets,
  isLoading,
  selectedKeys,
  onToggle,
  atCap,
}: {
  meets: MeetSummary[];
  isLoading: boolean;
  selectedKeys: Set<string>;
  onToggle: (key: string) => void;
  atCap: boolean;
}) {
  if (isLoading) {
    return (
      <div className="cloud-text-muted" style={{ fontSize: 13, padding: 12 }}>
        Loading meet history…
      </div>
    );
  }
  if (meets.length === 0) {
    return (
      <div className="cloud-text-muted" style={{ fontSize: 13, padding: 12 }}>
        No meets yet.
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        maxHeight: 260,
        overflowY: 'auto',
        paddingRight: 4,
      }}
    >
      {meets.map((m) => {
        const checked = selectedKeys.has(m.meet_key);
        const disabled = !checked && atCap;
        return (
          <label
            key={m.meet_key}
            className="cloud-panel"
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
              borderColor: checked
                ? 'rgba(12, 92, 171, 0.55)'
                : 'var(--cloud-border)',
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => onToggle(m.meet_key)}
              style={{ accentColor: '#0C5CAB' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
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
                {m.meet_name ?? 'Untitled meet'}
              </div>
              <div
                className="cloud-text-muted"
                style={{ fontSize: 11, marginTop: 2 }}
              >
                {shortDate(m.meet_date)}
                {m.federation && (
                  <span style={{ marginLeft: 8 }}>{m.federation}</span>
                )}
                {m.weight_class && (
                  <span style={{ marginLeft: 6 }}>· {m.weight_class}</span>
                )}
              </div>
            </div>
            <div
              className="cloud-text"
              style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}
            >
              {Math.round(m.total_lbs)} lbs
            </div>
          </label>
        );
      })}
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
      className="cloud-panel"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        borderRadius: 10,
        fontSize: 13,
        cursor: 'pointer',
      }}
    >
      <span className="cloud-text">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: '#0C5CAB' }}
      />
    </label>
  );
}

function RecapModePanel({
  mode,
  onModeChange,
  orientation,
  onOrientationChange,
}: {
  mode: RecapMode;
  onModeChange: (m: RecapMode) => void;
  orientation: RecapOrientation;
  onOrientationChange: (o: RecapOrientation) => void;
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
        Meet recap layout
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
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
              onClick={() => onModeChange(k)}
              className={
                active ? 'cloud-btn cloud-btn-primary' : 'cloud-btn cloud-btn-ghost'
              }
              style={{ padding: '4px 12px', fontSize: 12 }}
            >
              {label}
            </button>
          );
        })}
      </div>
      {mode === 'sticker' && (
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
                onClick={() => onOrientationChange(k)}
                className={
                  active ? 'cloud-btn cloud-btn-primary' : 'cloud-btn cloud-btn-ghost'
                }
                style={{ padding: '4px 12px', fontSize: 12 }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
