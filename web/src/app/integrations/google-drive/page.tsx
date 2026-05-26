'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  Check,
  AlertCircle,
  Loader2,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Clock,
  Square,
  CheckSquare,
  FileSpreadsheet,
  SkipForward,
  XCircle,
} from 'lucide-react';
import apiClient from '@/lib/api';
import DriveOrganizer from './DriveOrganizer';
import NamingPattern from './NamingPattern';
import * as Types from '@/lib/types';
import { useNow } from '@/lib/use-now';


interface BreadcrumbItem {
  id: string;
  name: string;
}

const MICRO_LABEL: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--cloud-text-muted)',
  fontWeight: 500,
};


function StepBadge({ n, done }: { n: number; done: boolean }) {
  if (done) {
    return (
      <div
        className="flex-shrink-0 grid place-items-center"
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          background: 'rgba(34, 197, 94, 0.12)',
          border: '1px solid rgba(34, 197, 94, 0.35)',
          marginTop: 2,
        }}
      >
        <Check style={{ width: 14, height: 14, color: '#86efac' }} strokeWidth={2.5} />
      </div>
    );
  }
  return (
    <div
      className="flex-shrink-0 grid place-items-center cloud-text-muted"
      style={{
        width: 26,
        height: 26,
        borderRadius: 999,
        background: 'var(--cloud-surface-raised)',
        border: '1px solid var(--cloud-border)',
        marginTop: 2,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {n}
    </div>
  );
}


function SyncReport({ data }: { data: Types.GDriveSyncResponse }) {
  const [expandedSection, setExpandedSection] = useState<string | null>(
    data.total_errors > 0 ? 'errors' : data.total_imported > 0 ? 'imported' : null
  );

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const skippedByReason = useMemo(() => {
    const groups: Record<string, typeof data.skipped> = {};
    for (const item of data.skipped) {
      const reason = item.reason || 'unknown';
      if (!groups[reason]) groups[reason] = [];
      groups[reason].push(item);
    }
    return groups;
  }, [data]);

  return (
    <div
      style={{
        borderRadius: 10,
        border: '1px solid var(--cloud-border)',
        overflow: 'hidden',
      }}
    >
      {}
      <div
        className="flex items-center flex-wrap"
        style={{
          gap: 18,
          padding: '10px 14px',
          background: 'var(--cloud-surface-raised)',
          fontSize: 13,
        }}
      >
        <span className="cloud-text" style={{ fontWeight: 600 }}>Sync complete</span>
        <span className="cloud-text-muted">{data.total_found} files found</span>
        {data.total_imported > 0 && (
          <span style={{ color: '#86efac' }}>{data.total_imported} imported</span>
        )}
        <span className="cloud-text-muted">{data.total_skipped} skipped</span>
        {data.total_errors > 0 && (
          <span style={{ color: '#fca5a5' }}>{data.total_errors} errors</span>
        )}
      </div>

      {}
      {data.errors.length > 0 && (
        <div style={{ borderTop: '1px solid var(--cloud-border)' }}>
          <button
            onClick={() => toggleSection('errors')}
            className="w-full flex items-center"
            style={{
              gap: 10,
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <XCircle style={{ width: 14, height: 14, color: '#fca5a5', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: '#fca5a5' }}>
              {data.errors.length} errors
            </span>
            <ChevronDown
              style={{
                width: 14,
                height: 14,
                color: 'var(--cloud-text-dim)',
                marginLeft: 'auto',
                transform: expandedSection === 'errors' ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s',
              }}
            />
          </button>
          {expandedSection === 'errors' && (
            <div className="flex flex-col" style={{ gap: 6, padding: '0 14px 12px' }}>
              {data.errors.map((item, i) => (
                <div
                  key={i}
                  style={{
                    background: 'rgba(239, 68, 68, 0.06)',
                    border: '1px solid rgba(239, 68, 68, 0.22)',
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 13,
                  }}
                >
                  <div className="cloud-text" style={{ fontWeight: 500 }}>{item.name}</div>
                  {item.folder && (
                    <div className="cloud-text-muted" style={{ fontSize: 12 }}>
                      Folder: {item.folder}
                    </div>
                  )}
                  <div style={{ color: '#fca5a5', fontSize: 12, marginTop: 4 }}>{item.error}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {}
      {data.imported.length > 0 && (
        <div style={{ borderTop: '1px solid var(--cloud-border)' }}>
          <button
            onClick={() => toggleSection('imported')}
            className="w-full flex items-center"
            style={{
              gap: 10,
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <Check style={{ width: 14, height: 14, color: '#86efac', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: '#86efac' }}>
              {data.imported.length} imported
            </span>
            <ChevronDown
              style={{
                width: 14,
                height: 14,
                color: 'var(--cloud-text-dim)',
                marginLeft: 'auto',
                transform: expandedSection === 'imported' ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s',
              }}
            />
          </button>
          {expandedSection === 'imported' && (
            <div className="flex flex-col" style={{ gap: 6, padding: '0 14px 12px' }}>
              {data.imported.map((item, i) => (
                <div
                  key={i}
                  style={{
                    background: 'rgba(34, 197, 94, 0.05)',
                    border: '1px solid rgba(34, 197, 94, 0.22)',
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 13,
                  }}
                >
                  <div className="cloud-text" style={{ fontWeight: 500 }}>{item.name}</div>
                  <div className="cloud-text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {item.folder && <span>Folder: {item.folder}</span>}
                    {item.sessions != null && <span> · {item.sessions} sessions</span>}
                    {item.exercises != null && <span> · {item.exercises} exercises</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {}
      {data.skipped.length > 0 && (
        <div style={{ borderTop: '1px solid var(--cloud-border)' }}>
          <button
            onClick={() => toggleSection('skipped')}
            className="w-full flex items-center"
            style={{
              gap: 10,
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <SkipForward
              style={{ width: 14, height: 14, color: 'var(--cloud-text-muted)', flexShrink: 0 }}
            />
            <span className="cloud-text-muted" style={{ fontSize: 13, fontWeight: 500 }}>
              {data.skipped.length} skipped
            </span>
            <ChevronDown
              style={{
                width: 14,
                height: 14,
                color: 'var(--cloud-text-dim)',
                marginLeft: 'auto',
                transform: expandedSection === 'skipped' ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s',
              }}
            />
          </button>
          {expandedSection === 'skipped' && (
            <div className="flex flex-col" style={{ gap: 12, padding: '0 14px 12px' }}>
              {Object.entries(skippedByReason).map(([reason, items]) => (
                <div key={reason}>
                  <div style={{ ...MICRO_LABEL, marginBottom: 8 }}>
                    {reason} ({items.length})
                  </div>
                  <div
                    className="flex flex-col cloud-thin-scroll"
                    style={{ gap: 2, maxHeight: 192, overflowY: 'auto' }}
                  >
                    {items.map((item, i) => (
                      <div
                        key={i}
                        className="cloud-text-muted flex items-center"
                        style={{
                          gap: 8,
                          padding: '4px 8px',
                          fontSize: 12,
                          background: 'var(--cloud-surface-raised)',
                          borderRadius: 6,
                          opacity: 0.65,
                        }}
                      >
                        <FileSpreadsheet style={{ width: 12, height: 12, flexShrink: 0 }} />
                        <span className="truncate">
                          {item.folder ? `${item.folder}/` : ''}
                          {item.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {}
      {data.folders_scanned.length > 0 && (
        <div style={{ borderTop: '1px solid var(--cloud-border)' }}>
          <button
            onClick={() => toggleSection('folders')}
            className="w-full flex items-center"
            style={{
              gap: 10,
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <FolderOpen
              style={{ width: 14, height: 14, color: 'var(--cloud-text-muted)', flexShrink: 0 }}
            />
            <span className="cloud-text-muted" style={{ fontSize: 13, fontWeight: 500 }}>
              {data.folders_scanned.length} folders scanned
            </span>
            <ChevronDown
              style={{
                width: 14,
                height: 14,
                color: 'var(--cloud-text-dim)',
                marginLeft: 'auto',
                transform: expandedSection === 'folders' ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s',
              }}
            />
          </button>
          {expandedSection === 'folders' && (
            <div style={{ padding: '0 14px 12px' }}>
              <div className="flex flex-wrap" style={{ gap: 6 }}>
                {data.folders_scanned.map((name, i) => (
                  <span
                    key={i}
                    className="cloud-text-muted"
                    style={{
                      fontSize: 11,
                      padding: '3px 10px',
                      borderRadius: 999,
                      background: 'var(--cloud-surface-raised)',
                      border: '1px solid var(--cloud-border)',
                    }}
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


const SCHEDULE_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
  { value: 120, label: 'Every 2 hours' },
  { value: 360, label: 'Every 6 hours' },
  { value: 720, label: 'Every 12 hours' },
  { value: 1440, label: 'Once a day' },
];

function ScheduleConfig() {
  const queryClient = useQueryClient();

  const { data: schedule, isLoading } = useQuery({
    queryKey: ['gdrive-schedule'],
    queryFn: () => apiClient.getSyncSchedule(),
    refetchInterval: 30000, 
  });

  const updateMutation = useMutation({
    mutationFn: (minutes: number) => apiClient.setSyncSchedule(minutes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gdrive-schedule'] });
    },
  });

  const currentInterval = schedule?.interval_minutes ?? 0;
  const currentLabel = SCHEDULE_OPTIONS.find(o => o.value === currentInterval)?.label
    || (currentInterval > 0 ? `Every ${currentInterval} minutes` : 'Off');

  return (
    <div className="cloud-panel" style={{ padding: 20 }}>
      <div className="flex items-start" style={{ gap: 14 }}>
        <div className="flex-shrink-0" style={{ marginTop: 2 }}>
          <Clock style={{ width: 20, height: 20, color: '#67e8f9' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className="cloud-text"
            style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}
          >
            Auto-sync schedule
          </h3>
          <p className="cloud-text-muted" style={{ fontSize: 13, marginTop: 2, marginBottom: 14 }}>
            Automatically check for new or updated programs on a schedule
          </p>

          {isLoading ? (
            <div
              className="cloud-text-muted flex items-center"
              style={{ gap: 8, fontSize: 13 }}
            >
              <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
              Loading schedule…
            </div>
          ) : (
            <div className="flex flex-col" style={{ gap: 14 }}>
              <div>
                <div style={{ ...MICRO_LABEL, marginBottom: 6 }}>Sync frequency</div>
                <select
                  value={currentInterval}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    updateMutation.mutate(val);
                  }}
                  disabled={updateMutation.isPending}
                  style={{
                    background: 'var(--cloud-surface-raised)',
                    border: '1px solid var(--cloud-border)',
                    color: 'var(--cloud-text)',
                    fontSize: 13,
                    padding: '7px 10px',
                    borderRadius: 8,
                    width: 256,
                    fontFamily: 'inherit',
                  }}
                >
                  {SCHEDULE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {schedule && schedule.enabled && (
                <div className="flex flex-col" style={{ gap: 4, fontSize: 13 }}>
                  <div className="flex items-center" style={{ gap: 8 }}>
                    <div
                      className="animate-pulse"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: '#86efac',
                      }}
                    />
                    <span style={{ color: '#86efac', fontWeight: 500 }}>Active</span>
                    <span className="cloud-text-dim">{currentLabel}</span>
                  </div>

                  {schedule.running_now && (
                    <div
                      className="flex items-center"
                      style={{ gap: 8, color: '#67e8f9' }}
                    >
                      <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} />
                      Sync running now…
                    </div>
                  )}

                  {schedule.last_run && (
                    <div className="cloud-text-dim">
                      Last run: {new Date(schedule.last_run).toLocaleString()}
                    </div>
                  )}

                  {schedule.last_status && (
                    <div
                      style={{
                        fontSize: 12,
                        color: schedule.last_status.startsWith('Error') ? '#fca5a5' : undefined,
                      }}
                      className={schedule.last_status.startsWith('Error') ? '' : 'cloud-text-muted'}
                    >
                      {schedule.last_status}
                    </div>
                  )}
                </div>
              )}

              {schedule && !schedule.enabled && currentInterval === 0 && (
                <div className="cloud-text-dim" style={{ fontSize: 13 }}>
                  Auto-sync is off. Select a frequency above to enable it.
                </div>
              )}

              {updateMutation.isPending && (
                <div
                  className="cloud-text-muted flex items-center"
                  style={{ gap: 8, fontSize: 13 }}
                >
                  <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} />
                  Saving…
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GoogleDriveSyncPage() {
  const queryClient = useQueryClient();
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [currentParentId, setCurrentParentId] = useState<string>('root');
  const [selectedFolders, setSelectedFolders] = useState<Map<string, string>>(new Map());
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGoogleSetupHelp, setShowGoogleSetupHelp] = useState(false);

  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error');
    if (oauthError) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(`Google Drive authentication failed: ${oauthError}`);
      
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  
  const authStatusQuery = useQuery({
    queryKey: ['gdrive-auth-status'],
    queryFn: () => apiClient.getGDriveAuthStatus(),
    refetchInterval: (query) => {
      const data = query.state.data as { is_authenticated?: boolean; authenticated?: boolean } | undefined;
      const authed = data?.is_authenticated || data?.authenticated;
      return authed ? 60000 : 5000;
    },
  });

  const scheduleStatusQuery = useQuery({
    queryKey: ['gdrive-schedule'],
    queryFn: () => apiClient.getSyncSchedule(),
    refetchInterval: 30000,
  });

  const isAuthenticated = authStatusQuery.data?.authenticated === true;
  const isExpired = authStatusQuery.data?.connection_status === 'expired';
  const hasGoogleCredentials = authStatusQuery.data?.has_credentials === true;
  const needsGoogleSetup =
    !authStatusQuery.isLoading && !isAuthenticated && !hasGoogleCredentials;
  const lastSuccessfulSyncAt = authStatusQuery.data?.last_successful_sync_at;
  const refreshTokenExpiresAt = authStatusQuery.data?.refresh_token_expires_at ?? null;

  
  
  
  
  
  
  const intervalMinutes = scheduleStatusQuery.data?.interval_minutes ?? 0;
  const staleThresholdMs =
    (intervalMinutes > 0 ? intervalMinutes * 2 : 24 * 60) * 60 * 1000;
  const now = useNow();
  const lastSuccessMs = lastSuccessfulSyncAt
    ? Date.parse(lastSuccessfulSyncAt)
    : null;
  const lastSuccessAgeMs =
    lastSuccessMs !== null ? now - lastSuccessMs : null;
  const lastSuccessIsStale =
    lastSuccessAgeMs !== null && lastSuccessAgeMs > staleThresholdMs;

  const humanizeAge = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'}`;
  };

  const startReauth = async () => {
    if (!hasGoogleCredentials) {
      setError(null);
      setShowGoogleSetupHelp(true);
      return;
    }

    try {
      const { auth_url } = await apiClient.getGDriveAuthUrl();
      window.location.href = auth_url;
    } catch (err) {
      const apiErr = err as { data?: { detail?: string } };
      const detail = apiErr.data?.detail;
      if (detail?.toLowerCase().includes('google oauth not configured')) {
        setError(null);
        setShowGoogleSetupHelp(true);
        return;
      }
      setError(detail || 'Failed to start Google Drive authorization. Check that the server is running.');
    }
  };

  const disconnectMutation = useMutation({
    mutationFn: () => apiClient.disconnectGDrive(),
    onSuccess: () => {
      setError(null);
      authStatusQuery.refetch();
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to disconnect');
    },
  });

  const watchedFoldersQuery = useQuery({
    queryKey: ['watched-folders'],
    queryFn: () => apiClient.getWatchedFolders(),
    enabled: isAuthenticated,
  });

  const hasWatchedFolders = (watchedFoldersQuery.data?.length ?? 0) > 0;
  const isRootWatched = (watchedFoldersQuery.data ?? []).some((f) => f.id === 'root');

  useEffect(() => {
    if (isEditing && watchedFoldersQuery.data) {
      const map = new Map<string, string>();
      for (const f of watchedFoldersQuery.data) {
        map.set(f.id, f.name);
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedFolders(map);
    }
  }, [isEditing, watchedFoldersQuery.data]);

  const listFoldersQuery = useQuery({
    queryKey: ['gdrive-folders', currentParentId],
    queryFn: () => apiClient.listFolders(currentParentId),
    enabled: isAuthenticated && (isEditing || !hasWatchedFolders),
  });

  const rootSheetCountQuery = useQuery({
    queryKey: ['gdrive-root-sheet-count'],
    queryFn: () => apiClient.getFolderSheetCount('root'),
    enabled:
      isAuthenticated
      && (isEditing || !hasWatchedFolders)
      && currentParentId === 'root',
    staleTime: 60_000,
  });

  const saveWatchedFoldersMutation = useMutation({
    mutationFn: (folders: { id: string; name: string }[]) => apiClient.setWatchedFolders(folders),
    onSuccess: () => {
      setError(null);
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['watched-folders'] });
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to save watched folders');
    },
  });

  const { data: lastSyncReport } = useQuery<Types.GDriveSyncResponse | null>({
    queryKey: ['gdrive-last-sync-report'],
    queryFn: () => null,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    initialData: null,
  });

  const syncMutation = useMutation({
    mutationFn: () => apiClient.sync(),
    onSuccess: (data) => {
      setError(null);
      queryClient.setQueryData(['gdrive-last-sync-report'], data);
      queryClient.invalidateQueries({ queryKey: ['gdrive-history'] });
      queryClient.invalidateQueries({ queryKey: ['gdrive-auth-status'] });
      queryClient.invalidateQueries({ queryKey: ['athlete'] });
      queryClient.invalidateQueries({ queryKey: ['athletes'] });
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string }; status?: number }; code?: string; message?: string };
      const detail = error.response?.data?.detail;
      const status = error.response?.status;
      if (detail) {
        setError(`Sync failed: ${detail}`);
      } else if (error.code === 'ECONNABORTED') {
        setError('Sync timed out. The sync may still be running on the server. Try again in a minute.');
      } else if (status) {
        setError(`Sync failed with status ${status}`);
      } else {
        setError(`Sync failed: ${error.message || 'Unknown error'}`);
      }
    },
  });

  const forceResyncMutation = useMutation({
    mutationFn: () => apiClient.forceResyncAll(),
    onSuccess: () => {
      setError(null);
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string } }; message?: string };
      const detail = error.response?.data?.detail;
      setError(`Force resync failed: ${detail || error.message || 'Unknown error'}`);
    },
  });

  const resyncStatusQuery = useQuery({
    queryKey: ['force-resync-status'],
    queryFn: () => apiClient.getForceResyncStatus(),
    refetchInterval: (query) => {
      const data = query.state.data as { running?: boolean } | undefined;
      return data?.running ? 2000 : false;
    },
  });

  const resyncStatus = resyncStatusQuery.data;
  const resyncRunning = resyncStatus?.running ?? false;
  const resyncDone = resyncStatus !== undefined && !resyncStatus.running && resyncStatus.finished_at !== null;

  useEffect(() => {
    if (resyncDone) {
      queryClient.invalidateQueries({ queryKey: ['gdrive-history'] });
      queryClient.invalidateQueries({ queryKey: ['athletes'] });
      queryClient.invalidateQueries({ queryKey: ['programs'] });
    }
  }, [resyncDone, queryClient]);

  const historyQuery = useQuery({
    queryKey: ['gdrive-history'],
    queryFn: () => apiClient.getHistory(),
    enabled: isAuthenticated,
  });

  const toggleFolder = (folder: Types.GDriveFolder) => {
    const newMap = new Map(selectedFolders);
    if (newMap.has(folder.id)) {
      newMap.delete(folder.id);
      setSelectedFolders(newMap);
      return;
    }
    if (folder.id === 'root') {
      newMap.clear();
    } else {
      newMap.delete('root');
    }
    newMap.set(folder.id, folder.name);
    setSelectedFolders(newMap);
  };

  const navigateIntoFolder = (folder: Types.GDriveFolder) => {
    setBreadcrumbs([...breadcrumbs, { id: folder.id, name: folder.name }]);
    setCurrentParentId(folder.id);
  };

  const navigateToRoot = () => {
    setBreadcrumbs([]);
    setCurrentParentId('root');
  };

  const navigateToBreadcrumb = (index: number) => {
    const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(newBreadcrumbs);
    setCurrentParentId(newBreadcrumbs[newBreadcrumbs.length - 1].id);
  };

  const handleSaveFolders = () => {
    const folders = Array.from(selectedFolders.entries()).map(([id, name]) => ({ id, name }));
    saveWatchedFoldersMutation.mutate(folders);
  };

  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div style={{ padding: 'var(--cloud-s5)' }}>
      <div className="mx-auto flex flex-col" style={{ maxWidth: 880, gap: 'var(--cloud-s4)' }}>
        {}
        <div>
          <div
            className="flex items-center"
            style={{ gap: 8, marginBottom: 6 }}
          >
            <Link
              href="/integrations"
              className="cloud-text-muted transition-opacity hover:opacity-80"
              style={{ display: 'inline-flex', alignItems: 'center' }}
            >
              <ChevronLeft style={{ width: 16, height: 16 }} />
            </Link>
            <span className="cloud-text-muted" style={{ fontSize: 12 }}>Integrations</span>
          </div>
          <h1
            className="font-semibold cloud-text"
            style={{ fontSize: 32, letterSpacing: '-0.03em', lineHeight: 1.1 }}
          >
            Google Drive sync
          </h1>
          <p className="cloud-text-muted" style={{ fontSize: 13, marginTop: 4 }}>
            Connect to Google Drive and sync training programs automatically
          </p>
        </div>

        {}
        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.28)',
              borderRadius: 10,
              padding: 12,
            }}
          >
            <p style={{ color: '#fca5a5', fontSize: 13 }}>{error}</p>
          </div>
        )}

        {}
        <div className="cloud-panel" style={{ padding: 20 }}>
          <div className="flex items-start" style={{ gap: 14 }}>
            <StepBadge n={1} done={isAuthenticated} />
            <div className="flex-1 min-w-0">
              <h3
                className="cloud-text"
                style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}
              >
                Google connection
              </h3>
              <p
                className="cloud-text-muted"
                style={{ fontSize: 13, marginTop: 2, marginBottom: 14 }}
              >
                Sign into your Google account to grant access to your Drive and Calendar
              </p>

              {authStatusQuery.isLoading && (
                <div
                  className="cloud-text-muted flex items-center"
                  style={{ gap: 8, fontSize: 13 }}
                >
                  <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
                  Checking status…
                </div>
              )}

              {isAuthenticated ? (
                <div className="flex flex-col" style={{ gap: 6 }}>
                  <div className="flex items-center flex-wrap" style={{ gap: 10 }}>
                    <div
                      className="flex items-center"
                      style={{ gap: 6, color: '#86efac', fontSize: 13 }}
                    >
                      <Check style={{ width: 14, height: 14 }} strokeWidth={2.5} />
                      <span>
                        Connected
                        {authStatusQuery.data?.connected_email
                          ? ` as ${authStatusQuery.data.connected_email}`
                          : ''}
                      </span>
                    </div>
                    <button
                      onClick={startReauth}
                      className="cloud-btn cloud-btn-ghost cloud-btn-sm"
                      style={{ color: '#fbbf24', borderColor: 'rgba(251, 191, 36, 0.3)' }}
                    >
                      Renew connection
                    </button>
                    <button
                      onClick={() => disconnectMutation.mutate()}
                      disabled={disconnectMutation.isPending}
                      className="cloud-btn cloud-btn-ghost cloud-btn-sm"
                      style={{ color: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                    >
                      {disconnectMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  </div>
                  {lastSuccessfulSyncAt && (
                    <p
                      className={lastSuccessIsStale ? '' : 'cloud-text-dim'}
                      style={{
                        fontSize: 12,
                        color: lastSuccessIsStale ? '#fb923c' : undefined,
                      }}
                    >
                      Last successful sync:{' '}
                      {new Date(lastSuccessfulSyncAt).toLocaleString()}
                      {lastSuccessIsStale && lastSuccessAgeMs !== null && (
                        <>
                          {' '}({humanizeAge(lastSuccessAgeMs)} ago, longer
                          than expected)
                        </>
                      )}
                    </p>
                  )}
                  {refreshTokenExpiresAt && (
                    <p className="cloud-text-dim" style={{ fontSize: 12 }}>
                      Connection expires: {new Date(refreshTokenExpiresAt).toLocaleString()}
                      {' '}
                      <span style={{ opacity: 0.6 }}>
                        (Google Testing-mode 7-day window)
                      </span>
                    </p>
                  )}
                </div>
              ) : (
                !authStatusQuery.isLoading && (
                  <div className="flex flex-col" style={{ gap: 12 }}>
                    {isExpired && (
                      <div
                        style={{
                          background: 'rgba(245, 158, 11, 0.08)',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          borderRadius: 10,
                          padding: 12,
                        }}
                      >
                        <p
                          className="flex items-center"
                          style={{
                            gap: 6,
                            color: '#fcd34d',
                            fontSize: 13,
                            fontWeight: 500,
                            marginBottom: 4,
                          }}
                        >
                          <AlertCircle style={{ width: 14, height: 14 }} />
                          Connection expired
                        </p>
                        <p style={{ color: 'rgba(253, 230, 138, 0.8)', fontSize: 12 }}>
                          {authStatusQuery.data?.connected_email
                            ? `Google revoked the refresh token for ${authStatusQuery.data.connected_email}. `
                            : 'Google revoked the refresh token. '}
                          This is expected every 7 days while the app is in Google&apos;s verification testing mode.
                          Sync has been paused. Click below to reconnect.
                        </p>
                        {lastSuccessfulSyncAt && (
                          <p
                            style={{
                              color: 'rgba(253, 230, 138, 0.55)',
                              fontSize: 12,
                              marginTop: 4,
                            }}
                          >
                            Last successful sync: {new Date(lastSuccessfulSyncAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    )}
                    {(needsGoogleSetup || showGoogleSetupHelp) && (
                      <div
                        style={{
                          background: 'rgba(245, 158, 11, 0.08)',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          borderRadius: 10,
                          padding: 12,
                        }}
                      >
                        <p
                          className="flex items-center"
                          style={{
                            gap: 6,
                            color: '#fcd34d',
                            fontSize: 13,
                            fontWeight: 500,
                            marginBottom: 4,
                          }}
                        >
                          <AlertCircle style={{ width: 14, height: 14 }} />
                          Google Cloud setup required
                        </p>
                        <p style={{ color: 'rgba(253, 230, 138, 0.8)', fontSize: 12 }}>
                          This local Community Edition uses your own Google OAuth client before Drive and Calendar can connect.
                          Finish Google setup, paste the Client ID and Client Secret into the runtime config file, restart BeStrong, then return here.
                        </p>
                        <a
                          href="https://github.com/TennisShoeNinja/BeStrongHQ/blob/main/docs/install.md#google-drive-and-calendar-setup"
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: 'inline-flex',
                            marginTop: 8,
                            color: '#fcd34d',
                            fontSize: 12,
                            fontWeight: 500,
                          }}
                        >
                          Open Google setup steps
                        </a>
                      </div>
                    )}
                    <button
                      onClick={startReauth}
                      className="cloud-btn cloud-btn-primary"
                      style={
                        isExpired
                          ? { background: '#d97706', borderColor: '#d97706' }
                          : undefined
                      }
                    >
                      {needsGoogleSetup
                        ? 'Set up Google credentials'
                        : isExpired
                          ? 'Reconnect Google Drive'
                          : 'Connect Google Drive'}
                    </button>
                    {!isExpired && !needsGoogleSetup && (
                      <p className="cloud-text-dim" style={{ fontSize: 12 }}>
                        You will be redirected to Google to grant Drive and Calendar access for program imports, folder organization, and calendar sync.
                      </p>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {}
        {isAuthenticated && (
          <div className="cloud-panel" style={{ padding: 20 }}>
            <div className="flex items-start" style={{ gap: 14 }}>
              <StepBadge n={2} done={hasWatchedFolders && !isEditing} />
              <div className="flex-1 min-w-0">
                <h3
                  className="cloud-text"
                  style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}
                >
                  Athlete folders
                </h3>
                <p
                  className="cloud-text-muted"
                  style={{ fontSize: 13, marginTop: 2, marginBottom: 14 }}
                >
                  Select which athlete folders to sync
                </p>

                {hasWatchedFolders && !isEditing && watchedFoldersQuery.data && (
                  <div className="flex flex-col" style={{ gap: 12 }}>
                    <div className="flex flex-wrap" style={{ gap: 6 }}>
                      {watchedFoldersQuery.data.map((f) => (
                        <span
                          key={f.id}
                          className="inline-flex items-center"
                          style={{
                            gap: 6,
                            padding: '4px 10px',
                            borderRadius: 8,
                            fontSize: 13,
                            background: 'rgba(34, 197, 94, 0.08)',
                            border: '1px solid rgba(34, 197, 94, 0.28)',
                            color: '#86efac',
                          }}
                        >
                          <FolderOpen style={{ width: 12, height: 12 }} />
                          {f.name}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        setIsEditing(true);
                        navigateToRoot();
                      }}
                      className="cloud-btn cloud-btn-ghost cloud-btn-sm"
                      style={{ alignSelf: 'flex-start' }}
                    >
                      Edit folders
                    </button>
                  </div>
                )}

                {(isEditing || !hasWatchedFolders) && (
                  <div>
                    {selectedFolders.size > 0 && (
                      <div
                        style={{
                          fontSize: 13,
                          color: '#67e8f9',
                          marginBottom: 10,
                        }}
                      >
                        {selectedFolders.size} folder{selectedFolders.size !== 1 ? 's' : ''} selected:
                        {' '}
                        <span className="cloud-text-muted">
                          {Array.from(selectedFolders.values()).join(', ')}
                        </span>
                      </div>
                    )}

                    {}
                    <div
                      className="flex items-center flex-wrap"
                      style={{ gap: 6, marginBottom: 10, fontSize: 13 }}
                    >
                      <button
                        onClick={navigateToRoot}
                        style={{
                          color: 'var(--cloud-primary)',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                        }}
                        className="hover:opacity-80"
                      >
                        My Drive
                      </button>
                      {breadcrumbs.map((crumb, idx) => (
                        <div key={crumb.id} className="flex items-center" style={{ gap: 6 }}>
                          <ChevronRight
                            style={{ width: 14, height: 14, color: 'var(--cloud-text-dim)' }}
                          />
                          <button
                            onClick={() => navigateToBreadcrumb(idx)}
                            style={{
                              color: 'var(--cloud-primary)',
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              cursor: 'pointer',
                            }}
                            className="hover:opacity-80"
                          >
                            {crumb.name}
                          </button>
                        </div>
                      ))}
                    </div>

                    {listFoldersQuery.isLoading && (
                      <div className="flex items-center justify-center" style={{ padding: '32px 0' }}>
                        <Loader2
                          className="animate-spin"
                          style={{ width: 22, height: 22, color: 'var(--cloud-primary)' }}
                        />
                      </div>
                    )}

                    {listFoldersQuery.data
                      && listFoldersQuery.data.length === 0
                      && currentParentId !== 'root' && (
                      <div className="text-center" style={{ padding: '32px 0' }}>
                        <FolderOpen
                          className="mx-auto"
                          style={{
                            width: 28,
                            height: 28,
                            color: 'var(--cloud-text-dim)',
                            marginBottom: 8,
                          }}
                        />
                        <p className="cloud-text-muted" style={{ fontSize: 13 }}>
                          No subfolders here
                        </p>
                      </div>
                    )}

                    {currentParentId === 'root' && (
                      <div
                        className="flex flex-col"
                        style={{ gap: 4, marginBottom: 10 }}
                      >
                        {(() => {
                          const isChecked = selectedFolders.has('root');
                          const count = rootSheetCountQuery.data;
                          const countLabel = rootSheetCountQuery.isLoading
                            ? 'checking…'
                            : count === undefined
                              ? null
                              : `${count} sheet${count === 1 ? '' : 's'}`;
                          return (
                            <div
                              className="flex items-center"
                              style={{
                                gap: 10,
                                padding: '8px 10px',
                                borderRadius: 8,
                                border: `1px solid ${
                                  isChecked ? 'rgba(12, 92, 171, 0.45)' : 'var(--cloud-border)'
                                }`,
                                background: isChecked
                                  ? 'rgba(12, 92, 171, 0.1)'
                                  : 'var(--cloud-surface-raised)',
                                transition: 'border-color 0.15s, background 0.15s',
                              }}
                            >
                              <button
                                onClick={() => toggleFolder({ id: 'root', name: 'My Drive' })}
                                className="flex-shrink-0"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  cursor: 'pointer',
                                }}
                              >
                                {isChecked ? (
                                  <CheckSquare
                                    style={{ width: 18, height: 18, color: 'var(--cloud-primary)' }}
                                  />
                                ) : (
                                  <Square
                                    style={{ width: 18, height: 18, color: 'var(--cloud-text-dim)' }}
                                  />
                                )}
                              </button>
                              <FolderOpen
                                style={{
                                  width: 14,
                                  height: 14,
                                  color: 'var(--cloud-text-muted)',
                                  flexShrink: 0,
                                }}
                              />
                              <div
                                className="flex-1"
                                style={{ cursor: 'pointer', minWidth: 0 }}
                                onClick={() => toggleFolder({ id: 'root', name: 'My Drive' })}
                              >
                                <div className="cloud-text" style={{ fontSize: 13 }}>
                                  My Drive root
                                </div>
                                <div
                                  className="cloud-text-dim"
                                  style={{ fontSize: 11, marginTop: 1 }}
                                >
                                  Sheets saved directly in My Drive
                                  {countLabel ? ` · ${countLabel}` : ''}
                                </div>
                                <div
                                  className="cloud-text-dim"
                                  style={{ fontSize: 11, marginTop: 1, fontStyle: 'italic' }}
                                >
                                  Pairs only with itself. Picking a named folder clears this.
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {listFoldersQuery.data && listFoldersQuery.data.length > 0 && (
                      <div
                        className="flex flex-col cloud-thin-scroll"
                        style={{
                          gap: 4,
                          maxHeight: 288,
                          overflowY: 'auto',
                          marginBottom: 14,
                        }}
                      >
                        {listFoldersQuery.data.map((folder) => {
                          const isChecked = selectedFolders.has(folder.id);
                          return (
                            <div
                              key={folder.id}
                              className="flex items-center"
                              style={{
                                gap: 10,
                                padding: '8px 10px',
                                borderRadius: 8,
                                border: `1px solid ${
                                  isChecked ? 'rgba(12, 92, 171, 0.45)' : 'var(--cloud-border)'
                                }`,
                                background: isChecked
                                  ? 'rgba(12, 92, 171, 0.1)'
                                  : 'var(--cloud-surface-raised)',
                                transition: 'border-color 0.15s, background 0.15s',
                              }}
                            >
                              <button
                                onClick={() => toggleFolder(folder)}
                                className="flex-shrink-0"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  cursor: 'pointer',
                                }}
                              >
                                {isChecked ? (
                                  <CheckSquare
                                    style={{ width: 18, height: 18, color: 'var(--cloud-primary)' }}
                                  />
                                ) : (
                                  <Square
                                    style={{ width: 18, height: 18, color: 'var(--cloud-text-dim)' }}
                                  />
                                )}
                              </button>
                              <FolderOpen
                                style={{
                                  width: 14,
                                  height: 14,
                                  color: 'var(--cloud-text-muted)',
                                  flexShrink: 0,
                                }}
                              />
                              <span
                                className="cloud-text flex-1"
                                style={{ fontSize: 13, cursor: 'pointer' }}
                                onClick={() => toggleFolder(folder)}
                              >
                                {folder.name}
                              </span>
                              <button
                                onClick={() => navigateIntoFolder(folder)}
                                className="cloud-text-dim hover:opacity-80"
                                style={{
                                  fontSize: 12,
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  cursor: 'pointer',
                                }}
                              >
                                Open
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex" style={{ gap: 8 }}>
                      <button
                        onClick={handleSaveFolders}
                        disabled={selectedFolders.size === 0 || saveWatchedFoldersMutation.isPending}
                        className="cloud-btn cloud-btn-primary"
                      >
                        {saveWatchedFoldersMutation.isPending ? (
                          <>
                            <Loader2 className="animate-spin" style={{ width: 13, height: 13 }} />
                            Saving…
                          </>
                        ) : (
                          <>
                            <Check style={{ width: 13, height: 13 }} />
                            Save {selectedFolders.size} folder
                            {selectedFolders.size !== 1 ? 's' : ''}
                          </>
                        )}
                      </button>
                      {isEditing && (
                        <button
                          onClick={() => setIsEditing(false)}
                          className="cloud-btn cloud-btn-ghost"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {}
        {isAuthenticated && hasWatchedFolders && !isEditing && (
          <div className="cloud-panel" style={{ padding: 20 }}>
            <div className="flex items-start" style={{ gap: 14 }}>
              <div className="flex-shrink-0" style={{ marginTop: 2 }}>
                <RefreshCw style={{ width: 20, height: 20, color: '#67e8f9' }} />
              </div>
              <div className="flex-1 min-w-0">
                <h3
                  className="cloud-text"
                  style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}
                >
                  Sync now
                </h3>
                <p
                  className="cloud-text-muted"
                  style={{ fontSize: 13, marginTop: 2, marginBottom: 14 }}
                >
                  Scan selected folders and import new or updated spreadsheets
                </p>

                <div style={{ marginBottom: 20 }}>
                  <div
                    className="flex items-center flex-wrap"
                    style={{ gap: 10, marginBottom: 10 }}
                  >
                    <button
                      onClick={() => syncMutation.mutate()}
                      disabled={syncMutation.isPending || forceResyncMutation.isPending}
                      className="cloud-btn cloud-btn-primary"
                    >
                      {syncMutation.isPending ? (
                        <>
                          <Loader2 className="animate-spin" style={{ width: 13, height: 13 }} />
                          Syncing…
                        </>
                      ) : (
                        <>
                          <RefreshCw style={{ width: 13, height: 13 }} />
                          Sync now
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => forceResyncMutation.mutate()}
                      disabled={
                        syncMutation.isPending ||
                        forceResyncMutation.isPending ||
                        resyncRunning
                      }
                      className="cloud-btn"
                      style={{ background: '#c2410c', borderColor: '#c2410c', color: '#fff' }}
                    >
                      {forceResyncMutation.isPending || resyncRunning ? (
                        <>
                          <Loader2 className="animate-spin" style={{ width: 13, height: 13 }} />
                          {resyncStatus
                            ? `Re-parsing ${resyncStatus.resynced}/${resyncStatus.total}…`
                            : 'Starting…'}
                        </>
                      ) : (
                        <>
                          <RefreshCw style={{ width: 13, height: 13 }} />
                          Full resync
                        </>
                      )}
                    </button>
                  </div>
                  <p
                    className="cloud-text-dim"
                    style={{ fontSize: 12, marginBottom: 14, lineHeight: 1.55 }}
                  >
                    <strong className="cloud-text-muted">Sync now</strong> imports new or updated sheets only.
                    {' '}
                    <strong className="cloud-text-muted">Full resync</strong> re-downloads and re-parses every program.
                  </p>

                  {lastSyncReport && <SyncReport data={lastSyncReport} />}

                  {resyncRunning && resyncStatus && (
                    <div
                      style={{
                        borderRadius: 10,
                        border: '1px solid rgba(249, 115, 22, 0.4)',
                        overflow: 'hidden',
                        marginTop: lastSyncReport ? 12 : 0,
                      }}
                    >
                      <div
                        style={{
                          background: 'var(--cloud-surface-raised)',
                          padding: '10px 14px',
                          fontSize: 13,
                        }}
                      >
                        <div
                          className="flex items-center"
                          style={{ gap: 10, marginBottom: 8 }}
                        >
                          <Loader2
                            className="animate-spin"
                            style={{ width: 14, height: 14, color: '#fdba74' }}
                          />
                          <span className="cloud-text" style={{ fontWeight: 500 }}>
                            {`Re-parsing programs: ${resyncStatus.resynced} of ${resyncStatus.total}`}
                          </span>
                        </div>
                        {resyncStatus.phase === 'resyncing' && resyncStatus.total > 0 && (
                          <div
                            style={{
                              width: '100%',
                              height: 6,
                              background: 'var(--cloud-border)',
                              borderRadius: 999,
                            }}
                          >
                            <div
                              className="transition-all duration-300"
                              style={{
                                height: 6,
                                background: '#f97316',
                                borderRadius: 999,
                                width: `${Math.round(
                                  (resyncStatus.resynced / resyncStatus.total) * 100
                                )}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {resyncDone && resyncStatus && (
                    <div
                      style={{
                        borderRadius: 10,
                        border: '1px solid var(--cloud-border)',
                        overflow: 'hidden',
                        marginTop: lastSyncReport || resyncRunning ? 12 : 0,
                      }}
                    >
                      <div
                        className="flex items-center flex-wrap"
                        style={{
                          background: 'var(--cloud-surface-raised)',
                          gap: 18,
                          padding: '10px 14px',
                          fontSize: 13,
                        }}
                      >
                        <span className="cloud-text" style={{ fontWeight: 600 }}>
                          Full resync complete
                        </span>
                        <span style={{ color: '#86efac' }}>
                          {resyncStatus.resynced} re-parsed
                        </span>
                        {resyncStatus.errors.length > 0 && (
                          <span style={{ color: '#fca5a5' }}>
                            {resyncStatus.errors.length} errors
                          </span>
                        )}
                        {(resyncStatus.orphaned?.length ?? 0) > 0 && (
                          <span style={{ color: '#fcd34d' }}>
                            {resyncStatus.orphaned.length} skipped
                          </span>
                        )}
                        <span className="cloud-text-muted">{resyncStatus.total} total</span>
                      </div>
                      {resyncStatus.errors.length > 0 && (
                        <div
                          className="flex flex-col"
                          style={{
                            gap: 4,
                            borderTop: '1px solid var(--cloud-border)',
                            padding: '10px 14px',
                          }}
                        >
                          {resyncStatus.errors.map((err: string, i: number) => (
                            <p key={i} style={{ fontSize: 12, color: '#fca5a5' }}>
                              {err}
                            </p>
                          ))}
                        </div>
                      )}
                      {(resyncStatus.orphaned?.length ?? 0) > 0 && (
                        <div
                          className="flex flex-col"
                          style={{
                            gap: 4,
                            borderTop: '1px solid var(--cloud-border)',
                            padding: '10px 14px',
                          }}
                        >
                          <p className="cloud-text-muted" style={{ fontSize: 12 }}>
                            Skipped (source file removed from Drive):
                          </p>
                          {resyncStatus.orphaned.map((msg: string, i: number) => (
                            <p key={i} style={{ fontSize: 12, color: '#fcd34d' }}>
                              {msg}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {}
                <div>
                  <h4
                    className="cloud-text-muted flex items-center"
                    style={{
                      gap: 6,
                      fontSize: 13,
                      fontWeight: 500,
                      marginBottom: 10,
                    }}
                  >
                    <Clock style={{ width: 14, height: 14 }} />
                    Import history
                  </h4>

                  {historyQuery.isLoading && (
                    <div
                      className="flex items-center justify-center"
                      style={{ padding: '20px 0' }}
                    >
                      <Loader2
                        className="animate-spin"
                        style={{
                          width: 16,
                          height: 16,
                          color: 'var(--cloud-text-dim)',
                        }}
                      />
                    </div>
                  )}

                  {historyQuery.data && historyQuery.data.length === 0 && (
                    <div className="text-center" style={{ padding: '20px 0' }}>
                      <p className="cloud-text-dim" style={{ fontSize: 13 }}>
                        No imports yet
                      </p>
                    </div>
                  )}

                  {historyQuery.data && historyQuery.data.length > 0 && (
                    <div
                      className="flex flex-col cloud-thin-scroll"
                      style={{ gap: 6, maxHeight: 320, overflowY: 'auto' }}
                    >
                      {historyQuery.data.map((item) => {
                        const tint =
                          item.status === 'success'
                            ? { bg: 'rgba(34, 197, 94, 0.06)', border: 'rgba(34, 197, 94, 0.22)' }
                            : item.status === 'skipped'
                              ? {
                                  bg: 'var(--cloud-surface-raised)',
                                  border: 'var(--cloud-border)',
                                }
                              : { bg: 'rgba(239, 68, 68, 0.06)', border: 'rgba(239, 68, 68, 0.22)' };
                        return (
                          <div
                            key={item.id}
                            style={{
                              background: tint.bg,
                              border: `1px solid ${tint.border}`,
                              borderRadius: 8,
                              padding: 10,
                              fontSize: 13,
                            }}
                          >
                            <div className="flex items-start justify-between" style={{ gap: 12 }}>
                              <div className="flex-1 min-w-0">
                                <p
                                  className="cloud-text flex items-center"
                                  style={{ gap: 6, fontWeight: 500 }}
                                >
                                  {item.status === 'success' ? (
                                    <Check
                                      style={{
                                        width: 13,
                                        height: 13,
                                        color: '#86efac',
                                        flexShrink: 0,
                                      }}
                                      strokeWidth={2.5}
                                    />
                                  ) : item.status === 'skipped' ? (
                                    <Clock
                                      style={{
                                        width: 13,
                                        height: 13,
                                        color: 'var(--cloud-text-muted)',
                                        flexShrink: 0,
                                      }}
                                    />
                                  ) : (
                                    <AlertCircle
                                      style={{
                                        width: 13,
                                        height: 13,
                                        color: '#fca5a5',
                                        flexShrink: 0,
                                      }}
                                    />
                                  )}
                                  <span className="truncate">{item.gdrive_file_name}</span>
                                </p>
                                {item.error_message && (
                                  <p
                                    style={{
                                      fontSize: 12,
                                      color: '#fca5a5',
                                      marginTop: 3,
                                      marginLeft: 19,
                                    }}
                                  >
                                    {item.error_message}
                                  </p>
                                )}
                              </div>
                              <p
                                className="cloud-text-dim"
                                style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                              >
                                {formatDate(item.imported_at)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {}
        {isAuthenticated && !isEditing && <NamingPattern />}

        {}
        {isAuthenticated && !isEditing && (
          <DriveOrganizer rootWatched={isRootWatched} />
        )}

        {}
        {isAuthenticated && hasWatchedFolders && !isEditing && <ScheduleConfig />}
      </div>
    </div>
  );
}
