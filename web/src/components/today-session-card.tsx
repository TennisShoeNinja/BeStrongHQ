"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Dumbbell } from "lucide-react";
import apiClient from "@/lib/api";
import {
  formatWeight,
  resolveWeightUnit,
  useLocalWeightUnit,
  type WeightUnit,
} from "@/lib/units";
import type * as Types from "@/lib/types";

interface Props {
  entry: Types.TodaySessionEntry | null;
}

type TodaySessionStatus = NonNullable<Types.TodaySessionEntry["session"]>["status"];

function formatSetRep(exercise: Types.TodayExercise): string {
  if (exercise.reps == null) return `${exercise.sets} sets`;
  return `${exercise.sets}x${exercise.reps}`;
}

function formatPrescription(exercise: Types.TodayExercise, unit: WeightUnit): string {
  const parts = [formatSetRep(exercise)];
  if (exercise.weight_lbs != null) {
    parts.push(`@ ${formatWeight(exercise.weight_lbs, unit)}`);
  }
  if (exercise.target_rpe) {
    parts.push(`RPE ${exercise.target_rpe}`);
  }
  return parts.join(" · ");
}

function statusLabel(status: TodaySessionStatus) {
  if (status === "completed") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          color: "var(--cloud-text-dim)",
          fontSize: 11,
          fontWeight: 500,
        }}
      >
        <Check style={{ width: 12, height: 12 }} />
        Logged
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span
        style={{
          color: "var(--cloud-warning-text)",
          fontSize: 11,
          fontWeight: 500,
        }}
      >
        In progress
      </span>
    );
  }
  return null;
}

export function TodaySessionCard({ entry }: Props) {
  const localUnit = useLocalWeightUnit();
  const { data: settingsData } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiClient.getSettings(),
    staleTime: 60000,
  });
  const unit = resolveWeightUnit(localUnit, settingsData?.default_unit);

  if (!entry?.session) return null;

  const primaryExercises = entry.session.exercises.filter((exercise) => !exercise.is_accessory);
  const accessoryCount = entry.session.exercises.length - primaryExercises.length;
  const eyebrow =
    entry.match_mode === "weekday"
      ? `TODAY · WEEK ${entry.week_number}${
          entry.week_confidence === "logged" ? "" : " (EST.)"
        }`
      : `UP NEXT · WEEK ${entry.week_number}`;
  const title =
    entry.session.session_label || entry.session.day_name || `Day ${entry.session.day_number}`;

  return (
    <div className="cloud-panel" style={{ padding: "14px var(--cloud-s3)" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "32px 1fr auto",
          gap: 12,
          alignItems: "start",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            display: "grid",
            placeItems: "center",
            background: "rgba(12, 92, 171, 0.18)",
            color: "var(--cloud-primary-text)",
            border: "1px solid rgba(12, 92, 171, 0.35)",
          }}
        >
          <Dumbbell style={{ width: 15, height: 15 }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              margin: "0 0 4px",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--cloud-primary-text)",
            }}
          >
            {eyebrow}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: "-0.005em",
              color: "var(--cloud-text)",
            }}
          >
            {title}
          </p>
          <div style={{ marginTop: 10, display: "grid", gap: 7 }}>
            {primaryExercises.map((exercise, index) => (
              <p
                key={`${exercise.exercise_name}-${index}`}
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: "var(--cloud-text-muted)",
                  lineHeight: 1.35,
                }}
              >
                <span style={{ color: "var(--cloud-text)", fontWeight: 500 }}>
                  {exercise.exercise_name}
                </span>
                <span style={{ color: "var(--cloud-text-dim)" }}>
                  {" "}
                  · {formatPrescription(exercise, unit)}
                </span>
              </p>
            ))}
            {accessoryCount > 0 && (
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: "var(--cloud-text-dim)",
                  fontWeight: 500,
                }}
              >
                + {accessoryCount} {accessoryCount === 1 ? "accessory" : "accessories"}
              </p>
            )}
          </div>
        </div>
        {statusLabel(entry.session.status)}
      </div>
    </div>
  );
}
