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
  const [meetResultsQuery, prEventsQuery] = useQueries({
    queries: [
      {
        queryKey: ['meet-results', athleteId],
        queryFn: () => apiClient.listMeetResults(athleteId),
        enabled: !!athleteId,
      },
      {
        queryKey: ['pr-events', athleteId],
        queryFn: () => apiClient.getPREvents(athleteId),
        enabled: !!athleteId,
      },
    ],
  });

  const badges = useMemo(
    () =>
      evaluateBadges({
        meetResults: meetResultsQuery.data ?? [],
        prEvents: prEventsQuery.data ?? [],
      }),
    [meetResultsQuery.data, prEventsQuery.data],
  );

  const isLoading = meetResultsQuery.isLoading || prEventsQuery.isLoading;
  if (isLoading || badges.length === 0) return null;

  // Compact header treatment: badge icons only. The verbose latest/next
  // achievement summary lives in the dedicated achievements surfaces.
  return (
    <div style={{ minWidth: 0, maxWidth: '100%' }}>
      <BadgeRow badges={badges} />
    </div>
  );
}
