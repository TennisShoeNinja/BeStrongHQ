'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import apiClient from '@/lib/api';
import { useNow } from '@/lib/use-now';


const EXPIRING_SOON_THRESHOLD_HOURS = 48;

type BannerState =
  | { kind: 'hidden' }
  | { kind: 'expired'; detectedAt: string | null }
  | { kind: 'expiring_soon'; hoursRemaining: number; expiresAt: string };

function computeBannerState(
  data: ReturnType<typeof apiClient.getGDriveAuthStatus> extends Promise<infer T> ? T : never,
  now: number,
): BannerState {
  if (data.connection_status === 'expired') {
    return { kind: 'expired', detectedAt: data.last_error_at };
  }

  if (
    data.connection_status === 'active' &&
    data.refresh_token_expires_at
  ) {
    const expiresMs = new Date(data.refresh_token_expires_at).getTime();
    const hoursRemaining = (expiresMs - now) / (1000 * 60 * 60);
    
    
    if (hoursRemaining <= 0) {
      return { kind: 'expired', detectedAt: null };
    }
    if (hoursRemaining <= EXPIRING_SOON_THRESHOLD_HOURS) {
      return {
        kind: 'expiring_soon',
        hoursRemaining,
        expiresAt: data.refresh_token_expires_at,
      };
    }
  }

  return { kind: 'hidden' };
}

function formatHoursRemaining(hours: number): string {
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60));
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  if (hours < 24) {
    const rounded = Math.round(hours);
    return `${rounded} hour${rounded === 1 ? '' : 's'}`;
  }
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

export function DriveStatusBanner() {
  const { data } = useQuery({
    queryKey: ['gdrive-auth-status'],
    queryFn: () => apiClient.getGDriveAuthStatus(),
    refetchInterval: 60000,
    retry: false,
  });

  const now = useNow();
  if (!data) return null;
  const state = computeBannerState(data, now);
  if (state.kind === 'hidden') return null;

  const handleAuthFlow = async () => {
    try {
      const { auth_url } = await apiClient.getGDriveAuthUrl();
      window.location.href = auth_url;
    } catch {
      alert('Failed to start Google Drive reconnect. Check that the server is running.');
    }
  };

  if (state.kind === 'expired') {
    const lastErrorAt = state.detectedAt
      ? new Date(state.detectedAt).toLocaleString()
      : null;
    return (
      <div
        className="flex items-center"
        style={{
          gap: 12,
          padding: '10px 20px',
          fontSize: 13,
          borderBottom: '1px solid rgba(239, 68, 68, 0.28)',
          backgroundColor: 'rgba(239, 68, 68, 0.08)',
        }}
      >
        <AlertTriangle
          style={{
            width: 16,
            height: 16,
            color: '#fca5a5',
            flexShrink: 0,
          }}
          strokeWidth={1.8}
        />
        <div className="flex-1 min-w-0">
          <span style={{ color: '#fca5a5', fontWeight: 500 }}>
            Google Drive sync is paused.
          </span>{' '}
          <span style={{ color: 'rgba(252, 165, 165, 0.75)' }}>
            Reconnect to resume automatic imports.
          </span>
          {lastErrorAt && (
            <span
              style={{
                color: 'rgba(252, 165, 165, 0.5)',
                marginLeft: 8,
                fontSize: 11,
              }}
            >
              Detected {lastErrorAt}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleAuthFlow}
          className="cloud-btn cloud-btn-sm"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#fca5a5',
            whiteSpace: 'nowrap',
          }}
        >
          Reconnect Drive
        </button>
      </div>
    );
  }

  
  const whenStr = formatHoursRemaining(state.hoursRemaining);
  return (
    <div
      className="flex items-center"
      style={{
        gap: 12,
        padding: '10px 20px',
        fontSize: 13,
        borderBottom: '1px solid rgba(251, 146, 60, 0.28)',
        backgroundColor: 'rgba(251, 146, 60, 0.08)',
      }}
    >
      <AlertTriangle
        style={{
          width: 16,
          height: 16,
          color: '#fb923c',
          flexShrink: 0,
        }}
        strokeWidth={1.8}
      />
      <div className="flex-1 min-w-0">
        <span style={{ color: '#fb923c', fontWeight: 500 }}>
          Google Drive connection expires in {whenStr}.
        </span>{' '}
        <span style={{ color: 'rgba(251, 146, 60, 0.75)' }}>
          Renew now to avoid interrupted sync.
        </span>
      </div>
      <button
        type="button"
        onClick={handleAuthFlow}
        className="cloud-btn cloud-btn-sm"
        style={{
          backgroundColor: 'rgba(251, 146, 60, 0.15)',
          border: '1px solid rgba(251, 146, 60, 0.4)',
          color: '#fb923c',
          whiteSpace: 'nowrap',
        }}
      >
        Renew Drive
      </button>
    </div>
  );
}
