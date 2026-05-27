"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api";
import { resolveWeightUnit, useLocalWeightUnit, type WeightUnit } from "@/lib/units";
import { MeetHistoryCard } from "@/components/athlete-detail/MeetHistoryCard";

export default function AthleteMeetsPage() {
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

  if (!athlete) {
    return (
      <div className="cloud-text-muted" style={{ padding: "var(--cloud-s4)", fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  return <MeetHistoryCard athleteId={athleteId} athlete={athlete} unit={unit} />;
}
