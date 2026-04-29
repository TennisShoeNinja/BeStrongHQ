'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Plus,
  Shield,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import apiClient from '@/lib/api';
import { useAuth } from '@/lib/auth-provider';
import { INPUT_STYLE, PageShell, SectionPanel } from '../_shared';

export default function AccessConfigurationPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { deploymentMode, loading: authLoading } = useAuth();
  const [newAllowedEmail, setNewAllowedEmail] = useState('');
  const [newAllowedName, setNewAllowedName] = useState('');

  
  useEffect(() => {
    if (!authLoading && deploymentMode !== 'cloud') {
      router.replace('/configuration');
    }
  }, [authLoading, deploymentMode, router]);

  const { data: allowedUsers = [], isLoading } = useQuery({
    queryKey: ['allowed-users'],
    queryFn: () => apiClient.listAllowedUsers(),
    enabled: deploymentMode === 'cloud',
  });

  const addAllowedUserMutation = useMutation({
    mutationFn: (data: { email: string; name?: string }) =>
      apiClient.addAllowedUser(data),
    onSuccess: () => {
      const wasAuthDisabled = allowedUsers.length === 0;
      queryClient.invalidateQueries({ queryKey: ['allowed-users'] });
      setNewAllowedEmail('');
      setNewAllowedName('');

      if (wasAuthDisabled) {
        window.location.href = '/login?setup=complete';
      }
    },
  });

  const removeAllowedUserMutation = useMutation({
    mutationFn: (userId: number) => apiClient.removeAllowedUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allowed-users'] });
    },
  });

  const handleAddAllowedUser = () => {
    const email = newAllowedEmail.trim().toLowerCase();
    if (!email) return;
    addAllowedUserMutation.mutate({
      email,
      name: newAllowedName.trim() || undefined,
    });
  };

  if (authLoading || deploymentMode !== 'cloud') {
    return null;
  }

  return (
    <PageShell title="Access" subtitle="Allowed Google accounts for this workspace">
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
          Loading allowed users…
        </div>
      ) : (
        <SectionPanel
          title="Access control"
          icon={<Shield style={{ width: 16, height: 16, color: '#67e8f9' }} />}
        >
          {allowedUsers.length === 0 ? (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 13,
                lineHeight: 1.55,
                backgroundColor: 'rgba(251, 191, 36, 0.08)',
                border: '1px solid rgba(251, 191, 36, 0.28)',
                color: '#fbbf24',
              }}
            >
              No allowed users configured. Authentication is currently
              disabled, and anyone with the URL can access this instance. Add
              your Google email below to enable login protection.
            </div>
          ) : (
            <p
              className="cloud-text-muted"
              style={{ fontSize: 13, marginBottom: 14, lineHeight: 1.55 }}
            >
              Only these Google accounts can sign into this instance.
              Authentication is active.
            </p>
          )}

          {allowedUsers.length > 0 && (
            <div
              className="flex flex-col"
              style={{ gap: 6, marginBottom: 16 }}
            >
              {allowedUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between"
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    backgroundColor: 'var(--cloud-surface-raised)',
                    border: '1px solid var(--cloud-border)',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p
                      className="cloud-text"
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {u.email}
                    </p>
                    {u.name && (
                      <p
                        className="cloud-text-muted"
                        style={{ fontSize: 11, marginTop: 2 }}
                      >
                        {u.name}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => removeAllowedUserMutation.mutate(u.id)}
                    disabled={removeAllowedUserMutation.isPending}
                    title="Remove access"
                    style={{
                      padding: 6,
                      borderRadius: 6,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#fca5a5',
                      flexShrink: 0,
                    }}
                  >
                    <Trash2 style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {removeAllowedUserMutation.isError && (
            <p style={{ color: '#fca5a5', fontSize: 11, marginBottom: 8 }}>
              {(() => {
                const err = removeAllowedUserMutation.error as
                  | { data?: { detail?: string }; message?: string }
                  | null;
                return (
                  err?.data?.detail || err?.message || 'Failed to remove user.'
                );
              })()}
            </p>
          )}

          <div className="flex" style={{ gap: 8 }}>
            <input
              type="email"
              value={newAllowedEmail}
              onChange={(e) => setNewAllowedEmail(e.target.value)}
              placeholder="Google email address"
              style={{ ...INPUT_STYLE, flex: 1 }}
              onKeyDown={(e) => e.key === 'Enter' && handleAddAllowedUser()}
            />
            <input
              type="text"
              value={newAllowedName}
              onChange={(e) => setNewAllowedName(e.target.value)}
              placeholder="Name (optional)"
              style={{ ...INPUT_STYLE, width: 160 }}
              onKeyDown={(e) => e.key === 'Enter' && handleAddAllowedUser()}
            />
            <button
              onClick={handleAddAllowedUser}
              disabled={
                !newAllowedEmail.trim() || addAllowedUserMutation.isPending
              }
              className="cloud-btn cloud-btn-primary"
              style={{ padding: '0 14px', flexShrink: 0 }}
            >
              {addAllowedUserMutation.isPending ? (
                <Loader2
                  className="animate-spin"
                  style={{ width: 14, height: 14 }}
                />
              ) : (
                <Plus style={{ width: 14, height: 14 }} />
              )}
            </button>
          </div>

          {addAllowedUserMutation.isError && (
            <p style={{ color: '#fca5a5', fontSize: 11, marginTop: 8 }}>
              {(() => {
                const err = addAllowedUserMutation.error as
                  | {
                      data?: { detail?: string };
                      status?: number;
                      message?: string;
                    }
                  | null;
                if (err?.data?.detail) {
                  return typeof err.data.detail === 'string'
                    ? err.data.detail
                    : 'Validation error: check the email format';
                }
                if (err?.status === 409)
                  return 'This email is already in the allowed list';
                if (err?.message) return err.message;
                return 'Failed to add user. Make sure the API server is running.';
              })()}
            </p>
          )}

          <p
            className="cloud-text-muted"
            style={{ fontSize: 11, marginTop: 12, lineHeight: 1.55 }}
          >
            Uses Google OAuth for login. Only authorized Google accounts can
            access this instance.
          </p>
        </SectionPanel>
      )}
    </PageShell>
  );
}
