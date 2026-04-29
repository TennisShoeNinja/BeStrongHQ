'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import apiClient from '@/lib/api';
import { useAuth } from '@/lib/auth-provider';
import { FIELD_LABEL, PageShell, SectionPanel } from '../_shared';

type Unit = 'lbs' | 'kg';

function ToggleRow({
  title,
  description,
  enabled,
  onChange,
  disabled = false,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex items-start justify-between"
      style={{ gap: 16, padding: '14px 0' }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="cloud-text" style={{ fontSize: 13, fontWeight: 500 }}>
          {title}
        </p>
        <p
          className="cloud-text-muted"
          style={{ fontSize: 11, marginTop: 4, lineHeight: 1.55 }}
        >
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={disabled}
        onClick={() => onChange(!enabled)}
        style={{
          flexShrink: 0,
          width: 38,
          height: 22,
          borderRadius: 11,
          padding: 2,
          border: '1px solid var(--cloud-border)',
          backgroundColor: enabled
            ? 'var(--cloud-primary)'
            : 'var(--cloud-surface-raised)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          transition: 'background-color 150ms ease',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            display: 'block',
            width: 16,
            height: 16,
            borderRadius: '50%',
            backgroundColor: '#fff',
            transform: enabled ? 'translateX(16px)' : 'translateX(0)',
            transition: 'transform 150ms ease',
          }}
        />
      </button>
    </div>
  );
}

export default function FeaturesConfigurationPage() {
  const queryClient = useQueryClient();
  const { tenantSettings, refresh: refreshAuth } = useAuth();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });

  const defaultUnitMutation = useMutation({
    mutationFn: (unit: Unit) =>
      apiClient.updateSettings({ default_unit: unit }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const tracksRpeMutation = useMutation({
    mutationFn: (next: boolean) =>
      apiClient.updateSettings({ tracks_rpe: next ? 'true' : 'false' }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      
      
      
      await refreshAuth();
    },
  });

  
  
  
  const defaultUnit: Unit =
    defaultUnitMutation.variables ??
    (settings?.['default_unit'] === 'kg' ? 'kg' : 'lbs');
  const tracksRpe =
    tracksRpeMutation.variables ?? tenantSettings.tracks_rpe;

  return (
    <PageShell
      title="Features"
      subtitle="Behavior toggles for this workspace"
    >
      <Link
        href="/configuration"
        className="cloud-text-muted flex items-center"
        style={{ fontSize: 12, gap: 6, textDecoration: 'none' }}
      >
        <ArrowLeft style={{ width: 12, height: 12 }} />
        Back to Configuration
      </Link>

      {isLoading ? (
        <div
          className="flex items-center justify-center cloud-text-muted"
          style={{ padding: '60px 0', gap: 8, fontSize: 13 }}
        >
          <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} />
          Loading features…
        </div>
      ) : (
        <>
          <SectionPanel title="Units">
            <label
              className="cloud-text"
              style={{ ...FIELD_LABEL, marginBottom: 10 }}
            >
              Default weight unit
            </label>
            <div
              style={{
                display: 'inline-flex',
                padding: 3,
                borderRadius: 8,
                backgroundColor: 'var(--cloud-surface-raised)',
                border: '1px solid var(--cloud-border)',
                gap: 2,
              }}
            >
              {(['lbs', 'kg'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => defaultUnitMutation.mutate(u)}
                  disabled={defaultUnitMutation.isPending}
                  style={{
                    padding: '6px 16px',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                    color:
                      defaultUnit === u
                        ? 'var(--cloud-text)'
                        : 'var(--cloud-text-muted)',
                    backgroundColor:
                      defaultUnit === u
                        ? 'var(--cloud-primary)'
                        : 'transparent',
                    border: 'none',
                  }}
                >
                  {u === 'lbs' ? 'Pounds (lbs)' : 'Kilograms (kg)'}
                </button>
              ))}
            </div>
            <p
              className="cloud-text-muted"
              style={{ fontSize: 11, marginTop: 10, lineHeight: 1.55 }}
            >
              Used everywhere weights are displayed. Individual athletes&rsquo;
              profiles can override this with the toggle at the top of the
              page.
            </p>
          </SectionPanel>

          <SectionPanel title="Tracking">
            <ToggleRow
              title="Track RPE"
              description="Turn off if your athletes don't log RPE alongside actual weight. Hides RPE columns, charts, and compliance tracking. Estimated 1RM falls back to the Epley formula."
              enabled={tracksRpe}
              onChange={(next) => tracksRpeMutation.mutate(next)}
              disabled={tracksRpeMutation.isPending}
            />
          </SectionPanel>
        </>
      )}
    </PageShell>
  );
}
