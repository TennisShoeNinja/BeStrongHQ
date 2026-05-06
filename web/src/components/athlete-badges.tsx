'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import { evaluateBadges } from '@/lib/badges';
import { BadgeRow } from '@/components/badge-row';

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

  const isLoading = meetResultsQuery.isLoading || maxHistoryQuery.isLoading;
  if (isLoading || badges.length === 0) return null;

  return <BadgeRow badges={badges} />;
}
