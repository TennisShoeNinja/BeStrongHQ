'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  AlertCircle,
  Loader2,
  FileText,
  Settings2,
  Play,
  ChevronDown,
} from 'lucide-react';
import apiClient from '@/lib/api';

type PreviewResult = Awaited<ReturnType<typeof apiClient.previewNamingPattern>>;

const MICRO_LABEL: CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontWeight: 500,
};

const INPUT_STYLE: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 13,
  borderRadius: 8,
  backgroundColor: 'var(--cloud-surface-raised)',
  border: '1px solid var(--cloud-border)',
  color: 'var(--cloud-text)',
  outline: 'none',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

export default function NamingPattern() {
  const queryClient = useQueryClient();
  const [editPattern, setEditPattern] = useState('');
  const [testFilename, setTestFilename] = useState('');
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: patternData, isLoading } = useQuery({
    queryKey: ['naming-pattern'],
    queryFn: () => apiClient.getNamingPattern(),
  });

  
  useEffect(() => {
    if (patternData && !editPattern) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditPattern(patternData.current);
    }
  }, [patternData, editPattern]);

  const saveMutation = useMutation({
    mutationFn: (pattern: string) => apiClient.setNamingPattern(pattern),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['naming-pattern'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const previewMutation = useMutation({
    mutationFn: ({ template, filenames }: { template: string; filenames: string[] }) =>
      apiClient.previewNamingPattern(template, filenames),
    onSuccess: (data) => setPreviewResult(data),
  });

  const handleTest = () => {
    if (!testFilename.trim() || !editPattern.trim()) return;
    const filenames = testFilename.split('\n').map((f) => f.trim()).filter(Boolean);
    previewMutation.mutate({ template: editPattern, filenames });
  };

  const handleSelectPreset = (pattern: string) => {
    setEditPattern(pattern);
    setShowPresets(false);
    setPreviewResult(null);
  };

  const isModified = patternData && editPattern !== patternData.current;

  if (isLoading) {
    return (
      <div className="cloud-panel" style={{ padding: 24 }}>
        <div
          className="flex items-center cloud-text-muted"
          style={{ gap: 8, fontSize: 13 }}
        >
          <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
          Loading pattern settings…
        </div>
      </div>
    );
  }

  return (
    <div className="cloud-panel" style={{ padding: 24 }}>
      {}
      <div className="flex items-center" style={{ gap: 10, marginBottom: 6 }}>
        <Settings2
          style={{ width: 18, height: 18, color: '#fb923c', strokeWidth: 1.8 }}
        />
        <h3
          className="cloud-text"
          style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}
        >
          Naming pattern
        </h3>
      </div>
      <p
        className="cloud-text-muted"
        style={{ fontSize: 13, marginBottom: 18, lineHeight: 1.55 }}
      >
        Define how your program sheets are named so the app can extract athlete names,
        program numbers, and dates from filenames.
      </p>

      {}
      <div
        style={{
          marginBottom: 18,
          padding: 12,
          borderRadius: 8,
          backgroundColor: 'var(--cloud-surface-raised)',
          border: '1px solid var(--cloud-border)',
          fontSize: 12,
        }}
      >
        <p
          className="cloud-text"
          style={{ ...MICRO_LABEL, marginBottom: 8 }}
        >
          Available tokens
        </p>
        <div
          className="grid grid-cols-2 cloud-text-muted"
          style={{ columnGap: 16, rowGap: 4, fontSize: 12 }}
        >
          <span>
            <code style={{ color: '#fb923c' }}>{'{athlete}'}</code> Athlete name
          </span>
          <span>
            <code style={{ color: '#fb923c' }}>{'{number}'}</code> Program number
          </span>
          <span>
            <code style={{ color: '#fb923c' }}>{'{dates}'}</code> Date range
          </span>
          <span>
            <code style={{ color: '#fb923c' }}>{'{theme}'}</code> Program theme
          </span>
          <span>
            <code style={{ color: '#fb923c' }}>{'{any}'}</code> Wildcard (ignored)
          </span>
        </div>
      </div>

      {}
      <div style={{ marginBottom: 16 }}>
        <div
          className="flex items-center justify-between"
          style={{ marginBottom: 8 }}
        >
          <label
            className="cloud-text-muted"
            style={MICRO_LABEL}
          >
            Pattern template
          </label>
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="flex items-center"
            style={{
              fontSize: 11,
              color: '#fb923c',
              gap: 4,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Presets
            <ChevronDown
              style={{
                width: 12,
                height: 12,
                transition: 'transform 0.15s ease',
                transform: showPresets ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            />
          </button>
        </div>

        {}
        {showPresets && patternData && (
          <div
            style={{
              marginBottom: 12,
              borderRadius: 8,
              overflow: 'hidden',
              border: '1px solid var(--cloud-border)',
            }}
          >
            {patternData.presets.map((preset, i) => (
              <button
                key={preset.id}
                onClick={() => handleSelectPreset(preset.pattern)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 14px',
                  textAlign: 'left',
                  fontSize: 13,
                  backgroundColor: 'var(--cloud-surface-raised)',
                  borderBottom:
                    i < patternData.presets.length - 1
                      ? '1px solid var(--cloud-border)'
                      : 'none',
                  border: 'none',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  color: 'var(--cloud-text)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 500, marginBottom: 2 }}>
                  {preset.label}
                </div>
                <div
                  className="cloud-text-muted"
                  style={{
                    fontSize: 11,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  }}
                >
                  {preset.example}
                </div>
              </button>
            ))}
          </div>
        )}

        <input
          type="text"
          value={editPattern}
          onChange={(e) => {
            setEditPattern(e.target.value);
            setPreviewResult(null);
          }}
          style={INPUT_STYLE}
          placeholder="{athlete}'s Program {number} - ({dates}) - {theme}"
        />
      </div>

      {}
      <div style={{ marginBottom: 16 }}>
        <label
          className="cloud-text-muted"
          style={{ ...MICRO_LABEL, display: 'block', marginBottom: 8 }}
        >
          Test with a filename
        </label>
        <div className="flex" style={{ gap: 8 }}>
          <input
            type="text"
            value={testFilename}
            onChange={(e) => setTestFilename(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTest()}
            style={{ ...INPUT_STYLE, flex: 1, fontFamily: 'inherit' }}
            placeholder="e.g., Ed's Program 35 - (02/01/26 - 02/22/26) - Strength Block"
          />
          <button
            onClick={handleTest}
            disabled={
              !testFilename.trim() ||
              !editPattern.trim() ||
              previewMutation.isPending
            }
            className="cloud-btn cloud-btn-ghost cloud-btn-sm"
            style={{ padding: '0 12px', flexShrink: 0 }}
          >
            {previewMutation.isPending ? (
              <Loader2
                className="animate-spin"
                style={{ width: 14, height: 14 }}
              />
            ) : (
              <Play style={{ width: 14, height: 14 }} />
            )}
          </button>
        </div>
      </div>

      {}
      {previewResult && (
        <div
          style={{
            marginBottom: 16,
            borderRadius: 8,
            overflow: 'hidden',
            border: '1px solid var(--cloud-border)',
          }}
        >
          {previewResult.matched.map((m, i) => (
            <div
              key={i}
              style={{
                padding: '10px 14px',
                backgroundColor: 'rgba(34, 197, 94, 0.05)',
                borderBottom:
                  i < previewResult.matched.length - 1 ||
                  previewResult.unmatched.length > 0
                    ? '1px solid var(--cloud-border)'
                    : 'none',
                fontSize: 13,
              }}
            >
              <div
                className="flex items-center"
                style={{ gap: 8, marginBottom: 4 }}
              >
                <Check
                  style={{ width: 14, height: 14, color: '#4ade80', flexShrink: 0 }}
                />
                <span
                  className="cloud-text"
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 11,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.filename}
                </span>
              </div>
              <div
                className="flex flex-wrap"
                style={{ gap: 12, marginLeft: 22, fontSize: 11 }}
              >
                {m.athlete && (
                  <span>
                    <span className="cloud-text-muted">Athlete: </span>
                    <span style={{ color: '#fb923c', fontWeight: 500 }}>
                      {m.athlete}
                    </span>
                  </span>
                )}
                {m.number != null && (
                  <span>
                    <span className="cloud-text-muted">Program: </span>
                    <span style={{ color: '#67e8f9' }}>#{m.number}</span>
                  </span>
                )}
                {m.dates && (
                  <span>
                    <span className="cloud-text-muted">Dates: </span>
                    <span className="cloud-text">{m.dates}</span>
                  </span>
                )}
                {m.theme && (
                  <span>
                    <span className="cloud-text-muted">Theme: </span>
                    <span className="cloud-text">{m.theme}</span>
                  </span>
                )}
              </div>
            </div>
          ))}
          {previewResult.unmatched.map((u, i) => (
            <div
              key={`u-${i}`}
              style={{
                padding: '10px 14px',
                backgroundColor: 'rgba(239, 68, 68, 0.06)',
                borderBottom:
                  i < previewResult.unmatched.length - 1
                    ? '1px solid var(--cloud-border)'
                    : 'none',
                fontSize: 13,
              }}
            >
              <div className="flex items-center" style={{ gap: 8 }}>
                <AlertCircle
                  style={{ width: 14, height: 14, color: '#fca5a5', flexShrink: 0 }}
                />
                <span
                  className="cloud-text-muted"
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 11,
                  }}
                >
                  {u.filename}
                </span>
                <span style={{ color: '#fca5a5', fontSize: 11 }}>No match</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {}
      {saveMutation.isError && (
        <p style={{ color: '#fca5a5', fontSize: 13, marginBottom: 12 }}>
          {(saveMutation.error as Error)?.message || 'Invalid pattern'}
        </p>
      )}
      {previewMutation.isError && (
        <p style={{ color: '#fca5a5', fontSize: 13, marginBottom: 12 }}>
          {(previewMutation.error as Error)?.message || 'Invalid pattern'}
        </p>
      )}

      {}
      <div className="flex items-center" style={{ gap: 12 }}>
        <button
          onClick={() => saveMutation.mutate(editPattern)}
          disabled={!isModified || saveMutation.isPending || !editPattern.trim()}
          className="cloud-btn cloud-btn-primary"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2
                className="animate-spin"
                style={{ width: 14, height: 14, marginRight: 8 }}
              />
              Saving…
            </>
          ) : (
            <>
              <FileText style={{ width: 14, height: 14, marginRight: 8 }} />
              Save pattern
            </>
          )}
        </button>
        {saved && (
          <span
            className="flex items-center"
            style={{ color: '#4ade80', fontSize: 13, gap: 4 }}
          >
            <Check style={{ width: 14, height: 14 }} /> Saved
          </span>
        )}
        {isModified && !saved && (
          <span className="cloud-text-muted" style={{ fontSize: 11 }}>
            Unsaved changes
          </span>
        )}
      </div>
    </div>
  );
}
