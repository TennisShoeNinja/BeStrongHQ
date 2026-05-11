'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import { computeLifetimeStats, evaluateBadges } from '@/lib/badges';
import { BadgeRow } from '@/components/badge-row';
import { NextMilestoneChip } from '@/components/next-milestone-chip';
import { RecentAchievementsStrip } from '@/components/recent-achievements-strip';

interface AthleteBadgesProps {
  athleteId: number;
}

export function AthleteBadges({ athleteId }: AthleteBadgesProps) {
  const [meetResultsQuery, maxHistoryQuery] = useQueries({
    queries: [
      {
        queryKey: ['meet-results', athleteId],
        queryFn: () => apiClient.listMeetResults(athleteId),
        enabled: !!athleteId,
      },
      {
        queryKey: ['max-history', athleteId],
        queryFn: () => apiClient.getMaxHistory(athleteId),
        enabled: !!athleteId,
      },
    ],
  });

  const badges = useMemo(
    () =>
      evaluateBadges({
        meetResults: meetResultsQuery.data ?? [],
        maxHistory: maxHistoryQuery.data ?? [],
      }),
    [meetResultsQuery.data, maxHistoryQuery.data],
  );
  const athleteStats = useMemo(
    () => computeLifetimeStats(meetResultsQuery.data ?? []),
    [meetResultsQuery.data],
  );

  const isLoading = meetResultsQuery.isLoading || maxHistoryQuery.isLoading;
  if (isLoading || badges.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minWidth: 0,
        maxWidth: '100%',
      }}
    >
      <BadgeRow badges={badges} />
      <RecentAchievementsStrip badges={badges} />
      <NextMilestoneChip badges={badges} athleteStats={athleteStats} />
    </div>
  );
}
