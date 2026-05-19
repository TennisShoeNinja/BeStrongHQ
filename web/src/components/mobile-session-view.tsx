"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, ExternalLink } from "lucide-react";
import apiClient from "@/lib/api";
import { liftMatches, type LiftKey } from "@/lib/progression";
import { convertWeight, unitLabel, type WeightUnit } from "@/lib/units";
import type * as Types from "@/lib/types";

interface Props {
  athlete: Types.AthleteResponse;
  unit: WeightUnit;
  lift: LiftKey;
  liftLabel: string;
  programId: number;
  week: number;
  day: number;
  onBack: () => void;
}

function setText(p: Types.E1RMDataPoint, unit: WeightUnit): string {
  const w = Math.round(convertWeight(p.weight_lbs, unit));
  const base = `${w} ${unitLabel(unit)} × ${p.reps}`;
  return p.actual_rpe != null ? `${base} @ ${p.actual_rpe}` : base;
}

/**
 * Rung 3: every logged set of the lift on one training day, plus the
 * Rung 4 drop-out to the source spreadsheet the sets were parsed from.
 */
export function MobileSessionView({
  athlete,
  unit,
  lift,
  liftLabel,
  programId,
  week,
  day,
  onBack,
}: Props) {
  const { data: allPoints = [], isLoading } = useQuery({
    queryKey: ["e1rm-trends", athlete.id],
    queryFn: () => apiClient.getE1RMTrends(athlete.id),
  });

  const sets = [...allPoints]
    .filter(
      (p) =>
        p.program_id === programId &&
        p.week_number === week &&
        p.day_number === day &&
        liftMatches(p.lift_category, lift),
    )
    .sort((a, b) => a.weight_lbs - b.weight_lbs);

  const dayName = sets.find((s) => s.day_name)?.day_name ?? null;
  const sheetUrl =
    sets.find((s) => s.google_sheet_url)?.google_sheet_url ?? null;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "var(--cloud-s2) var(--cloud-s3)",
        }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
            background: "transparent",
            border: "none",
            color: "var(--cloud-text-muted)",
            fontSize: 13,
            padding: "6px 4px",
            cursor: "pointer",
          }}
        >
          <ChevronLeft style={{ width: 18, height: 18 }} />
          Back
        </button>
      </div>

      <div style={{ padding: "0 var(--cloud-s4) 96px" }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          {liftLabel}
        </h1>
        <p
          style={{
            fontSize: 12,
            color: "var(--cloud-text-dim)",
            margin: "2px 0 0",
          }}
        >
          Week {week}
          {dayName ? ` · ${dayName}` : ""}
        </p>

        {isLoading ? (
          <p
            style={{
              fontSize: 13,
              color: "var(--cloud-text-muted)",
              marginTop: "var(--cloud-s3)",
            }}
          >
            Loading…
          </p>
        ) : sets.length === 0 ? (
          <p
            style={{
              fontSize: 13,
              color: "var(--cloud-text-muted)",
              marginTop: "var(--cloud-s3)",
            }}
          >
            No sets found for this session.
          </p>
        ) : (
          <>
            <div
              className="cloud-mhome-section-h"
              style={{ marginTop: "var(--cloud-s4)" }}
            >
              <p className="eyebrow">Sets</p>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--cloud-s2)",
              }}
            >
              {sets.map((s, i) => (
                <div
                  key={i}
                  style={{
                    background: "var(--cloud-panel)",
                    border: "1px solid var(--cloud-border)",
                    borderRadius: "var(--cloud-r-md)",
                    padding: "10px var(--cloud-s3)",
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        margin: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      {s.exercise_name}
                      {s.is_outlier && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 2,
                            fontSize: 10,
                            fontWeight: 600,
                            color: "var(--cloud-warning)",
                          }}
                        >
                          <AlertTriangle style={{ width: 11, height: 11 }} />
                          outlier
                        </span>
                      )}
                    </p>
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--cloud-text-muted)",
                        margin: "2px 0 0",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {setText(s, unit)}
                    </p>
                  </div>
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--cloud-text)",
                    }}
                  >
                    {s.e1rm != null
                      ? Math.round(convertWeight(s.e1rm, unit))
                      : "-"}
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--cloud-text-dim)",
                        fontWeight: 500,
                        marginLeft: 2,
                      }}
                    >
                      e1RM
                    </span>
                  </span>
                </div>
              ))}
            </div>

            {sheetUrl && (
              <a
                href={sheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  marginTop: "var(--cloud-s3)",
                  padding: "10px var(--cloud-s3)",
                  background: "var(--cloud-panel)",
                  border: "1px solid var(--cloud-border)",
                  borderRadius: "var(--cloud-r-md)",
                  color: "var(--cloud-text-muted)",
                  fontSize: 13,
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                <ExternalLink style={{ width: 15, height: 15 }} />
                Open in spreadsheet
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
