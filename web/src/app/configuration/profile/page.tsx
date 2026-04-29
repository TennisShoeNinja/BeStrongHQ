'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  Cloud,
  ExternalLink,
  Loader2,
  Save,
  X,
} from 'lucide-react';
import Link from 'next/link';
import apiClient from '@/lib/api';
import {
  FIELD_LABEL,
  INPUT_STYLE,
  MICRO_LABEL,
  PageShell,
  SectionPanel,
} from '../_shared';

type ProfileDraft = {
  team_name?: string;
  coach_display_name?: string;
  weather_city?: string;
  weather_lat?: string;
  weather_lon?: string;
};

export default function ProfileConfigurationPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ProfileDraft>({});
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });

  const { data: syncSchedule } = useQuery({
    queryKey: ['gdrive-schedule'],
    queryFn: () => apiClient.getSyncSchedule(),
  });

  
  
  
  
  const teamName = draft.team_name ?? settings?.['team_name'] ?? '';
  const displayName =
    draft.coach_display_name ?? settings?.['coach_display_name'] ?? '';
  const weatherCity = draft.weather_city ?? settings?.['weather_city'] ?? '';
  const weatherLat = draft.weather_lat ?? settings?.['weather_lat'] ?? '';
  const weatherLon = draft.weather_lon ?? settings?.['weather_lon'] ?? '';
  const dirty = Object.keys(draft).length > 0;

  const updateDraft = (patch: ProfileDraft) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const saveMutation = useMutation({
    mutationFn: (updated: Record<string, string | null>) =>
      apiClient.updateSettings(updated),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setDraft({});
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      team_name: teamName,
      coach_display_name: displayName,
      weather_city: weatherCity,
      weather_lat: weatherLat,
      weather_lon: weatherLon,
    });
  };

  const formatSyncInterval = (minutes: number): string => {
    if (minutes <= 0) return 'Off';
    if (minutes < 60) return `Every ${minutes} minutes`;
    if (minutes === 60) return 'Every hour';
    if (minutes < 1440) return `Every ${minutes / 60} hours`;
    return 'Once a day';
  };

  const saveButton = (
    <button
      onClick={handleSave}
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
      title="Profile"
      subtitle="Coach identity and weather location"
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
          Loading profile…
        </div>
      ) : (
        <>
          <SectionPanel title="Coach profile">
            <div className="flex flex-col" style={{ gap: 16 }}>
              <div>
                <label className="cloud-text" style={FIELD_LABEL}>
                  Team name
                </label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => {
                    updateDraft({ team_name: e.target.value });
                  }}
                  placeholder="e.g., BeStrong"
                  style={INPUT_STYLE}
                />
                <p
                  className="cloud-text-muted"
                  style={{ fontSize: 11, marginTop: 6, lineHeight: 1.55 }}
                >
                  Shown on the login page and under the sidebar lockup
                </p>
              </div>
              <div>
                <label className="cloud-text" style={FIELD_LABEL}>
                  Display name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => {
                    updateDraft({ coach_display_name: e.target.value });
                  }}
                  placeholder="e.g., Coach Smith"
                  style={INPUT_STYLE}
                />
                <p
                  className="cloud-text-muted"
                  style={{ fontSize: 11, marginTop: 6, lineHeight: 1.55 }}
                >
                  Shown in your dashboard greeting
                </p>
              </div>

              <div
                style={{
                  paddingTop: 16,
                  borderTop: '1px solid var(--cloud-border)',
                }}
              >
                <label
                  className="cloud-text"
                  style={{ ...FIELD_LABEL, marginBottom: 10 }}
                >
                  Weather location
                </label>
                <div className="flex flex-col" style={{ gap: 10 }}>
                  <div>
                    <label
                      className="cloud-text-muted"
                      style={{
                        ...MICRO_LABEL,
                        display: 'block',
                        marginBottom: 4,
                      }}
                    >
                      City
                    </label>
                    <input
                      type="text"
                      value={weatherCity}
                      onChange={(e) => {
                        updateDraft({ weather_city: e.target.value });
                      }}
                      placeholder="e.g., Houston, TX"
                      style={INPUT_STYLE}
                    />
                  </div>
                  <div
                    className="grid"
                    style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}
                  >
                    <div>
                      <label
                        className="cloud-text-muted"
                        style={{
                          ...MICRO_LABEL,
                          display: 'block',
                          marginBottom: 4,
                        }}
                      >
                        Latitude
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        value={weatherLat}
                        onChange={(e) => {
                          updateDraft({ weather_lat: e.target.value });
                        }}
                        placeholder="29.7604"
                        style={INPUT_STYLE}
                      />
                    </div>
                    <div>
                      <label
                        className="cloud-text-muted"
                        style={{
                          ...MICRO_LABEL,
                          display: 'block',
                          marginBottom: 4,
                        }}
                      >
                        Longitude
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        value={weatherLon}
                        onChange={(e) => {
                          updateDraft({ weather_lon: e.target.value });
                        }}
                        placeholder="-95.3698"
                        style={INPUT_STYLE}
                      />
                    </div>
                  </div>
                </div>
                <p
                  className="cloud-text-muted"
                  style={{ fontSize: 11, marginTop: 8, lineHeight: 1.55 }}
                >
                  Used for the dashboard weather widget. Find coordinates at{' '}
                  <span
                    style={{
                      fontFamily:
                        'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}
                  >
                    latlong.net
                  </span>
                </p>
              </div>
            </div>
          </SectionPanel>

          <SectionPanel
            title="Google Drive auto-sync"
            icon={
              <Cloud style={{ width: 16, height: 16, color: '#67e8f9' }} />
            }
            right={
              <Link
                href="/integrations/google-drive"
                className="flex items-center"
                style={{
                  fontSize: 11,
                  color: '#67e8f9',
                  gap: 4,
                  textDecoration: 'none',
                }}
              >
                Configure
                <ExternalLink style={{ width: 11, height: 11 }} />
              </Link>
            }
          >
            {syncSchedule?.running_now ? (
              <div
                className="flex items-center"
                style={{ gap: 8, color: '#67e8f9', fontSize: 13 }}
              >
                <Loader2
                  className="animate-spin"
                  style={{ width: 14, height: 14 }}
                />
                Syncing now…
              </div>
            ) : syncSchedule?.enabled ? (
              <div className="flex flex-col" style={{ gap: 4 }}>
                <div
                  className="flex items-center"
                  style={{ gap: 8, color: '#4ade80', fontSize: 13 }}
                >
                  <Check style={{ width: 14, height: 14 }} />
                  Active: {formatSyncInterval(syncSchedule.interval_minutes)}
                </div>
                {syncSchedule.last_run && (
                  <p
                    className="cloud-text-muted"
                    style={{ fontSize: 11, marginLeft: 22 }}
                  >
                    Last run: {new Date(syncSchedule.last_run).toLocaleString()}
                  </p>
                )}
              </div>
            ) : (
              <div
                className="flex items-center cloud-text-muted"
                style={{ gap: 8, fontSize: 13 }}
              >
                <X style={{ width: 14, height: 14 }} />
                Auto-sync is off
              </div>
            )}
          </SectionPanel>
        </>
      )}
    </PageShell>
  );
}
