'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Smartphone, Trash2, UploadCloud } from 'lucide-react';
import { PageShell, SectionPanel } from '../_shared';

const REQUIRED_PX = 512;
const MAX_BYTES = 1_000_000;

type IconStatus = { custom: boolean };

async function fetchStatus(): Promise<IconStatus> {
  const res = await fetch('/api/install/icon-status', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

async function uploadIcon(file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/install/icon', {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!res.ok) {
    let message = `Upload failed (${res.status})`;
    try {
      const data = (await res.json()) as { detail?: string };
      if (data.detail) message = data.detail;
    } catch {
      
    }
    throw new Error(message);
  }
}

async function clearIcon(): Promise<void> {
  const res = await fetch('/api/install/icon', {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`clear failed (${res.status})`);
}

export default function InstallConfigurationPage() {
  const [status, setStatus] = useState<IconStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewBust, setPreviewBust] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchStatus()
      .then(setStatus)
      .catch(() => setStatus({ custom: false }));
  }, []);

  const onPick = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      await uploadIcon(file);
      setStatus({ custom: true });
      setPreviewBust(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const onClear = async () => {
    setError(null);
    setBusy(true);
    try {
      await clearIcon();
      setStatus({ custom: false });
      setPreviewBust(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear icon');
    } finally {
      setBusy(false);
    }
  };

  const previewSrc = status?.custom
    ? `/icon-512.png?v=${previewBust}`
    : '/icon.svg';

  return (
    <PageShell
      title="Install app"
      subtitle="Set the icon shown when coaches and athletes install this workspace as a PWA."
      right={
        <Link
          href="/configuration"
          className="cloud-text-hover"
          style={{
            fontSize: 13,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <ArrowLeft style={{ width: 14, height: 14 }} />
          Configuration
        </Link>
      }
    >
      <SectionPanel
        title="App icon"
        icon={<Smartphone style={{ width: 16, height: 16 }} />}
      >
        <div
          style={{
            display: 'flex',
            gap: 24,
            alignItems: 'flex-start',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              width: 128,
              height: 128,
              borderRadius: 16,
              border: '1px solid var(--cloud-border)',
              backgroundColor: 'var(--cloud-surface-raised)',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewSrc}
              alt="App icon preview"
              width={128}
              height={128}
              style={{ display: 'block', width: '100%', height: '100%' }}
            />
          </div>

          <div style={{ flex: 1, minWidth: 240 }}>
            <p
              className="cloud-text-muted"
              style={{ fontSize: 13, lineHeight: 1.6 }}
            >
              Upload a {REQUIRED_PX}×{REQUIRED_PX} PNG. The same file is served
              at every manifest size; the browser scales it down. Keep the
              subject centered with a little padding so it survives iOS&apos;s
              rounded-square mask.
            </p>

            <div
              style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}
            >
              <input
                ref={fileInput}
                type="file"
                accept="image/png"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPick(f);
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px',
                  borderRadius: 8,
                  border:
                    '1px solid var(--cloud-border-strong, rgba(255,255,255,0.12))',
                  backgroundColor: 'var(--cloud-surface-raised)',
                  color: 'var(--cloud-text)',
                  fontSize: 13,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.6 : 1,
                }}
              >
                <UploadCloud style={{ width: 14, height: 14 }} />
                {status?.custom ? 'Replace icon' : 'Upload icon'}
              </button>

              {status?.custom ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onClear}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--cloud-border)',
                    backgroundColor: 'transparent',
                    color: 'var(--cloud-text-muted)',
                    fontSize: 13,
                    cursor: busy ? 'not-allowed' : 'pointer',
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  <Trash2 style={{ width: 14, height: 14 }} />
                  Use default
                </button>
              ) : null}
            </div>

            {error ? (
              <p
                style={{
                  marginTop: 12,
                  fontSize: 12,
                  color: '#fca5a5',
                  lineHeight: 1.5,
                }}
              >
                {error}
              </p>
            ) : null}

            <p
              className="cloud-text-muted"
              style={{ fontSize: 11, marginTop: 16, lineHeight: 1.5 }}
            >
              Max {Math.round(MAX_BYTES / 1000)} KB. Coaches who already
              installed the app will see the new icon after the manifest
              re-fetches (usually within a few minutes, or after relaunch).
            </p>
          </div>
        </div>
      </SectionPanel>
    </PageShell>
  );
}
