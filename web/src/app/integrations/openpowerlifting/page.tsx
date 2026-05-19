'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  Loader2,
  Search,
  Trophy,
  XCircle,
} from 'lucide-react';
import apiClient from '@/lib/api';
import * as Types from '@/lib/types';

const MICRO_LABEL: CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--cloud-primary-text)',
  fontWeight: 500,
};

function formatCandidateMeta(candidate: Types.OplCandidate): string {
  const parts = [
    candidate.federation,
    candidate.last_meet_date ? `Last meet ${candidate.last_meet_date}` : null,
    candidate.best_total_lbs != null
      ? `${Math.round(candidate.best_total_lbs)} lb total`
      : null,
    candidate.best_dots != null ? `${candidate.best_dots.toFixed(1)} DOTS` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

export default function OpenPowerliftingIntegrationPage() {
  const queryClient = useQueryClient();
  const [sweepResult, setSweepResult] =
    useState<Types.OplAutolinkResponse | null>(null);
  const [linkedReviewIds, setLinkedReviewIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [linkingKey, setLinkingKey] = useState<string | null>(null);
  const [linkErrors, setLinkErrors] = useState<Record<number, string>>({});

  const coverageQuery = useQuery({
    queryKey: ['opl-coverage'],
    queryFn: () => apiClient.getOplCoverage(),
  });

  const autolinkMutation = useMutation({
    mutationFn: () => apiClient.runOplAutolink(),
    onSuccess: (data) => {
      setSweepResult(data);
      setLinkedReviewIds(new Set());
      setLinkErrors({});
      queryClient.invalidateQueries({ queryKey: ['opl-coverage'] });
    },
  });

  const linkMutation = useMutation({
    mutationFn: ({
      athleteId,
      slug,
    }: {
      athleteId: number;
      slug: string;
    }) => apiClient.linkOpenPowerlifting(athleteId, slug),
    onSuccess: (_data, variables) => {
      setLinkedReviewIds((prev) => {
        const next = new Set(prev);
        next.add(variables.athleteId);
        return next;
      });
      setLinkErrors((prev) => {
        const next = { ...prev };
        delete next[variables.athleteId];
        return next;
      });
      setLinkingKey(null);
      queryClient.invalidateQueries({ queryKey: ['opl-coverage'] });
    },
    onError: (_error, variables) => {
      setLinkErrors((prev) => ({
        ...prev,
        [variables.athleteId]: 'Link failed. Pick another match or retry.',
      }));
      setLinkingKey(null);
    },
  });

  const coverage = coverageQuery.data;
  const reviewRows = useMemo(
    () =>
      (sweepResult?.needs_review ?? []).filter(
        (row) => !linkedReviewIds.has(row.athlete_id),
      ),
    [linkedReviewIds, sweepResult],
  );
  const noMatchRows = sweepResult?.no_match ?? [];
  const hasSweepResult = sweepResult !== null;
  const hasReviewWork = reviewRows.length > 0 || noMatchRows.length > 0;
  const linkedCount =
    (sweepResult?.linked.length ?? 0) + linkedReviewIds.size;

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
          <div style={{ ...MICRO_LABEL, marginBottom: 8 }}>
            OPENPOWERLIFTING
          </div>
          <div className="flex items-center" style={{ gap: 12 }}>
            <Trophy
              style={{
                width: 22,
                height: 22,
                color: 'var(--cloud-primary-text)',
                strokeWidth: 1.8,
              }}
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
              OpenPowerlifting
            </h1>
          </div>
          <p
            className="cloud-text-muted"
            style={{ fontSize: 13, marginTop: 8, marginLeft: 34 }}
          >
            Pull public meet history into athlete profiles and review only the
            matches that need a coach&apos;s eye.
          </p>
        </div>

        {coverageQuery.isLoading ? (
          <div className="cloud-panel" style={{ padding: 24 }}>
            <div
              className="flex items-center cloud-text-muted"
              style={{ gap: 10, fontSize: 13 }}
            >
              <Loader2
                className="animate-spin"
                style={{ width: 16, height: 16, color: '#67e8f9' }}
              />
              Loading OpenPowerlifting coverage...
            </div>
          </div>
        ) : coverageQuery.isError ? (
          <div
            className="cloud-panel"
            style={{
              padding: 20,
              borderColor: 'rgba(239, 68, 68, 0.4)',
              backgroundColor: 'rgba(239, 68, 68, 0.04)',
            }}
          >
            <div
              className="flex items-center"
              style={{ gap: 8, color: '#fca5a5', fontSize: 13 }}
            >
              <AlertCircle style={{ width: 14, height: 14 }} />
              Coverage failed to load.
            </div>
          </div>
        ) : coverage ? (
          <div className="cloud-panel" style={{ padding: 24 }}>
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
                    marginBottom: 8,
                    letterSpacing: '-0.01em',
                  }}
                >
                  Roster coverage
                </h3>
                <div
                  className="cloud-text"
                  style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums' }}
                >
                  {coverage.linked} linked - {coverage.not_applicable} N/A -{' '}
                  {coverage.needs_linking} need linking
                </div>
                <p
                  className="cloud-text-muted"
                  style={{ fontSize: 12, lineHeight: 1.55, marginTop: 8 }}
                >
                  Counts include active athletes only. Archived athletes stay
                  out of the sweep.
                </p>
              </div>
              <span
                className="cloud-badge cloud-badge-primary"
                style={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}
              >
                {coverage.total} total
              </span>
            </div>
          </div>
        ) : null}

        <div className="cloud-panel" style={{ padding: 24 }}>
          <div
            className="flex items-start justify-between"
            style={{ gap: 16 }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...MICRO_LABEL, marginBottom: 8 }}>
                MATCH SWEEP
              </div>
              <h3
                className="cloud-text"
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  marginBottom: 6,
                  letterSpacing: '-0.01em',
                }}
              >
                Find matches
              </h3>
              <p
                className="cloud-text-muted"
                style={{ fontSize: 13, lineHeight: 1.55 }}
              >
                Search OpenPowerlifting for athletes who still need a link.
                Clear single matches are linked automatically. Ambiguous names
                stay here for review.
              </p>
            </div>
            <button
              type="button"
              onClick={() => autolinkMutation.mutate()}
              disabled={autolinkMutation.isPending}
              className="cloud-btn cloud-btn-primary"
            >
              {autolinkMutation.isPending ? (
                <Loader2
                  className="animate-spin"
                  style={{ width: 14, height: 14 }}
                />
              ) : (
                <Search style={{ width: 14, height: 14 }} />
              )}
              {autolinkMutation.isPending ? 'Finding matches...' : 'Find matches'}
            </button>
          </div>
          {autolinkMutation.isError && (
            <div
              className="flex items-center"
              style={{ gap: 8, color: '#fca5a5', fontSize: 13, marginTop: 14 }}
            >
              <AlertCircle style={{ width: 14, height: 14 }} />
              Match sweep failed. Try again in a minute.
            </div>
          )}
        </div>

        {hasSweepResult && (
          <div className="cloud-panel" style={{ padding: 24 }}>
            <div
              className="flex items-center justify-between"
              style={{ gap: 12, marginBottom: 14 }}
            >
              <div>
                <div style={{ ...MICRO_LABEL, marginBottom: 8 }}>
                  REVIEW
                </div>
                <h3
                  className="cloud-text"
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                  }}
                >
                  Sweep results
                </h3>
              </div>
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
                {linkedCount} linked
              </span>
            </div>

            {!hasReviewWork ? (
              <div
                className="flex items-center cloud-text-muted"
                style={{ gap: 8, fontSize: 13 }}
              >
                <Check style={{ width: 14, height: 14, color: '#86efac' }} />
                No matches need review. Coverage is up to date.
              </div>
            ) : (
              <div className="flex flex-col" style={{ gap: 16 }}>
                {reviewRows.length > 0 && (
                  <div className="flex flex-col" style={{ gap: 8 }}>
                    <div style={MICRO_LABEL}>Needs review</div>
                    {reviewRows.map((row) => (
                      <div
                        key={row.athlete_id}
                        style={{
                          borderRadius: 10,
                          border: '1px solid var(--cloud-border)',
                          background: 'var(--cloud-surface-raised)',
                          padding: 14,
                        }}
                      >
                        <div
                          className="cloud-text"
                          style={{ fontSize: 14, fontWeight: 600 }}
                        >
                          {row.name}
                        </div>
                        <div
                          className="flex flex-col"
                          style={{ gap: 8, marginTop: 10 }}
                        >
                          {row.candidates.map((candidate) => {
                            const key = `${row.athlete_id}:${candidate.slug}`;
                            const isLinking =
                              linkMutation.isPending && linkingKey === key;
                            return (
                              <div
                                key={candidate.slug}
                                className="flex items-center justify-between"
                                style={{
                                  gap: 12,
                                  padding: '10px 12px',
                                  borderRadius: 8,
                                  border: '1px solid var(--cloud-border)',
                                  background: 'var(--cloud-panel)',
                                }}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div
                                    className="cloud-text"
                                    style={{ fontSize: 13, fontWeight: 500 }}
                                  >
                                    {candidate.name}
                                  </div>
                                  <div
                                    className="cloud-text-muted"
                                    style={{
                                      fontSize: 12,
                                      lineHeight: 1.45,
                                      marginTop: 2,
                                    }}
                                  >
                                    {formatCandidateMeta(candidate) ||
                                      'No meet details available'}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="cloud-btn cloud-btn-ghost cloud-btn-sm"
                                  disabled={linkMutation.isPending}
                                  onClick={() => {
                                    setLinkingKey(key);
                                    setLinkErrors((prev) => {
                                      const next = { ...prev };
                                      delete next[row.athlete_id];
                                      return next;
                                    });
                                    linkMutation.mutate({
                                      athleteId: row.athlete_id,
                                      slug: candidate.slug,
                                    });
                                  }}
                                >
                                  {isLinking ? (
                                    <Loader2
                                      className="animate-spin"
                                      style={{ width: 12, height: 12 }}
                                    />
                                  ) : (
                                    <Check style={{ width: 12, height: 12 }} />
                                  )}
                                  Link
                                </button>
                              </div>
                            );
                          })}
                          {linkErrors[row.athlete_id] && (
                            <div
                              className="flex items-center"
                              style={{
                                gap: 6,
                                color: '#fca5a5',
                                fontSize: 12,
                              }}
                            >
                              <AlertCircle
                                style={{ width: 12, height: 12, flexShrink: 0 }}
                              />
                              {linkErrors[row.athlete_id]}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {noMatchRows.length > 0 && (
                  <div className="flex flex-col" style={{ gap: 8 }}>
                    <div style={MICRO_LABEL}>No match</div>
                    {noMatchRows.map((row) => (
                      <div
                        key={row.athlete_id}
                        className="flex items-center cloud-text-muted"
                        style={{
                          gap: 8,
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1px solid var(--cloud-border)',
                          background: 'var(--cloud-surface-raised)',
                          fontSize: 13,
                        }}
                      >
                        <XCircle
                          style={{ width: 14, height: 14, color: '#fca5a5' }}
                        />
                        {row.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
