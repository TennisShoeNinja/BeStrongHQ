"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
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
import PRDetailModal from "@/components/PRDetailModal";
import { findMaxAnchor } from "@/components/athlete-detail/utils";
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

  // Full max history, shared with the rest of the page via the same query key.
  // Used both to anchor each clickable max to its all-time-best PR row and as
  // the `allHistory` lane source the modal walks back through.
  const { data: maxHistory = [] } = useQuery({
    queryKey: ["max-history", athleteId],
    queryFn: () => apiClient.getMaxHistory(athleteId),
    enabled: !!athlete,
  });
  const anchorByLift = useMemo(() => {
    const m: Record<string, Types.MaxHistoryEntry | null> = {};
    for (const lift of ["squat", "bench", "deadlift", "total"]) {
      m[lift] = findMaxAnchor(maxHistory, lift);
    }
    return m;
  }, [maxHistory]);

  const [selectedPR, setSelectedPR] = useState<Types.MaxHistoryEntry | null>(
    null
  );

  // Cross-tab highlight: navigate to the Overview tab with the clicked
  // exercise encoded as a `highlight` query param. The Overview page reads it
  // via useSearchParams and seeds the ProgressionPanel.
  const handleJump = (hl: HighlightedExercise) =>
    router.push(
      `/athletes/${athleteId}?highlight=${encodeURIComponent(JSON.stringify(hl))}`
    );

  if (!athlete) return null;

  const plate = unit === "kg";

  // Render a max value: a clickable button that opens the PR-progression modal
  // when we have a history row to anchor to, otherwise the plain static value.
  const renderValue = (lift: string, value: number | null | undefined) => {
    const content = (
      <>
        {formatWeight(value, unit, { plate, unitless: true })}
        <small>{unit}</small>
      </>
    );
    const anchor = anchorByLift[lift];
    if (!anchor || value == null) {
      return <span className="cloud-maxes__value">{content}</span>;
    }
    return (
      <button
        type="button"
        className="cloud-maxes__value cloud-maxes__value--btn"
        onClick={() => setSelectedPR(anchor)}
        title="See how this max was reached"
      >
        {content}
      </button>
    );
  };

  return (
    <div className="cloud-maxes">
      <div className="cloud-maxes__cell">
        <span className="cloud-maxes__label">Squat</span>
        {renderValue("squat", athlete.squat_max_lbs)}
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
        {renderValue("bench", athlete.bench_max_lbs)}
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
        {renderValue("deadlift", athlete.deadlift_max_lbs)}
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
        {renderValue("total", athlete.total_lbs)}
        {showCompMaxes && <CompTotalLine byLift={compMaxByLift} unit={unit} />}
      </div>

      <PRDetailModal
        open={!!selectedPR}
        onClose={() => setSelectedPR(null)}
        pr={selectedPR}
        allHistory={maxHistory}
        athleteName={athlete.name}
        athleteId={athlete.id}
        unit={unit}
        programIndex={programs.map((p) => ({
          id: p.id,
          program_number: p.program_number ?? null,
          program_name: p.program_name ?? null,
        }))}
        programSheetUrls={Object.fromEntries(
          programs.map((p) => [p.id, p.google_sheet_url ?? null])
        )}
      />
    </div>
  );
}
