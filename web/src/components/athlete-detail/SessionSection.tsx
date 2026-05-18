"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import apiClient from "@/lib/api";
import * as Types from "@/lib/types";
import { type WeightUnit } from "@/lib/units";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { type HighlightedExercise } from "./utils";
import { ExerciseRow } from "./ExerciseRow";


export function SessionSection({
  session,
  athleteId,
  programId,
  programNumber,
  unit,
  isExpanded,
  onToggle,
  onHighlightExercise,
}: {
  session: Types.SessionResponse;
  athleteId: number;
  programId: number;
  programNumber: number;
  unit: WeightUnit;
  isExpanded: boolean;
  onToggle: () => void;
  onHighlightExercise: (ex: HighlightedExercise) => void;
}) {
  const { data: exercises = [] } = useQuery({
    queryKey: ["session-exercises", athleteId, programId, session.id],
    queryFn: () => apiClient.getSessionExercises(athleteId, programId, session.id),
    enabled: isExpanded,
  });

  
  const ratingColors: Record<string, string> = {
    nutrition_rating: "bg-blue-400/10 border-blue-400/30 text-blue-300",
    stress_rating: "bg-red-400/10 border-red-400/30 text-red-300",
    sleep_rating: "bg-indigo-400/10 border-indigo-400/30 text-indigo-300",
    fatigue_rating: "bg-amber-400/10 border-amber-400/30 text-amber-300",
  };

  const ratingLabels: Record<string, string> = {
    nutrition_rating: "Nutrition",
    stress_rating: "Stress",
    sleep_rating: "Sleep",
    fatigue_rating: "Fatigue",
  };

  const ratings = [
    {
      key: "nutrition_rating",
      value: session.nutrition_rating,
    },
    {
      key: "stress_rating",
      value: session.stress_rating,
    },
    {
      key: "sleep_rating",
      value: session.sleep_rating,
    },
    {
      key: "fatigue_rating",
      value: session.fatigue_rating,
    },
  ].filter((r) => r.value);

  return (
    <div
      style={{
        border: "1px solid var(--cloud-border)",
        borderRadius: "var(--cloud-r-md)",
        background: "rgba(255,255,255,0.02)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between transition-colors hover:bg-white/[0.02]"
        style={{ padding: "var(--cloud-s2) var(--cloud-s3)" }}
      >
        <div className="flex-1 text-left">
          <div className="cloud-text font-medium" style={{ fontSize: 13 }}>
            Day {session.day_number}: {session.day_name}
          </div>
          <div className="cloud-text-muted" style={{ fontSize: 11, marginTop: 2 }}>
            {session.exercise_count || 0} exercises
          </div>
          {ratings.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {ratings.map((r) => (
                <Badge
                  key={r.key}
                  className={cn("text-xs", ratingColors[r.key])}
                  variant="outline"
                >
                  {ratingLabels[r.key]}: {r.value}
                </Badge>
              ))}
            </div>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 cloud-text-muted" />
        ) : (
          <ChevronRight className="w-4 h-4 cloud-text-muted" />
        )}
      </button>

      {isExpanded && (
        <div
          className="space-y-2"
          style={{
            borderTop: "1px solid var(--cloud-border)",
            padding: "var(--cloud-s3)",
            background: "rgba(0,0,0,0.15)",
          }}
        >
          {exercises.length === 0 ? (
            <div className="cloud-text-muted italic" style={{ fontSize: 11 }}>No exercises</div>
          ) : (
            exercises.map((exercise) => (
              <ExerciseRow
                key={exercise.id}
                exercise={exercise}
                programNumber={programNumber}
                weekNumber={session.week_number}
                dayNumber={session.day_number}
                unit={unit}
                onHighlightExercise={onHighlightExercise}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
