"use client";

import * as Types from "@/lib/types";
import { convertWeight, formatWeight, type WeightUnit } from "@/lib/units";
import { type HighlightedExercise } from "./utils";


export function EstimatedMaxBadge({
  est,
  unit,
  onJump,
}: {
  est: Types.EstimatedMaxForLift | undefined;
  unit: WeightUnit;
  onJump: (hit: HighlightedExercise) => void;
}) {
  if (!est || est.estimated == null) return null;
  
  
  const deltaLbs =
    est.declared != null ? est.estimated - est.declared : null;
  const deltaDisplay =
    deltaLbs != null ? Math.round(convertWeight(deltaLbs, unit)) : null;

  const setSummary =
    est.weight_lbs != null && est.reps != null
      ? `${formatWeight(est.weight_lbs, unit, { unitless: true })}×${est.reps}${est.actual_rpe != null ? ` @ RPE ${est.actual_rpe}` : ""
      }`
      : null;
  const programSummary =
    est.program_number != null && est.week_number != null && est.day_number != null
      ? `P${est.program_number} W${est.week_number}D${est.day_number}`
      : null;

  const canJump =
    est.exercise_name != null &&
    est.weight_lbs != null &&
    est.reps != null &&
    est.program_number != null &&
    est.week_number != null &&
    est.day_number != null;

  const handleClick = () => {
    if (!canJump) return;
    onJump({
      exercise_name: est.exercise_name as string,
      program_number: est.program_number as number,
      week_number: est.week_number as number,
      day_number: est.day_number as number,
      reps: est.reps as number,
      weight_lbs: est.weight_lbs as number,
      lift_category: est.lift,
    });
  };

  const title =
    setSummary && programSummary
      ? `Best e1RM from ${setSummary} ${unit} — ${est.exercise_name ?? ""} (${programSummary})${deltaDisplay != null && deltaDisplay > 0
        ? `. ${deltaDisplay} ${unit} above declared max.`
        : ""
      }`
      : undefined;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!canJump}
      title={title}
      className="w-full text-left mt-2 pt-2 border-t border-[color:var(--cloud-border)] group disabled:cursor-default"
    >
      <div className="flex items-baseline gap-1">
        <span className={`text-sm font-medium ${est.exceeds_declared ? "text-amber-500" : "cloud-text-dim"
          }`}>
          est. {formatWeight(est.estimated, unit)}
        </span>
        {est.exceeds_declared && deltaDisplay != null && deltaDisplay > 0 && (
          <span className="text-[11px] text-amber-500 font-semibold">
            +{deltaDisplay}
          </span>
        )}
      </div>
      {(setSummary || programSummary) && (
        <div className="text-[11px] cloud-text-dim truncate group-hover:cloud-text-muted">
          {setSummary}
          {setSummary && programSummary ? " · " : ""}
          {programSummary}
        </div>
      )}
      {est.exceeds_declared && (
        <div className="text-[11px] text-amber-500/80 mt-0.5">
          Consider bumping training max
        </div>
      )}
    </button>
  );
}
