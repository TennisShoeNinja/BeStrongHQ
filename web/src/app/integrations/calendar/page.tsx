'use client';

import { type CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  Check,
  Loader2,
  XCircle,
  Calendar,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import apiClient from '@/lib/api';
import { useNow } from '@/lib/use-now';

const MICRO_LABEL: CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontWeight: 500,
};

type SyncOptionsState = {
  meets: boolean;
  programs: boolean;
  availability: boolean;
  birthdays: boolean;
};

const SYNC_OPTION_DEFAULTS: SyncOptionsState = {
  meets: true,
  programs: true,
  availability: false,
  birthdays: false,
};

const SYNC_OPTION_LABELS: {
  key: keyof SyncOptionsState;
  title: string;
  hint: string;
}[] = [
  {
    key: 'meets',
    title: 'Meets',
    hint: 'All-day event with federation, location, LiftingCast link, and competing roster. Past meets aren’t synced.',
  },
  {
    key: 'programs',
    title: 'Program due dates',
    hint: 'One event per athlete on the day their next program is due. Updates automatically when you change the date.',
  },
  {
    key: 'availability',
    title: 'Availability',
    hint: 'Athlete time off shown as a date range so you can see who is out of training at a glance. Past windows are skipped automatically.',
  },
  {
    key: 'birthdays',
    title: 'Birthdays',
    hint: 'One yearly recurring event per athlete on their date of birth.',
  },
];

