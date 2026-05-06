'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import { evaluateBadges } from '@/lib/badges';
import { BadgeRow } from '@/components/badge-row';

interface AthleteBadgesProps {
  athleteId: number;
}

export function AthleteBadges({ athleteId }: AthleteBadgesProps) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['meet-results', athleteId],
    queryFn: () => apiClient.listMeetResults(athleteId),
    enabled: !!athleteId,
  });

  const badges = useMemo(() => evaluateBadges(rows), [rows]);

  if (isLoading || badges.length === 0) return null;

  return <BadgeRow badges={badges} />;
}
