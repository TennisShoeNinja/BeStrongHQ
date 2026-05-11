'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Users,
  Trophy,
  AlertCircle,
  CheckCircle,
  Clock,
  Plane,
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
  type LucideIcon,
} from 'lucide-react';
import apiClient from '@/lib/api';
import { useAuth } from '@/lib/auth-provider';
import { MobileHome } from '@/components/mobile-home';
import { StatTile, StatTileSkeleton } from '@/components/stat-tile';
import { EmptyState } from '@/components/empty-state';


const weatherCodeMap: Record<number, { Icon: LucideIcon; description: string }> = {
  0: { Icon: Sun, description: 'Clear sky' },
  1: { Icon: Sun, description: 'Mainly clear' },
  2: { Icon: CloudSun, description: 'Partly cloudy' },
  3: { Icon: Cloud, description: 'Overcast' },
  45: { Icon: CloudFog, description: 'Foggy' },
  48: { Icon: CloudFog, description: 'Depositing rime fog' },
  51: { Icon: CloudDrizzle, description: 'Light drizzle' },
  53: { Icon: CloudDrizzle, description: 'Moderate drizzle' },
  55: { Icon: CloudDrizzle, description: 'Dense drizzle' },
  61: { Icon: CloudRain, description: 'Slight rain' },
  63: { Icon: CloudRain, description: 'Moderate rain' },
  65: { Icon: CloudRain, description: 'Heavy rain' },
  71: { Icon: CloudSnow, description: 'Slight snow' },
  73: { Icon: CloudSnow, description: 'Moderate snow' },
  75: { Icon: CloudSnow, description: 'Heavy snow' },
  80: { Icon: CloudRain, description: 'Slight rain showers' },
  81: { Icon: CloudRain, description: 'Moderate rain showers' },
  82: { Icon: CloudRain, description: 'Violent rain showers' },
  85: { Icon: CloudSnow, description: 'Slight snow showers' },
  86: { Icon: CloudSnow, description: 'Heavy snow showers' },
  95: { Icon: CloudLightning, description: 'Thunderstorm' },
  96: { Icon: CloudLightning, description: 'Thunderstorm with hail' },
  99: { Icon: CloudLightning, description: 'Thunderstorm with hail' },
};

const FALLBACK_WEATHER = { Icon: CloudSun, description: 'Unknown' };

interface WeatherData {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    weather_code: number;
  };
  daily: {
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
}

function formatCompactDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatDate(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  };
  return date.toLocaleDateString('en-US', options);
}

function getTimeOfDay(hour: number): string {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function calculateDaysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(dateStr + 'T00:00:00');
  targetDate.setHours(0, 0, 0, 0);
  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function getDueType(
  daysUntilDue: number | null | undefined
): 'overdue' | 'urgent' | 'normal' {
  if (daysUntilDue === null || daysUntilDue === undefined) return 'normal';
  if (daysUntilDue < 0) return 'overdue';
  if (daysUntilDue <= 3) return 'urgent';
  return 'normal';
}


const MICRO_LABEL: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--cloud-text-muted)',
  fontWeight: 500,
};

const BIG_STAT: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 600,
  letterSpacing: '-0.02em',
  color: 'var(--cloud-text)',
  lineHeight: 1.05,
};

function ProgramsDueSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 60,
            background: 'var(--cloud-panel)',
            border: '1px solid var(--cloud-border)',
            borderRadius: 10,
          }}
        />
      ))}
    </div>
  );
}

function MeetsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 140,
            background: 'var(--cloud-panel)',
            border: '1px solid var(--cloud-border)',
            borderRadius: 10,
          }}
        />
      ))}
    </div>
  );
}

