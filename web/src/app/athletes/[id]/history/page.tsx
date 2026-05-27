"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api";
import { resolveWeightUnit, useLocalWeightUnit, type WeightUnit } from "@/lib/units";
import { PRHistoryTimeline } from "@/components/athlete-detail/PRHistoryTimeline";
import { RPEComplianceCard } from "@/components/athlete-detail/RPEComplianceCard";

export default function AthletePRHistoryPage() {
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
    <div className="flex flex-col" style={{ gap: "var(--cloud-s4)" }}>
      <PRHistoryTimeline athleteId={athleteId} unit={unit} athleteName={athlete?.name ?? null} />
      <RPEComplianceCard athleteId={athleteId} />
    </div>
  );
}
