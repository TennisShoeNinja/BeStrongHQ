"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api";
import { withReturn } from "@/lib/back-nav";
import * as Types from "@/lib/types";
import {
  resolveWeightUnit,
  useLocalWeightUnit,
  type WeightUnit,
} from "@/lib/units";
import { useAuth } from "@/lib/auth-provider";
import { ProgressionPanel } from "@/components/progression-panel";
import BlockReviewSummary from "@/components/BlockReviewSummary";
import { CurrentCycleCard } from "@/components/current-cycle-card";
import { NewPRsBanner } from "@/components/athlete-detail/NewPRsBanner";
import { type HighlightedExercise } from "@/components/athlete-detail/utils";

function AthleteOverviewPageInner() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { instanceSettings } = useAuth();
  const athleteId = parseInt(params.id as string, 10);

  const { data: settingsData } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiClient.getSettings(),
    staleTime: 60000,
  });

  // Weight-unit preference: browser override > global default_unit setting > lbs.
  const localUnit = useLocalWeightUnit();
  const unit: WeightUnit = resolveWeightUnit(localUnit, settingsData?.default_unit);

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
  const competitionMaxesForProgression = useMemo(
    () => ({
      squat: compMaxByLift.squat?.weight_lbs ?? null,
      bench: compMaxByLift.bench?.weight_lbs ?? null,
      deadlift: compMaxByLift.deadlift?.weight_lbs ?? null,
    }),
    [compMaxByLift],
  );

  // Cross-tab highlight: the Programs tab navigates here with the clicked
  // exercise encoded as a `highlight` query param. Seed the panel state once
  // from the URL (derived-from-searchParams pattern, no effect needed).
  const highlightParam = searchParams.get("highlight");
  const [highlightedExercise, setHighlightedExercise] = useState<HighlightedExercise | null>(() => {
    if (!highlightParam) return null;
    try {
      return JSON.parse(highlightParam) as HighlightedExercise;
    } catch {
      return null;
    }
  });
  const [prevHighlightParam, setPrevHighlightParam] = useState<string | null>(highlightParam);
  if (highlightParam !== prevHighlightParam) {
    setPrevHighlightParam(highlightParam);
    if (highlightParam) {
      try {
        setHighlightedExercise(JSON.parse(highlightParam) as HighlightedExercise);
      } catch {
        setHighlightedExercise(null);
      }
    }
  }

  if (!athlete) {
    return (
      <div className="cloud-text-muted" style={{ padding: "var(--cloud-s4)", fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: "var(--cloud-s4)" }}>
      <NewPRsBanner
        athleteId={athleteId}
        unit={unit}
        currentProgramId={programs[0]?.id ?? null}
        currentProgramStart={programs[0]?.date_start ?? null}
        currentProgramEnd={programs[0]?.date_end ?? null}
        athleteName={athlete?.name ?? null}
      />

      <div id="coach-athlete-next-meet-slot" />

      {/* Current cycle hero: meet + block side by side */}
      <div>
        <p className="cloud-eyebrow" style={{ marginBottom: 8 }}>
          Current cycle
        </p>
        <CurrentCycleCard
          athlete={athlete}
          currentProgram={programs[0] ?? null}
          programSheetUrl={athlete.latest_program_sheet_url ?? null}
          onOpenMeet={(mid) =>
            router.push(
              withReturn(`/meets/${mid}`, `/athletes/${athlete.id}`, athlete.name),
            )
          }
        />
      </div>

      {/* Current block review (above progression) */}
      <BlockReviewSummary athleteId={athleteId} context="profile" athleteName={athlete?.name ?? null} unit={unit} />

      {/* Progression */}
      <ProgressionPanel
        athleteId={athleteId}
        unit={unit}
        competitionMaxes={competitionMaxesForProgression}
        tracksRpe={instanceSettings.tracks_rpe}
        hasPrimaryDays={Boolean(
          athlete?.primary_squat_day ||
            athlete?.primary_bench_day ||
            athlete?.primary_deadlift_day,
        )}
        highlightedExercise={highlightedExercise}
        onClearHighlight={() => setHighlightedExercise(null)}
      />
    </div>
  );
}

export default function AthleteOverviewPage() {
  return (
    <Suspense fallback={null}>
      <AthleteOverviewPageInner />
    </Suspense>
  );
}
