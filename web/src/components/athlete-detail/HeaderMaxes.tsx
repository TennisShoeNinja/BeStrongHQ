"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api";
import * as Types from "@/lib/types";
import {
  formatWeight,
  resolveWeightUnit,
  useLocalWeightUnit,
  type WeightUnit,
} from "@/lib/units";
import { EstimatedMaxBadge } from "@/components/athlete-detail/EstimatedMaxBadge";
import { CompTotalLine } from "@/components/athlete-detail/CompTotalLine";
import { CompMaxLine } from "@/components/athlete-detail/CompMaxLine";
import {
  subscribeToCompMaxesPref,
  getCompMaxesPref,
  getCompMaxesPrefServer,
  type HighlightedExercise,
} from "@/components/athlete-detail/utils";

/**
 * Persistent compact maxes strip that lives in the athlete-detail header so it
 * shows on every tab. Self-fetches everything (unit, comp-maxes pref, athlete,
 * comp maxes, estimated maxes, programs) using the same query keys as the rest
 * of the page so React Query dedupes the requests.
 */
export function HeaderMaxes({ athleteId }: { athleteId: number }) {
  const router = useRouter();

  // Weight-unit preference: browser override > global default_unit setting > lbs.
  const localUnit = useLocalWeightUnit();
  const { data: settingsData } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiClient.getSettings(),
    staleTime: 60000,
  });
  const unit: WeightUnit = resolveWeightUnit(localUnit, settingsData?.default_unit);

  const showCompMaxes = useSyncExternalStore(
    subscribeToCompMaxesPref,
    getCompMaxesPref,
    getCompMaxesPrefServer
  );

  const { data: athlete } = useQuery({
    queryKey: ["athlete", athleteId],
    queryFn: () => apiClient.getAthlete(athleteId),
  });

  const { data: programs = [] } = useQuery({
    queryKey: ["athlete-programs", athleteId],
    queryFn: () => apiClient.listPrograms(athleteId),
    enabled: !!athlete,
  });

  const { data: compMaxes = [] } = useQuery({
    queryKey: ["competition-maxes", athleteId],
    queryFn: () => apiClient.getCompetitionMaxes(athleteId),
    enabled: !!athlete,
  });
  const compMaxByLift = useMemo(() => {
    const m: Record<string, Types.CompetitionMaxForLift> = {};
    for (const c of compMaxes) m[c.lift.toLowerCase()] = c;
    return m;
  }, [compMaxes]);

  const { data: estimatedMaxes = [] } = useQuery({
    queryKey: ["estimated-max", athleteId],
    queryFn: () => apiClient.getEstimatedMax(athleteId),
    enabled: !!athlete,
  });
  const estMaxByLift = useMemo(() => {
    const m: Record<string, Types.EstimatedMaxForLift> = {};
    for (const e of estimatedMaxes) m[e.lift] = e;
    return m;
  }, [estimatedMaxes]);

  // Cross-tab highlight: navigate to the Overview tab with the clicked
  // exercise encoded as a `highlight` query param. The Overview page reads it
  // via useSearchParams and seeds the ProgressionPanel.
  const handleJump = (hl: HighlightedExercise) =>
    router.push(
      `/athletes/${athleteId}?highlight=${encodeURIComponent(JSON.stringify(hl))}`
    );

  if (!athlete) return null;

  const plate = unit === "kg";

  return (
    <div className="cloud-maxes">
      <div className="cloud-maxes__cell">
        <span className="cloud-maxes__label">Squat</span>
        <span className="cloud-maxes__value">
          {formatWeight(athlete.squat_max_lbs, unit, { plate, unitless: true })}
          <small>{unit}</small>
        </span>
        <EstimatedMaxBadge
          est={estMaxByLift.squat}
          unit={unit}
          programs={programs}
          onJump={handleJump}
        />
        {showCompMaxes && <CompMaxLine cm={compMaxByLift.squat} unit={unit} />}
      </div>

      <div className="cloud-maxes__cell">
        <span className="cloud-maxes__label">Bench</span>
        <span className="cloud-maxes__value">
          {formatWeight(athlete.bench_max_lbs, unit, { plate, unitless: true })}
          <small>{unit}</small>
        </span>
        <EstimatedMaxBadge
          est={estMaxByLift.bench}
          unit={unit}
          programs={programs}
          onJump={handleJump}
        />
        {showCompMaxes && <CompMaxLine cm={compMaxByLift.bench} unit={unit} />}
      </div>

      <div className="cloud-maxes__cell">
        <span className="cloud-maxes__label">Deadlift</span>
        <span className="cloud-maxes__value">
          {formatWeight(athlete.deadlift_max_lbs, unit, { plate, unitless: true })}
          <small>{unit}</small>
        </span>
        <EstimatedMaxBadge
          est={estMaxByLift.deadlift}
          unit={unit}
          programs={programs}
          onJump={handleJump}
        />
        {showCompMaxes && (
          <CompMaxLine cm={compMaxByLift.deadlift} unit={unit} />
        )}
      </div>

      <div className="cloud-maxes__cell">
        <span className="cloud-maxes__label">Total</span>
        <span className="cloud-maxes__value">
          {formatWeight(athlete.total_lbs, unit, { plate, unitless: true })}
          <small>{unit}</small>
        </span>
        {showCompMaxes && <CompTotalLine byLift={compMaxByLift} unit={unit} />}
      </div>
    </div>
  );
}