export default function Home() {
  const [currentHour, setCurrentHour] = useState(0);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setCurrentHour(new Date().getHours());
    setCurrentDate(new Date());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const timeOfDay = getTimeOfDay(currentHour);

  const { instance } = useAuth();


  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });

  const coachName = settings?.coach_display_name || 'Coach';
  const coachFirstName = coachName.split(/\s+/)[0];
  const teamName = instance?.org_name || 'BeStrong';
  const compactDate = formatCompactDate(currentDate);

  
  const {
    data: athletes = [],
    isLoading: athletesLoading,
  } = useQuery({
    queryKey: ['athletes'],
    queryFn: () => apiClient.listAthletes(),
  });

  
  const {
    data: meets = [],
    isLoading: meetsLoading,
    error: meetsError,
  } = useQuery({
    queryKey: ['meets'],
    queryFn: () => apiClient.listMeets(),
  });

  
  const {
    data: notifications = [],
    isLoading: notificationsLoading,
  } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiClient.listNotifications(false),
  });

  
  const { data: weather, isLoading: weatherLoading } = useQuery({
    queryKey: ['weather', settings?.weather_lat, settings?.weather_lon],
    queryFn: async () => {
      const lat = settings?.weather_lat || '29.7604';
      const lon = settings?.weather_lon || '-95.3698';
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=${encodeURIComponent(tz)}&forecast_days=7`
      );
      return response.json() as Promise<WeatherData>;
    },
    enabled: !!settings,
  });

  
  const activeAthletes = athletes.filter((a) => !a.archived);
  
  
  const programsDue = (() => {
    const seen = new Set<number>();
    return notifications
      .filter((n) => n.notification_type === 'program_due')
      .map((n) => {
        const daysUntilDue = calculateDaysUntil(n.due_date);
        return {
          notificationId: n.id,
          athleteId: n.athlete_id,
          name: n.athlete_name || 'Unknown',
          program_due: n.due_date,
          daysUntilDue,
          isDueType: getDueType(daysUntilDue),
        };
      })
      .filter((item) => {
        if (seen.has(item.athleteId)) return false;
        seen.add(item.athleteId);
        return true;
      })
      .sort((a, b) => (a.daysUntilDue ?? 999) - (b.daysUntilDue ?? 999));
  })();

  const upcomingMeets = meets
    .filter((m) => {
      if (!m.meet_date) return false;
      
      const endDate = m.meet_date_end || m.meet_date;
      const daysUntilEnd = calculateDaysUntil(endDate);
      return daysUntilEnd !== null && daysUntilEnd >= 0;
    })
    .sort((a, b) => {
      if (!a.meet_date || !b.meet_date) return 0;
      return new Date(a.meet_date + 'T00:00:00').getTime() - new Date(b.meet_date + 'T00:00:00').getTime();
    })
    .slice(0, 5);

  
  
  
  
  
  
  
  const currentlyOut = activeAthletes.filter((a) => {
    const status = (a.availability_status ?? '').toLowerCase();
    return status.startsWith('out, back');
  });

  const currentWeather = weather?.current;

  return (
    <>
      <div className="md:hidden">
        <MobileHome />
      </div>
      <div className="hidden md:block" style={{ padding: 'var(--cloud-s5)' }}>
        <div className="flex flex-col" style={{ gap: 'var(--cloud-s5)' }}>
          {}
        <div style={{ position: 'relative' }}>
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: -120,
              left: -80,
              width: 520,
              height: 360,
              background:
                'radial-gradient(ellipse 50% 50% at 30% 60%, rgba(12, 92, 171, 0.20) 0%, transparent 65%)',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
          <p
            className="cloud-eyebrow"
            style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}
          >
            <span>{teamName}</span>
            <span
              aria-hidden
              style={{
                width: 3,
                height: 3,
                borderRadius: '50%',
                background: 'var(--cloud-text-dim)',
                display: 'inline-block',
              }}
            />
            <span style={{ color: 'var(--cloud-text-dim)' }}>{compactDate}</span>
          </p>
          <h1
            className="font-semibold cloud-text"
            style={{ fontSize: 32, letterSpacing: '-0.03em', lineHeight: 1.1 }}
          >
            {timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1)},{' '}
            <span className="cloud-text-grad-blue">{coachFirstName}</span>.
          </h1>
          <div
            className="flex flex-wrap items-center cloud-text-muted"
            style={{ gap: 8, fontSize: 13, marginTop: 6 }}
          >
            {/* Date moved to the eyebrow above; weather row now leads with location. */}
            {currentWeather && !weatherLoading && (() => {
              const info = weatherCodeMap[currentWeather.weather_code] || FALLBACK_WEATHER;
              const Icon = info.Icon;
              return (
                <>
                  <span>{settings?.weather_city || 'Houston, TX'}</span>
                  <span className="cloud-text-dim" aria-hidden>·</span>
                  <span className="flex items-center" style={{ gap: 6 }}>
                    <Icon
                      style={{
                        width: 14,
                        height: 14,
                        color: 'var(--cloud-text-muted)',
                        strokeWidth: 1.8,
                      }}
                    />
                    <span className="cloud-text" style={{ fontWeight: 500 }}>
                      {Math.round(currentWeather.temperature_2m)}°F
                    </span>
                    <span>{info.description.toLowerCase()}</span>
                  </span>
                  <span className="cloud-text-dim hidden md:inline" aria-hidden>·</span>
                  <span className="hidden md:inline">feels {Math.round(currentWeather.apparent_temperature)}°</span>
                  <span className="cloud-text-dim hidden md:inline" aria-hidden>·</span>
                  <span className="hidden md:inline">{currentWeather.relative_humidity_2m}% humidity</span>
                </>
              );
            })()}
          </div>
        </div>

        {}
        <div className="grid grid-cols-1 lg:grid-cols-3" style={{ gap: 'var(--cloud-s5)' }}>
          {}
          <div className="lg:col-span-2 flex flex-col" style={{ gap: 12 }}>
            <div>
              <h2
                className="cloud-eyebrow"
                style={{ margin: 0 }}
              >
                Programs due soon
              </h2>
              <p className="cloud-text-muted" style={{ fontSize: 13, marginTop: 2 }}>
                Pulled from your inbox · respects each athlete&apos;s reminder window
              </p>
            </div>

            {notificationsLoading ? (
              <ProgramsDueSkeleton />
            ) : programsDue.length === 0 ? (
              <EmptyState
                icon={CheckCircle}
                iconTone="success"
                body="No programs due soon. You're all caught up."
              />
            ) : (
              <div className="flex flex-col" style={{ gap: 8 }}>
                {programsDue.map((athlete) => {
                  const daysUntil = athlete.daysUntilDue ?? 0;
                  const tint =
                    athlete.isDueType === 'overdue'
                      ? { bg: 'rgba(239, 68, 68, 0.06)', border: 'rgba(239, 68, 68, 0.28)', text: '#fca5a5' }
                      : athlete.isDueType === 'urgent'
                        ? { bg: 'rgba(249, 115, 22, 0.06)', border: 'rgba(249, 115, 22, 0.28)', text: '#fdba74' }
                        : { bg: 'rgba(34, 197, 94, 0.05)', border: 'rgba(34, 197, 94, 0.22)', text: '#86efac' };
                  const icon =
                    athlete.isDueType === 'overdue' ? (
                      <AlertCircle style={{ width: 16, height: 16 }} />
                    ) : athlete.isDueType === 'urgent' ? (
                      <Clock style={{ width: 16, height: 16 }} />
                    ) : (
                      <CheckCircle style={{ width: 16, height: 16 }} />
                    );

                  return (
                    <Link
                      key={athlete.notificationId}
                      href={`/athletes/${athlete.athleteId}`}
                      className="block"
                      style={{
                        background: tint.bg,
                        border: `1px solid ${tint.border}`,
                        borderRadius: 10,
                        padding: '12px 14px',
                        transition: 'background 0.1s',
                      }}
                    >
                      <div className="flex items-center justify-between" style={{ gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          <div
                            className="cloud-text"
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              letterSpacing: '-0.005em',
                            }}
                          >
                            {athlete.name}
                          </div>
                          <div
                            className="cloud-text-dim"
                            style={{ fontSize: 12, marginTop: 2 }}
                          >
                            {athlete.program_due
                              ? new Date(athlete.program_due).toLocaleDateString(
                                  'en-US',
                                  { weekday: 'short', month: 'short', day: 'numeric' }
                                )
                              : 'No date set'}
                          </div>
                        </div>
                        <div className="flex items-center" style={{ gap: 8, color: tint.text }}>
                          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>
                            {daysUntil < 0
                              ? `${Math.abs(daysUntil)}d late`
                              : daysUntil === 0
                                ? 'Today'
                                : `${daysUntil}d`}
                          </span>
                          {icon}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {}
          <div className="flex flex-col" style={{ gap: 12 }}>
            <div>
              <h2
                className="cloud-eyebrow"
                style={{ margin: 0 }}
              >
                Quick stats
              </h2>
              <p className="cloud-text-muted" style={{ fontSize: 13, marginTop: 2 }}>
                At-a-glance roster health
              </p>
            </div>

            <div className="flex flex-col" style={{ gap: 8 }}>
              {athletesLoading ? (
                <>
                  <StatTileSkeleton />
                  <StatTileSkeleton />
                  <StatTileSkeleton />
                </>
              ) : (
                <>
                  <StatTile
                    href="/athletes"
                    label="Active athletes"
                    value={activeAthletes.length}
                    icon={<Users style={{ width: 16, height: 16, color: '#60a5fa' }} />}
                    iconTint="rgba(96, 165, 250, 0.12)"
                    // TODO: wire to a weekly active-athletes history endpoint.
                    sparkPoints={[5, 6, 5, 7, 6, 8, 7, 9]}
                    sparkTone="primary"
                  />
                  <StatTile
                    href="/meets"
                    label="Upcoming meets"
                    value={upcomingMeets.length}
                    icon={<Trophy style={{ width: 16, height: 16, color: '#facc15' }} />}
                    iconTint="rgba(250, 204, 21, 0.12)"
                    // TODO: wire to upcoming-meets-by-week history.
                    sparkPoints={[1, 2, 1, 2, 3, 2, 3, 3]}
                    sparkTone="warning"
                  />
                  <StatTile
                    href="/athletes?view=Availability"
                    label="Unavailable"
                    value={currentlyOut.length}
                    icon={<Plane style={{ width: 16, height: 16, color: '#c084fc' }} />}
                    iconTint="rgba(192, 132, 252, 0.12)"
                    // TODO: wire to unavailable-history endpoint.
                    sparkPoints={[2, 1, 2, 1, 1, 2, 1, 1]}
                    sparkTone="danger"
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {}
        <div className="flex flex-col" style={{ gap: 12 }}>
          <div>
            <h2
              className="cloud-eyebrow"
              style={{ margin: 0 }}
            >
              Upcoming meets
            </h2>
            <p className="cloud-text-muted" style={{ fontSize: 13, marginTop: 2 }}>
              Next competitions on the calendar
            </p>
          </div>

          {meetsLoading ? (
            <MeetsSkeleton />
          ) : meetsError ? (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.28)',
                borderRadius: 10,
                padding: 14,
                color: '#fca5a5',
                fontSize: 13,
              }}
            >
              Failed to load meets
            </div>
          ) : upcomingMeets.length === 0 ? (
            <EmptyState
              icon={Trophy}
              iconTone="muted"
              body="No upcoming meets scheduled."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {upcomingMeets.map((meet) => {
                const daysUntil = meet.meet_date
                  ? calculateDaysUntil(meet.meet_date)
                  : null;
                const weeksUntil =
                  daysUntil !== null ? Math.floor(daysUntil / 7) : null;
                const meetAthletes = activeAthletes.filter(
                  (a) => a.next_meet_id === meet.id
                );

                return (
                  <Link
                    key={meet.id}
                    href={`/meets?id=${meet.id}`}
                    className="block cloud-panel"
                    style={{
                      padding: 16,
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--cloud-border-strong)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--cloud-border)';
                    }}
                  >
                    <div style={{ marginBottom: 14 }}>
                      <div
                        className="cloud-text"
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          letterSpacing: '-0.01em',
                          lineHeight: 1.25,
                        }}
                      >
                        {meet.name}
                      </div>
                      <div
                        className="cloud-text-dim"
                        style={{ fontSize: 12, marginTop: 2 }}
                      >
                        {meet.federation || 'No federation'}
                      </div>
                    </div>

                    <div className="flex flex-col" style={{ gap: 8 }}>
                      {meet.meet_date && (
                        <div
                          className="flex items-center justify-between"
                          style={{ fontSize: 12 }}
                        >
                          <span style={MICRO_LABEL}>Date</span>
                          <span className="cloud-text" style={{ fontWeight: 500 }}>
                            {new Date(meet.meet_date + 'T00:00:00').toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                      )}

                      {weeksUntil !== null && (
                        <div
                          className="flex items-center justify-between"
                          style={{ fontSize: 12 }}
                        >
                          <span style={MICRO_LABEL}>In</span>
                          <span
                            style={{
                              fontWeight: 600,
                              letterSpacing: '-0.005em',
                              color:
                                weeksUntil <= 2
                                  ? '#fdba74'
                                  : '#86efac',
                            }}
                          >
                            {weeksUntil === 0
                              ? `${daysUntil}d`
                              : `${weeksUntil}w`}
                          </span>
                        </div>
                      )}

                      {meetAthletes.length > 0 ? (
                        <div style={{ marginTop: 4 }}>
                          <div style={{ ...MICRO_LABEL, marginBottom: 6 }}>
                            Athletes
                          </div>
                          <div className="flex flex-wrap" style={{ gap: 4 }}>
                            {meetAthletes.map((a) => (
                              <button
                                key={a.id}
                                style={{
                                  background: 'var(--cloud-surface-raised)',
                                  border: '1px solid var(--cloud-border)',
                                  color: 'var(--cloud-text-muted)',
                                  fontSize: 11,
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  cursor: 'pointer',
                                  transition: 'color 0.15s, border-color 0.15s',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = 'var(--cloud-text)';
                                  e.currentTarget.style.borderColor = 'var(--cloud-border-strong)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = 'var(--cloud-text-muted)';
                                  e.currentTarget.style.borderColor = 'var(--cloud-border)';
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  window.location.href = `/athletes/${a.id}`;
                                }}
                              >
                                {a.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#fdba74' }}>
                          No athletes assigned
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
