'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  Check,
  Database,
  Loader2,
  Save,
  X,
} from 'lucide-react';
import Link from 'next/link';
import apiClient from '@/lib/api';
import { useAuth } from '@/lib/auth-provider';
import { DISPLAY_VERSION } from '@/lib/version';
import {
  FIELD_LABEL,
  INPUT_STYLE,
  MICRO_LABEL,
  PageShell,
  SectionPanel,
} from '../_shared';

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

export default function SystemConfigurationPage() {
  const queryClient = useQueryClient();
  const { deploymentMode, tenant } = useAuth();
  const [apiBaseUrlDraft, setApiBaseUrlDraft] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });

  const apiBaseUrl =
    apiBaseUrlDraft ?? settings?.['api_base_url'] ?? 'http://localhost:8080';
  const dirty = apiBaseUrlDraft !== null;

  const saveMutation = useMutation({
    mutationFn: (updated: Record<string, string | null>) =>
      apiClient.updateSettings(updated),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setApiBaseUrlDraft(null);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const client = (
        apiClient as unknown as {
          client?: { defaults?: { baseURL?: string } };
        }
      ).client;
      const originalUrl = client?.defaults?.baseURL;
      apiClient.setBaseURL(apiBaseUrl + '/api');

      try {
        setConnectionStatus('testing');
        setConnectionError(null);
        const result = await apiClient.health();
        setConnectionStatus('success');
        return result;
      } finally {
        if (originalUrl) {
          apiClient.setBaseURL(originalUrl);
        }
      }
    },
    onSuccess: () => {
      setConnectionStatus('success');
    },
    onError: (err: unknown) => {
      setConnectionStatus('error');
      const message =
        err instanceof Error ? err.message : 'Failed to connect to API';
      setConnectionError(message);
    },
  });

  const saveButton = (
    <button
      onClick={() => saveMutation.mutate({ api_base_url: apiBaseUrl })}
      disabled={!dirty || saveMutation.isPending}
      className={`cloud-btn ${saveSuccess ? '' : 'cloud-btn-primary'}`}
      style={
        saveSuccess
          ? {
              backgroundColor: 'rgba(34, 197, 94, 0.16)',
              color: '#86efac',
              border: '1px solid rgba(34, 197, 94, 0.4)',
            }
          : undefined
      }
    >
      {saveMutation.isPending ? (
        <>
          <Loader2
            className="animate-spin"
            style={{ width: 14, height: 14, marginRight: 8 }}
          />
          Saving…
        </>
      ) : saveSuccess ? (
        <>
          <Check style={{ width: 14, height: 14, marginRight: 8 }} />
          Saved
        </>
      ) : (
        <>
          <Save style={{ width: 14, height: 14, marginRight: 8 }} />
          Save changes
        </>
      )}
    </button>
  );

  return (
    <PageShell
      title="System"
      subtitle="API connection, workspace details, and version"
      right={saveButton}
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
          Loading system info…
        </div>
      ) : (
        <>
          <SectionPanel title="API connection">
            <div className="flex flex-col" style={{ gap: 16 }}>
              <div>
                <label className="cloud-text" style={FIELD_LABEL}>
                  API base URL
                </label>
                <input
                  type="text"
                  value={apiBaseUrl}
                  onChange={(e) => {
                    setApiBaseUrlDraft(e.target.value);
                  }}
                  placeholder="http://localhost:8080"
                  style={{
                    ...INPUT_STYLE,
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, monospace',
                  }}
                />
                <p
                  className="cloud-text-muted"
                  style={{ fontSize: 11, marginTop: 6, lineHeight: 1.55 }}
                >
                  The URL where the FastAPI backend is running
                </p>
              </div>

              <div className="flex items-center" style={{ gap: 12 }}>
                <button
                  onClick={() => testConnectionMutation.mutate()}
                  disabled={testConnectionMutation.isPending}
                  className="cloud-btn"
                  style={
                    connectionStatus === 'success'
                      ? {
                          backgroundColor: 'rgba(34, 197, 94, 0.16)',
                          color: '#86efac',
                          border: '1px solid rgba(34, 197, 94, 0.4)',
                        }
                      : connectionStatus === 'error'
                      ? {
                          backgroundColor: 'rgba(239, 68, 68, 0.16)',
                          color: '#fca5a5',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                        }
                      : {
                          backgroundColor: 'var(--cloud-primary)',
                          color: '#fff',
                          border: '1px solid var(--cloud-primary)',
                        }
                  }
                >
                  {testConnectionMutation.isPending ? (
                    <>
                      <Loader2
                        className="animate-spin"
                        style={{ width: 14, height: 14, marginRight: 8 }}
                      />
                      Testing…
                    </>
                  ) : connectionStatus === 'success' ? (
                    <>
                      <Check
                        style={{ width: 14, height: 14, marginRight: 8 }}
                      />
                      Connected
                    </>
                  ) : connectionStatus === 'error' ? (
                    <>
                      <X style={{ width: 14, height: 14, marginRight: 8 }} />
                      Connection failed
                    </>
                  ) : (
                    'Test connection'
                  )}
                </button>

                {connectionStatus === 'success' && (
                  <div
                    className="flex items-center"
                    style={{ gap: 6, color: '#4ade80', fontSize: 13 }}
                  >
                    <Check style={{ width: 14, height: 14 }} />
                    API is reachable
                  </div>
                )}

                {connectionStatus === 'error' && connectionError && (
                  <div
                    className="flex items-center"
                    style={{ gap: 6, color: '#fca5a5', fontSize: 13 }}
                  >
                    <X style={{ width: 14, height: 14 }} />
                    {connectionError}
                  </div>
                )}
              </div>
            </div>
          </SectionPanel>

          {deploymentMode === 'cloud' ? (
            <SectionPanel
              title="Workspace"
              icon={
                <Building2
                  style={{ width: 16, height: 16, color: '#67e8f9' }}
                />
              }
            >
              {tenant ? (
                <div className="flex flex-col" style={{ gap: 0 }}>
                  <div
                    className="flex items-baseline justify-between"
                    style={{
                      gap: 16,
                      padding: '10px 0',
                      borderBottom: '1px solid var(--cloud-border)',
                    }}
                  >
                    <span className="cloud-text-muted" style={MICRO_LABEL}>
                      Organization
                    </span>
                    <span
                      className="cloud-text"
                      style={{ fontSize: 13, textAlign: 'right' }}
                    >
                      {tenant.org_name}
                    </span>
                  </div>
                  <div
                    className="flex items-baseline justify-between"
                    style={{
                      gap: 16,
                      padding: '10px 0',
                      borderBottom: '1px solid var(--cloud-border)',
                    }}
                  >
                    <span className="cloud-text-muted" style={MICRO_LABEL}>
                      Subdomain
                    </span>
                    <span
                      className="cloud-text"
                      style={{
                        fontSize: 13,
                        textAlign: 'right',
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, monospace',
                      }}
                    >
                      {tenant.subdomain}
                    </span>
                  </div>
                  <div
                    className="flex items-baseline justify-between"
                    style={{ gap: 16, padding: '10px 0' }}
                  >
                    <span className="cloud-text-muted" style={MICRO_LABEL}>
                      Parser
                    </span>
                    <span
                      className="cloud-text"
                      style={{
                        fontSize: 13,
                        textAlign: 'right',
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, monospace',
                      }}
                    >
                      {tenant.parser_id}
                    </span>
                  </div>
                  <p
                    className="cloud-text-muted"
                    style={{ fontSize: 11, marginTop: 12, lineHeight: 1.55 }}
                  >
                    This session is connected to {tenant.org_name}&rsquo;s
                    isolated database. Each workspace has its own data store,
                    nothing is shared across workspaces.
                  </p>
                </div>
              ) : (
                <p className="cloud-text-muted" style={{ fontSize: 13 }}>
                  Workspace information unavailable.
                </p>
              )}
            </SectionPanel>
          ) : (
            <SectionPanel
              title="Database"
              icon={
                <Database style={{ width: 16, height: 16, color: '#67e8f9' }} />
              }
            >
              <div className="flex flex-col" style={{ gap: 14 }}>
                <div
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    backgroundColor: 'var(--cloud-surface-raised)',
                    border: '1px solid var(--cloud-border)',
                  }}
                >
                  <p
                    className="cloud-text"
                    style={{
                      fontSize: 13,
                      fontFamily:
                        'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}
                  >
                    ~/.bestrong/bestrong.db
                  </p>
                  <p
                    className="cloud-text-muted"
                    style={{ fontSize: 11, marginTop: 6 }}
                  >
                    Default database location on your system
                  </p>
                </div>

                <div
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    border: '1px solid var(--cloud-border)',
                  }}
                >
                  <p
                    className="cloud-text"
                    style={{ ...MICRO_LABEL, marginBottom: 8 }}
                  >
                    Custom location
                  </p>
                  <p
                    className="cloud-text-muted"
                    style={{ fontSize: 13, lineHeight: 1.55 }}
                  >
                    To use a custom database location, set the{' '}
                    <code
                      className="cloud-text"
                      style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        backgroundColor: 'var(--cloud-surface-raised)',
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: 12,
                      }}
                    >
                      BESTRONG_DB_PATH
                    </code>{' '}
                    environment variable before starting the BeStrong server.
                  </p>
                  <p
                    className="cloud-text-muted"
                    style={{ fontSize: 11, marginTop: 8 }}
                  >
                    Example:{' '}
                    <code
                      className="cloud-text"
                      style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        backgroundColor: 'var(--cloud-surface-raised)',
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: 11,
                      }}
                    >
                      export BESTRONG_DB_PATH=/path/to/bestrong.db
                    </code>
                  </p>
                </div>
              </div>
            </SectionPanel>
          )}

          <SectionPanel title="About">
            <div className="flex flex-col" style={{ gap: 14 }}>
              <div>
                <p
                  className="cloud-text"
                  style={{ fontSize: 14, fontWeight: 600 }}
                >
                  BeStrong HQ {DISPLAY_VERSION}
                </p>
                <p
                  className="cloud-text-muted"
                  style={{ fontSize: 13, marginTop: 4 }}
                >
                  Open-source powerlifting coaching analytics and athlete CRM
                </p>
              </div>

              <div
                style={{
                  paddingTop: 14,
                  borderTop: '1px solid var(--cloud-border)',
                }}
              >
                <a
                  href="https://github.com/TennisShoeNinja/BeStrongHQ"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center"
                  style={{
                    fontSize: 13,
                    color: '#67e8f9',
                    gap: 4,
                    textDecoration: 'none',
                  }}
                >
                  View on GitHub
                  <span style={{ fontSize: 11 }}>&#8594;</span>
                </a>
              </div>
            </div>
          </SectionPanel>
        </>
      )}
    </PageShell>
  );
}
