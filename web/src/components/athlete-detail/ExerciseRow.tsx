"use client";

import * as Types from "@/lib/types";
import { formatWeight, type WeightUnit } from "@/lib/units";
import { type HighlightedExercise } from "./utils";


export function ExerciseRow({
  exercise,
  programNumber,
  weekNumber,
  dayNumber,
  unit,
  onHighlightExercise,
}: {
  exercise: Types.ExerciseEntryResponse;
  programNumber: number;
  weekNumber: number;
  dayNumber: number;
  unit: WeightUnit;
  onHighlightExercise: (ex: HighlightedExercise) => void;
}) {
  
  const rawRpe = exercise.actual_rpe ?? exercise.target_rpe;
  const rpeDisplay = rawRpe
    ? `RPE ${String(rawRpe).replace(/\s*RPE\s*/gi, "").trim()}`
    : "";

  const weight = exercise.weight_lbs
    ? formatWeight(exercise.weight_lbs, unit)
    : "bodyweight";

  
  
  const mainLift =
    exercise.lift_category &&
    ["squat", "bench", "deadlift"].includes(exercise.lift_category.toLowerCase());
  const canHighlight =
    mainLift &&
    exercise.set_type === "top_set" &&
    exercise.weight_lbs !== null &&
    exercise.weight_lbs !== undefined &&
    exercise.reps !== null &&
    exercise.reps !== undefined;

  const handleClick = () => {
    if (!canHighlight) return;
    onHighlightExercise({
      exercise_name: exercise.exercise_name,
      program_number: programNumber,
      week_number: weekNumber,
      day_number: dayNumber,
      reps: exercise.reps as number,
      weight_lbs: exercise.weight_lbs as number,
      lift_category: (exercise.lift_category || "").toLowerCase(),
    });
  };

  return (
    <div
      onClick={handleClick}
      className={
        canHighlight ? "cursor-pointer hover:ring-1 hover:ring-orange-400/40 transition-all" : ""
      }
      style={{
        fontSize: 12,
        padding: "var(--cloud-s2) var(--cloud-s3)",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid var(--cloud-border)",
        borderRadius: "var(--cloud-r-sm)",
      }}
      title={canHighlight ? "Click to highlight this set on the progression chart" : ""}
    >
      <div className="cloud-text font-medium">{exercise.exercise_name}</div>
      <div className="cloud-text-muted">
        {exercise.sets}x
        {exercise.reps ? exercise.reps : "?"} @ {weight}
        {rpeDisplay && ` / ${rpeDisplay}`}
      </div>
      <div className="cloud-text-dim" style={{ fontSize: 11, marginTop: 2 }}>
        {exercise.set_type} • {exercise.lift_category}
      </div>
      {exercise.notes && (
        <div className="cloud-text-muted italic" style={{ fontSize: 11, marginTop: 4 }}>
          Note: {exercise.notes}
        </div>
      )}
    </div>
  );
}