export default function CalendarIntegrationPage() {
  const queryClient = useQueryClient();
  const now = useNow();

  const authQuery = useQuery({
    queryKey: ['calendar', 'auth'],
    queryFn: () => apiClient.getCalendarAuthStatus(),
  });

  const calendarsQuery = useQuery({
    queryKey: ['calendar', 'calendars'],
    queryFn: () => apiClient.listCalendars(),
    enabled: authQuery.data?.is_authenticated ?? false,
  });

  const selectedQuery = useQuery({
    queryKey: ['calendar', 'selected'],
    queryFn: () => apiClient.getSelectedCalendar(),
    enabled: authQuery.data?.is_authenticated ?? false,
  });

  const previewQuery = useQuery({
    queryKey: ['calendar', 'sync-preview'],
    queryFn: () => apiClient.getCalendarSyncPreview(),
    enabled: authQuery.data?.is_authenticated ?? false,
  });

  const errorsQuery = useQuery({
    queryKey: ['calendar', 'sync-errors'],
    queryFn: () => apiClient.getCalendarSyncErrors(),
    enabled: authQuery.data?.is_authenticated ?? false,
  });

  const syncOptionsQuery = useQuery({
    queryKey: ['calendar', 'sync-options'],
    queryFn: () => apiClient.getCalendarSyncOptions(),
    enabled: authQuery.data?.is_authenticated ?? false,
  });

  
  
  
  
  

  const setCalendarMutation = useMutation({
    mutationFn: (calendarId: string) =>
      apiClient.setSelectedCalendar(calendarId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', 'selected'] });
    },
  });

  
  
  
  const setSyncOptionsMutation = useMutation({
    mutationFn: (next: SyncOptionsState) =>
      apiClient.setCalendarSyncOptions(next),
    onSuccess: (saved) => {
      queryClient.setQueryData(['calendar', 'sync-options'], saved);
    },
  });

  const ensureMutation = useMutation({
    mutationFn: () => apiClient.ensureBeStrongHQCalendar(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', 'calendars'] });
      queryClient.invalidateQueries({ queryKey: ['calendar', 'selected'] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => apiClient.syncCalendar(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', 'sync-preview'] });
      queryClient.invalidateQueries({ queryKey: ['calendar', 'sync-errors'] });
    },
  });

  const dismissErrorsMutation = useMutation({
    mutationFn: () => apiClient.clearCalendarSyncErrors(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', 'sync-errors'] });
    },
  });

  const auth = authQuery.data;
  const calendars = calendarsQuery.data ?? [];
  const selectedCalendarId = selectedQuery.data?.calendar_id ?? 'primary';
  const preview = previewQuery.data;
  const meetCount = preview?.meets ?? 0;
  const programCount = preview?.programs ?? 0;
  const availabilityCount = preview?.availability ?? 0;
  const birthdayCount = preview?.birthdays ?? 0;
  const syncErrors = errorsQuery.data?.errors ?? [];

  const syncOptions: SyncOptionsState =
    syncOptionsQuery.data ?? SYNC_OPTION_DEFAULTS;

  const toggleSyncOption = (key: keyof SyncOptionsState) => {
    const next: SyncOptionsState = { ...syncOptions, [key]: !syncOptions[key] };
    
    
    queryClient.setQueryData(['calendar', 'sync-options'], next);
    setSyncOptionsMutation.mutate(next);
  };

  const hasBeStrongHQ = calendars.some((c) => c.name === 'BeStrongHQ');

  return (
    <div className="min-h-screen">
      <div
        className="mx-auto"
        style={{
          maxWidth: 720,
          padding: 'var(--cloud-s5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--cloud-s4)',
        }}
      >
        {}
        <div>
          <Link
            href="/integrations/google-drive"
            className="flex items-center cloud-text-muted"
            style={{
              gap: 4,
              fontSize: 13,
              textDecoration: 'none',
              marginBottom: 12,
            }}
          >
            <ChevronLeft style={{ width: 14, height: 14 }} />
            Integrations
          </Link>
          <div className="flex items-center" style={{ gap: 12 }}>
            <Calendar
              style={{ width: 22, height: 22, color: '#fb923c', strokeWidth: 1.8 }}
            />
            <h1
              className="cloud-text"
              style={{
                fontSize: 28,
                fontWeight: 600,
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
              }}
            >
              Google Calendar
            </h1>
          </div>
          <p
            className="cloud-text-muted"
            style={{ fontSize: 13, marginTop: 8, marginLeft: 34 }}
          >
            Push meet dates and program-due reminders to a dedicated
            BeStrongHQ calendar on your Google account.
          </p>
        </div>

        {}
        {authQuery.isLoading ? (
          <div className="cloud-panel" style={{ padding: 24 }}>
            <div
              className="flex items-center cloud-text-muted"
              style={{ gap: 10, fontSize: 13 }}
            >
              <Loader2
                className="animate-spin"
                style={{ width: 16, height: 16, color: '#67e8f9' }}
              />
              Checking authentication…
            </div>
          </div>
        ) : auth ? (
          <div
            className="cloud-panel"
            style={
              auth.is_authenticated
                ? {
                    padding: 24,
                    borderColor: 'rgba(34, 197, 94, 0.4)',
                    backgroundColor: 'rgba(34, 197, 94, 0.05)',
                  }
                : { padding: 24 }
            }
          >
            <div
              className="flex items-start justify-between"
              style={{ gap: 16 }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3
                  className="cloud-text"
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    marginBottom: 10,
                    letterSpacing: '-0.01em',
                  }}
                >
                  Connection status
                </h3>
                {auth.is_authenticated ? (
                  <div className="flex flex-col" style={{ gap: 8 }}>
                    <div
                      className="flex items-center"
                      style={{ gap: 8, color: '#4ade80', fontSize: 13 }}
                    >
                      <Check style={{ width: 14, height: 14 }} />
                      Connected via your Google account
                    </div>
                    <Link
                      href="/integrations/google-drive"
                      className="cloud-text-muted"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 12,
                        textDecoration: 'none',
                      }}
                    >
                      Manage connection on the Google integration page
                      <ChevronRight style={{ width: 12, height: 12 }} />
                    </Link>
                  </div>
                ) : (
                  <div className="flex flex-col" style={{ gap: 12 }}>
                    <div
                      className="flex items-center"
                      style={{ gap: 8, color: '#fbbf24', fontSize: 13 }}
                    >
                      <AlertCircle style={{ width: 14, height: 14 }} />
                      Not connected
                    </div>
                    <p
                      className="cloud-text-muted"
                      style={{ fontSize: 12, lineHeight: 1.55 }}
                    >
                      Calendar sync uses the same Google account as Drive
                      sync. Connect your Google account on the Drive
                      integration page to enable both at once.
                    </p>
                    <Link
                      href="/integrations/google-drive"
                      className="cloud-btn cloud-btn-primary"
                      style={{
                        alignSelf: 'flex-start',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      Open Google integration
                      <ChevronRight style={{ width: 14, height: 14 }} />
                    </Link>
                  </div>
                )}
              </div>
              {auth.is_authenticated && (
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 500,
                    backgroundColor: 'rgba(34, 197, 94, 0.16)',
                    color: '#86efac',
                    border: '1px solid rgba(34, 197, 94, 0.4)',
                    flexShrink: 0,
                  }}
                >
                  Active
                </span>
              )}
            </div>
          </div>
        ) : null}

        {}
        {auth?.is_authenticated && (
          <div className="cloud-panel" style={{ padding: 24 }}>
            <div
              className="flex items-center justify-between"
              style={{ marginBottom: 6 }}
            >
              <h3
                className="cloud-text"
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                }}
              >
                Select calendar
              </h3>
              {!hasBeStrongHQ && !calendarsQuery.isLoading && (
                <button
                  onClick={() => ensureMutation.mutate()}
                  disabled={ensureMutation.isPending}
                  className="cloud-btn"
                  style={{
                    fontSize: 12,
                    padding: '6px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {ensureMutation.isPending ? (
                    <Loader2
                      className="animate-spin"
                      style={{ width: 12, height: 12 }}
                    />
                  ) : (
                    <Sparkles style={{ width: 12, height: 12 }} />
                  )}
                  Create BeStrongHQ
                </button>
              )}
            </div>
            <p
              className="cloud-text-muted"
              style={{ fontSize: 13, marginBottom: 14, lineHeight: 1.55 }}
            >
              Sync writes to whichever calendar is selected. We recommend
              keeping it on a dedicated <strong>BeStrongHQ</strong> calendar
              so you can hide or share it independently of your personal
              schedule.
            </p>

            {calendarsQuery.isLoading ? (
              <div
                className="flex items-center cloud-text-muted"
                style={{ gap: 10, fontSize: 13 }}
              >
                <Loader2
                  className="animate-spin"
                  style={{ width: 14, height: 14, color: '#67e8f9' }}
                />
                Loading calendars…
              </div>
            ) : (
              <div className="flex flex-col" style={{ gap: 6 }}>
                {calendars.map((cal) => {
                  const isSelected = selectedCalendarId === cal.id;
                  const isBeStrongHQ = cal.name === 'BeStrongHQ';
                  return (
                    <button
                      key={cal.id}
                      onClick={() => setCalendarMutation.mutate(cal.id)}
                      style={{
                        textAlign: 'left',
                        padding: '10px 14px',
                        borderRadius: 8,
                        border: isSelected
                          ? '1px solid rgba(103, 232, 249, 0.5)'
                          : '1px solid var(--cloud-border)',
                        backgroundColor: isSelected
                          ? 'rgba(103, 232, 249, 0.08)'
                          : 'var(--cloud-surface-raised)',
                        color: 'var(--cloud-text)',
                        cursor: 'pointer',
                        transition: 'all 120ms ease',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          style={{ fontWeight: 500, fontSize: 13 }}
                        >
                          {cal.name}
                        </span>
                        <div
                          className="flex items-center"
                          style={{ gap: 8 }}
                        >
                          {isBeStrongHQ && (
                            <span
                              style={{
                                fontSize: 10,
                                padding: '2px 8px',
                                borderRadius: 999,
                                backgroundColor: 'rgba(251, 146, 60, 0.14)',
                                color: '#fb923c',
                                border: '1px solid rgba(251, 146, 60, 0.32)',
                                fontWeight: 500,
                              }}
                            >
                              Recommended
                            </span>
                          )}
                          {cal.primary && (
                            <span
                              style={{
                                fontSize: 10,
                                padding: '2px 8px',
                                borderRadius: 999,
                                backgroundColor: 'rgba(103, 232, 249, 0.12)',
                                color: '#67e8f9',
                                border:
                                  '1px solid rgba(103, 232, 249, 0.3)',
                                fontWeight: 500,
                              }}
                            >
                              Primary
                            </span>
                          )}
                          {isSelected && (
                            <Check
                              style={{
                                width: 14,
                                height: 14,
                                color: '#67e8f9',
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {}
        {auth?.is_authenticated && (
          <div className="cloud-panel" style={{ padding: 24 }}>
            <h3
              className="cloud-text"
              style={{
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 6,
                letterSpacing: '-0.01em',
              }}
            >
              What to sync
            </h3>
            <p
              className="cloud-text-muted"
              style={{ fontSize: 13, marginBottom: 14, lineHeight: 1.55 }}
            >
              Pick which categories of events get pushed to your Google
              Calendar. Unchecking a category stops adding new events.
              Events already on your calendar stay put. Remove them
              from your phone if you don&apos;t want them.
            </p>

            <div className="flex flex-col" style={{ gap: 8 }}>
              {SYNC_OPTION_LABELS.map(({ key, title, hint }) => {
                const checked = syncOptions[key];
                return (
                  <button
                    key={key}
                    onClick={() => toggleSyncOption(key)}
                    disabled={
                      setSyncOptionsMutation.isPending ||
                      syncOptionsQuery.isLoading
                    }
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderRadius: 8,
                      border: checked
                        ? '1px solid rgba(103, 232, 249, 0.5)'
                        : '1px solid var(--cloud-border)',
                      backgroundColor: checked
                        ? 'rgba(103, 232, 249, 0.06)'
                        : 'var(--cloud-surface-raised)',
                      color: 'var(--cloud-text)',
                      cursor: 'pointer',
                      transition: 'all 120ms ease',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        marginTop: 2,
                        border: checked
                          ? '1px solid #67e8f9'
                          : '1px solid var(--cloud-border)',
                        backgroundColor: checked ? '#67e8f9' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {checked && (
                        <Check
                          style={{
                            width: 12,
                            height: 12,
                            color: 'var(--cloud-surface-base, #0a0a0a)',
                          }}
                          strokeWidth={3}
                        />
                      )}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          marginBottom: 2,
                        }}
                      >
                        {title}
                      </div>
                      <div
                        className="cloud-text-muted"
                        style={{ fontSize: 12, lineHeight: 1.5 }}
                      >
                        {hint}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {}
        {auth?.is_authenticated && syncErrors.length > 0 && (
          <div
            className="cloud-panel"
            style={{
              padding: 20,
              borderColor: 'rgba(239, 68, 68, 0.4)',
              backgroundColor: 'rgba(239, 68, 68, 0.04)',
            }}
          >
            <div
              className="flex items-center justify-between"
              style={{ marginBottom: 10 }}
            >
              <div
                className="flex items-center"
                style={{ gap: 8 }}
              >
                <AlertTriangle
                  style={{ width: 16, height: 16, color: '#fca5a5' }}
                />
                <h3
                  className="cloud-text"
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                  }}
                >
                  Sync issues ({syncErrors.length})
                </h3>
              </div>
              <button
                onClick={() => dismissErrorsMutation.mutate()}
                disabled={dismissErrorsMutation.isPending}
                className="cloud-btn"
                style={{
                  fontSize: 11,
                  padding: '4px 10px',
                }}
              >
                Dismiss all
              </button>
            </div>
            <p
              className="cloud-text-muted"
              style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.55 }}
            >
              Items that failed to push to your calendar. Each entry clears
              automatically the next time that item syncs successfully.
            </p>
            <div
              className="cloud-thin-scroll flex flex-col"
              style={{ gap: 6, maxHeight: 240, overflowY: 'auto' }}
            >
              {syncErrors.map((err) => (
                <div
                  key={`${err.category}:${err.target_id}`}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    backgroundColor: 'rgba(239, 68, 68, 0.06)',
                    border: '1px solid rgba(239, 68, 68, 0.22)',
                  }}
                >
                  <div
                    className="flex items-center"
                    style={{
                      gap: 8,
                      fontSize: 12,
                      fontWeight: 500,
                      marginBottom: 2,
                    }}
                  >
                    <span
                      style={{
                        ...MICRO_LABEL,
                        color: '#fca5a5',
                        fontSize: 9,
                      }}
                    >
                      {err.category}
                    </span>
                    <span style={{ color: 'var(--cloud-text)' }}>
                      {err.label}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: '#fca5a5', opacity: 0.85 }}>
                    {err.message}
                  </p>
                  <p
                    className="cloud-text-muted"
                    style={{ fontSize: 10, marginTop: 4 }}
                  >
                    {formatErrorTime(err.occurred_at, now)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {}
        {auth?.is_authenticated && (
          <div className="cloud-panel" style={{ padding: 24 }}>
            <h3
              className="cloud-text"
              style={{
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 6,
                letterSpacing: '-0.01em',
              }}
            >
              Sync to Google Calendar
            </h3>
            <p
              className="cloud-text-muted"
              style={{ fontSize: 13, marginBottom: 14, lineHeight: 1.55 }}
            >
              Most of what you see below pushes automatically as you work:
              creating a meet, editing an athlete&apos;s program-due date,
              setting availability, or adding a date of birth all sync to
              your calendar in real time. Use this button to run a one-shot
              push of every eligible item, or to backfill after first
              connecting your calendar.
            </p>

            <div
              className="grid"
              style={{
                marginBottom: 14,
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 10,
              }}
            >
              <StatCard
                label="Meets ready"
                value={meetCount}
                color="#67e8f9"
              />
              <StatCard
                label="Program due dates ready"
                value={programCount}
                color="#fb923c"
              />
              <StatCard
                label="Availability ranges ready"
                value={availabilityCount}
                color="#a78bfa"
              />
              <StatCard
                label="Birthdays ready"
                value={birthdayCount}
                color="#f472b6"
              />
            </div>

            <button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="cloud-btn cloud-btn-primary"
              style={{ width: '100%' }}
            >
              {syncMutation.isPending ? (
                <>
                  <Loader2
                    className="animate-spin"
                    style={{ width: 14, height: 14, marginRight: 8 }}
                  />
                  Syncing…
                </>
              ) : (
                'Sync everything'
              )}
            </button>

            {syncMutation.isSuccess && syncMutation.data && (
              <div
                style={{
                  marginTop: 14,
                  padding: 14,
                  borderRadius: 8,
                  backgroundColor: 'rgba(34, 197, 94, 0.05)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
              >
                <div
                  className="flex items-center"
                  style={{
                    gap: 8,
                    color: '#4ade80',
                    fontSize: 13,
                    fontWeight: 500,
                    marginBottom: 10,
                  }}
                >
                  <Check style={{ width: 14, height: 14 }} />
                  Sync complete
                </div>
                {syncOptions.meets && (
                  <SyncSummaryRow
                    label="Meets"
                    created={syncMutation.data.meets.created}
                    updated={syncMutation.data.meets.updated}
                    errors={syncMutation.data.meets.errors}
                  />
                )}
                {syncOptions.programs && (
                  <SyncSummaryRow
                    label="Programs"
                    created={syncMutation.data.programs.created}
                    updated={syncMutation.data.programs.updated}
                    errors={syncMutation.data.programs.errors}
                  />
                )}
                {syncOptions.availability && (
                  <SyncSummaryRow
                    label="Availability"
                    created={syncMutation.data.availability.created}
                    updated={syncMutation.data.availability.updated}
                    errors={syncMutation.data.availability.errors}
                  />
                )}
                {syncOptions.birthdays && (
                  <SyncSummaryRow
                    label="Birthdays"
                    created={syncMutation.data.birthdays.created}
                    updated={syncMutation.data.birthdays.updated}
                    errors={syncMutation.data.birthdays.errors}
                  />
                )}
              </div>
            )}

            {syncMutation.isError && (
              <div
                className="flex items-start"
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: 'rgba(239, 68, 68, 0.06)',
                  border: '1px solid rgba(239, 68, 68, 0.28)',
                  gap: 10,
                }}
              >
                <XCircle
                  style={{
                    width: 14,
                    height: 14,
                    color: '#fca5a5',
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                />
                <div>
                  <p
                    style={{
                      color: '#fca5a5',
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    Sync failed
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: '#fca5a5',
                      opacity: 0.7,
                      marginTop: 4,
                    }}
                  >
                    {syncMutation.error instanceof Error
                      ? syncMutation.error.message
                      : 'Failed to sync to calendar'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {}
        {auth?.is_authenticated && (
          <div
            style={{
              padding: 20,
              borderRadius: 12,
              backgroundColor: 'rgba(103, 232, 249, 0.05)',
              border: '1px solid rgba(103, 232, 249, 0.25)',
            }}
          >
            <h3
              style={{
                ...MICRO_LABEL,
                color: '#67e8f9',
                marginBottom: 10,
              }}
            >
              What gets synced
            </h3>
            <ul
              style={{
                fontSize: 12,
                color: '#67e8f9',
                opacity: 0.85,
                lineHeight: 1.6,
                paddingLeft: 0,
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <li>
                <strong>Meets:</strong> all-day event with federation,
                location, LiftingCast link, and competing roster.
              </li>
              <li>
                <strong>Programs:</strong> one all-day event per athlete on
                their program-due date, refreshed automatically each time
                you change the date.
              </li>
              <li>
                <strong>Availability:</strong> athlete time-off ranges
                rendered as multi-day events so the team calendar shows
                who is out at a glance.
              </li>
              <li>
                <strong>Birthdays:</strong> a yearly recurring event per
                athlete on their date of birth.
              </li>
              <li>
                <strong>Cleanup:</strong> events stay on your calendar
                when you uncheck a category or remove the source data.
                Delete them from your phone if you want them gone.
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function formatErrorTime(iso: string, now: number): string {
  
  
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  const diffMs = now - parsed;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return new Date(parsed).toLocaleDateString();
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 8,
        backgroundColor: 'var(--cloud-surface-raised)',
        border: '1px solid var(--cloud-border)',
      }}
    >
      <p
        className="cloud-text-muted"
        style={{ ...MICRO_LABEL, marginBottom: 4 }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 22,
          fontWeight: 600,
          color,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </p>
    </div>
  );
}

function SyncSummaryRow({
  label,
  created,
  updated,
  errors,
}: {
  label: string;
  created: number;
  updated: number;
  errors: string[];
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        className="cloud-text-muted"
        style={{ ...MICRO_LABEL, marginBottom: 4 }}
      >
        {label}
      </div>
      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          fontSize: 12,
        }}
      >
        <div>
          <span className="cloud-text-muted">Created: </span>
          <span style={{ color: '#4ade80', fontWeight: 500 }}>{created}</span>
        </div>
        <div>
          <span className="cloud-text-muted">Updated: </span>
          <span style={{ color: '#67e8f9', fontWeight: 500 }}>{updated}</span>
        </div>
        <div>
          <span className="cloud-text-muted">Errors: </span>
          <span
            style={{
              color: errors.length > 0 ? '#fca5a5' : 'var(--cloud-text-muted)',
              fontWeight: 500,
            }}
          >
            {errors.length}
          </span>
        </div>
      </div>
      {errors.length > 0 && (
        <div
          className="cloud-thin-scroll"
          style={{
            marginTop: 8,
            padding: 10,
            borderRadius: 6,
            backgroundColor: 'rgba(239, 68, 68, 0.06)',
            border: '1px solid rgba(239, 68, 68, 0.28)',
            maxHeight: 96,
            overflowY: 'auto',
          }}
        >
          {errors.map((err, i) => (
            <p key={i} style={{ fontSize: 11, color: '#fca5a5' }}>
              {err}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
