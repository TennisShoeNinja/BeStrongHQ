'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ExternalLink,
  Link as LinkIcon,
  RefreshCw,
  Search,
  Trash2,
  Trophy,
} from 'lucide-react';
import apiClient from '@/lib/api';
import * as Types from '@/lib/types';
import {
  kgToLbs,
  resolveWeightUnit,
  useLocalWeightUnit,
  type WeightUnit,
} from '@/lib/units';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const PAGE_TITLE_STYLE: CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  letterSpacing: '-0.02em',
};

const SECTION_LABEL: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

function formatWeightCell(kg: number | null | undefined, unit: WeightUnit): string {
  if (kg == null) return '—';
  const value = unit === 'lbs' ? kgToLbs(kg) : kg;
  return `${Math.round(value)} ${unit}`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  // OPL dates are already ISO (YYYY-MM-DD). Render as-is to avoid TZ drift
  // from `new Date(d)` interpreting them as midnight UTC and then shifting.
  return d;
}

function CandidateRow({
  candidate,
  onPick,
  busy,
}: {
  candidate: Types.OplCandidate;
  onPick: (c: Types.OplCandidate) => void;
  busy: boolean;
}) {
  const meta = [
    candidate.federation,
    candidate.state || candidate.country,
    candidate.equipment,
    candidate.weight_class_lbs ? `${candidate.weight_class_lbs} lbs` : null,
    candidate.last_meet_date ? `last: ${candidate.last_meet_date}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className="cloud-panel"
      style={{
        padding: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="cloud-text" style={{ fontWeight: 600, fontSize: 14 }}>
          {candidate.name}
        </div>
        <div
          className="cloud-text-muted"
          style={{
            fontSize: 12,
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {meta || candidate.slug}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {candidate.best_total_lbs != null && (
          <Badge variant="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(candidate.best_total_lbs)} lbs
          </Badge>
        )}
        <Button size="sm" disabled={busy} onClick={() => onPick(candidate)}>
          Link
        </Button>
      </div>
    </div>
  );
}

function LinkedHeader({
  link,
  athleteName,
  onRefresh,
  onUnlink,
  refreshing,
  unlinking,
}: {
  link: Types.OplLinkInfo;
  athleteName: string | undefined;
  onRefresh: () => void;
  onUnlink: () => void;
  refreshing: boolean;
  unlinking: boolean;
}) {
  const lastSynced = link.last_synced_at
    ? new Date(link.last_synced_at).toLocaleString()
    : 'Never';
  return (
    <div
      className="cloud-panel"
      style={{
        padding: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="cloud-text-muted" style={{ ...SECTION_LABEL, marginBottom: 6 }}>
          Linked OpenPowerlifting profile
        </div>
        <div className="cloud-text" style={{ fontSize: 16, fontWeight: 600 }}>
          {link.display_name || athleteName || link.slug}
        </div>
        <a
          href={link.profile_url}
          target="_blank"
          rel="noopener noreferrer"
          className="cloud-text-muted"
          style={{
            fontSize: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 4,
          }}
        >
          openpowerlifting.org/u/{link.slug}
          <ExternalLink style={{ width: 12, height: 12 }} />
        </a>
        <div className="cloud-text-dim" style={{ fontSize: 11, marginTop: 6 }}>
          Last synced: {lastSynced}
          {link.last_sync_error && (
            <span style={{ color: '#f87171' }}> · {link.last_sync_error}</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing || unlinking}
        >
          <RefreshCw style={{ width: 14, height: 14, marginRight: 6 }} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onUnlink}
          disabled={refreshing || unlinking}
        >
          <Trash2 style={{ width: 14, height: 14, marginRight: 6 }} />
          {unlinking ? 'Unlinking…' : 'Unlink'}
        </Button>
      </div>
    </div>
  );
}

function MeetCardMobile({
  meet,
  unit,
}: {
  meet: Types.OplMeetResponse;
  unit: WeightUnit;
}) {
  return (
    <div className="cloud-panel" style={{ padding: 14 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
          marginBottom: 6,
        }}
      >
        <div className="cloud-text" style={{ fontSize: 13, fontWeight: 600 }}>
          {meet.meet_name || 'Unknown meet'}
        </div>
        <div
          className="cloud-text-muted"
          style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}
        >
          {formatDate(meet.meet_date)}
        </div>
      </div>
      <div className="cloud-text-muted" style={{ fontSize: 11, marginBottom: 10 }}>
        {[
          meet.federation,
          meet.equipment,
          meet.weight_class_kg ? `${meet.weight_class_kg} kg` : null,
          meet.place ? `Place ${meet.place}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || '—'}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 6,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {(
          [
            ['Squat', meet.squat_kg],
            ['Bench', meet.bench_kg],
            ['Deadlift', meet.deadlift_kg],
            ['Total', meet.total_kg],
          ] as const
        ).map(([label, value], i) => (
          <div key={label} style={{ minWidth: 0 }}>
            <div
              className="cloud-text-dim"
              style={{
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {label}
            </div>
            <div
              className="cloud-text"
              style={{
                fontSize: 13,
                fontWeight: i === 3 ? 600 : 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {formatWeightCell(value, unit)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MeetsTable({
  meets,
  unit,
}: {
  meets: Types.OplMeetResponse[];
  unit: WeightUnit;
}) {
  if (meets.length === 0) {
    return (
      <div className="cloud-panel" style={{ padding: 32, textAlign: 'center' }}>
        <Trophy
          style={{
            width: 28,
            height: 28,
            margin: '0 auto 10px',
            color: 'var(--cloud-text-dim)',
          }}
          strokeWidth={1.5}
        />
        <div className="cloud-text" style={{ fontSize: 14, fontWeight: 600 }}>
          No meets on file
        </div>
        <div className="cloud-text-muted" style={{ fontSize: 12, marginTop: 4 }}>
          OpenPowerlifting has no recorded meets for this lifter yet.
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile: stacked cards. The 10-column desktop table is unreadable
          below ~720px; cards keep the same data without horizontal scroll.
          Visibility is controlled by the styled-jsx block below. We avoid
          setting `display` inline because inline styles outrank media
          queries and would force both layouts on at once. */}
      <div className="opl-meets-mobile">
        {meets.map((m) => (
          <MeetCardMobile key={m.id} meet={m} unit={unit} />
        ))}
      </div>
      <div className="opl-meets-desktop cloud-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Meet</TableHead>
                <TableHead>Fed</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Eq</TableHead>
                <TableHead style={{ textAlign: 'right' }}>Squat</TableHead>
                <TableHead style={{ textAlign: 'right' }}>Bench</TableHead>
                <TableHead style={{ textAlign: 'right' }}>Deadlift</TableHead>
                <TableHead style={{ textAlign: 'right' }}>Total</TableHead>
                <TableHead style={{ textAlign: 'right' }}>Place</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meets.map((m) => (
                <TableRow key={m.id}>
                  <TableCell style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {formatDate(m.meet_date)}
                  </TableCell>
                  <TableCell>{m.meet_name || '—'}</TableCell>
                  <TableCell>{m.federation || '—'}</TableCell>
                  <TableCell style={{ whiteSpace: 'nowrap' }}>
                    {m.weight_class_kg ? `${m.weight_class_kg} kg` : '—'}
                  </TableCell>
                  <TableCell>{m.equipment || '—'}</TableCell>
                  <TableCell style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {formatWeightCell(m.squat_kg, unit)}
                  </TableCell>
                  <TableCell style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {formatWeightCell(m.bench_kg, unit)}
                  </TableCell>
                  <TableCell style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {formatWeightCell(m.deadlift_kg, unit)}
                  </TableCell>
                  <TableCell
                    style={{
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      whiteSpace: 'nowrap',
                      fontWeight: 600,
                    }}
                  >
                    {formatWeightCell(m.total_kg, unit)}
                  </TableCell>
                  <TableCell style={{ textAlign: 'right' }}>{m.place || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <style jsx>{`
        .opl-meets-mobile {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .opl-meets-desktop {
          display: none;
        }
        @media (min-width: 720px) {
          .opl-meets-mobile {
            display: none;
          }
          .opl-meets-desktop {
            display: block;
          }
        }
      `}</style>
    </>
  );
}

export default function CompetitionHistoryPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const localUnit = useLocalWeightUnit();
  const unit: WeightUnit = resolveWeightUnit(localUnit, null);

  const athleteId = useMemo(() => {
    const raw = Array.isArray(params?.id) ? params.id[0] : params?.id;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  }, [params]);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchSubmitted, setSearchSubmitted] = useState('');

  const athleteQuery = useQuery({
    queryKey: ['athlete', athleteId],
    queryFn: () => apiClient.getAthlete(athleteId as number),
    enabled: athleteId != null,
  });

  const statusQuery = useQuery<Types.OplStatusResponse>({
    queryKey: ['opl', 'status', athleteId],
    queryFn: () => apiClient.getOpenPowerliftingStatus(athleteId as number),
    enabled: athleteId != null,
  });

  const searchQuery = useQuery({
    queryKey: ['opl', 'search', searchSubmitted],
    queryFn: () => apiClient.searchOpenPowerlifting(searchSubmitted),
    enabled: searchSubmitted.length >= 2,
  });

  const linkMutation = useMutation({
    mutationFn: ({ slug, displayName }: { slug: string; displayName?: string }) =>
      apiClient.linkOpenPowerlifting(athleteId as number, slug, displayName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opl', 'status', athleteId] });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiClient.refreshOpenPowerlifting(athleteId as number),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opl', 'status', athleteId] });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: () => apiClient.unlinkOpenPowerlifting(athleteId as number),
    onSuccess: () => {
      setSearchTerm('');
      setSearchSubmitted('');
      queryClient.invalidateQueries({ queryKey: ['opl', 'status', athleteId] });
    },
  });

  if (athleteId == null) {
    return (
      <div style={{ padding: 'var(--cloud-s5)' }}>
        <p className="cloud-text-muted">Invalid athlete id.</p>
      </div>
    );
  }

  const status = statusQuery.data;
  const linked = status?.linked === true && status.link;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchSubmitted(searchTerm.trim());
  };

  const handlePick = (c: Types.OplCandidate) => {
    linkMutation.mutate({ slug: c.slug, displayName: c.name });
  };

  const handleRefresh = () => refreshMutation.mutate();
  const handleUnlink = () => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Remove the OpenPowerlifting link and clear imported meets?')
    ) {
      return;
    }
    unlinkMutation.mutate();
  };

  return (
    <div style={{ padding: 'var(--cloud-s5)', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <Link
          href={`/athletes/${athleteId}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--cloud-text-muted)',
            marginBottom: 10,
          }}
        >
          <ArrowLeft style={{ width: 14, height: 14 }} />
          Back to athlete
        </Link>
        <h1 className="cloud-text" style={PAGE_TITLE_STYLE}>
          Competition history
        </h1>
        <p className="cloud-text-muted" style={{ fontSize: 13, marginTop: 4 }}>
          Pulled from OpenPowerlifting
          {athleteQuery.data?.name ? ` for ${athleteQuery.data.name}` : ''}.
        </p>
      </div>

      {statusQuery.isLoading && (
        <div className="cloud-panel" style={{ padding: 24 }}>
          <p className="cloud-text-muted" style={{ fontSize: 13 }}>Loading…</p>
        </div>
      )}

      {linkMutation.isError && (
        <div
          className="cloud-panel"
          style={{
            padding: 12,
            marginBottom: 14,
            borderColor: 'rgba(248, 113, 113, 0.3)',
            color: '#fca5a5',
            fontSize: 13,
          }}
        >
          {(linkMutation.error as Error | undefined)?.message ||
            'Failed to link profile.'}
        </div>
      )}

      {linked && status?.link && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <LinkedHeader
            link={status.link}
            athleteName={athleteQuery.data?.name}
            onRefresh={handleRefresh}
            onUnlink={handleUnlink}
            refreshing={refreshMutation.isPending}
            unlinking={unlinkMutation.isPending}
          />
          <MeetsTable meets={status.meets ?? []} unit={unit} />
        </div>
      )}

      {!statusQuery.isLoading && !linked && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="cloud-panel" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <LinkIcon style={{ width: 16, height: 16, color: 'var(--cloud-text-muted)' }} />
              <div className="cloud-text" style={{ fontWeight: 600 }}>
                Link an OpenPowerlifting profile
              </div>
            </div>
            <p className="cloud-text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
              Search by name, then pick the right lifter. We&apos;ll pull every meet on file.
            </p>
            <form
              onSubmit={handleSearch}
              style={{ display: 'flex', gap: 8, alignItems: 'center' }}
            >
              <Input
                placeholder="e.g. Brandon Lilly"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ flex: 1 }}
              />
              <Button type="submit" disabled={searchTerm.trim().length < 2}>
                <Search style={{ width: 14, height: 14, marginRight: 6 }} />
                Search
              </Button>
            </form>
          </div>

          {searchQuery.isFetching && (
            <div className="cloud-panel" style={{ padding: 16 }}>
              <p className="cloud-text-muted" style={{ fontSize: 13 }}>Searching…</p>
            </div>
          )}

          {searchQuery.data && !searchQuery.isFetching && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {searchQuery.data.candidates.length === 0 ? (
                <div className="cloud-panel" style={{ padding: 16 }}>
                  <p className="cloud-text-muted" style={{ fontSize: 13 }}>
                    No lifters matched &ldquo;{searchSubmitted}&rdquo;.
                  </p>
                </div>
              ) : (
                searchQuery.data.candidates.map((c) => (
                  <CandidateRow
                    key={c.slug}
                    candidate={c}
                    onPick={handlePick}
                    busy={linkMutation.isPending}
                  />
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
