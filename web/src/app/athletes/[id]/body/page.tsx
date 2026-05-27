"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api";
import { resolveWeightUnit, useLocalWeightUnit, type WeightUnit } from "@/lib/units";
import { BodyMetricsCard } from "@/components/athlete-detail/BodyMetricsCard";

export default function AthleteBodyPage() {
  const params = useParams();
  const athleteId = parseInt(params.id as string, 10);

  const { data: settingsData } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiClient.getSettings(),
    staleTime: 60000,
  });

  const localUnit = useLocalWeightUnit();
  const unit: WeightUnit = resolveWeightUnit(localUnit, settingsData?.default_unit);

  const { data: athlete } = useQuery({
    queryKey: ["athlete", athleteId],
    queryFn: () => apiClient.getAthlete(athleteId),
  });

  return (
    <BodyMetricsCard
      athleteId={athleteId}
      unit={unit}
      weightClass={athlete?.weight_class ?? null}
      goalBodyweightLbs={athlete?.goal_bodyweight_lbs ?? null}
      hasUpcomingMeet={Boolean(athlete?.meet_date || athlete?.next_meet_id)}
      hidden={Boolean(athlete?.body_metrics_hidden)}
    />
  );
}
