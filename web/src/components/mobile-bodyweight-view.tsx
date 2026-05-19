"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import apiClient from "@/lib/api";
import parseLocalDate from "@/lib/parseLocalDate";
import { convertWeight, unitLabel, type WeightUnit } from "@/lib/units";
import type * as Types from "@/lib/types";

interface Props {
  athlete: Types.AthleteResponse;
  unit: WeightUnit;
  onBack: () => void;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatDay(iso: string): string {
  const d = parseLocalDate(iso);
  if (!d) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Tap-through from the body-weight card: the weigh-in log, newest first. */
export function MobileBodyweightView({ athlete, unit, onBack }: Props) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["bodyweight-trend", athlete.id],
    queryFn: () => apiClient.getBodyweightTrend(athlete.id),
  });

  const sorted = [...rows]
    .filter((p) => p.bodyweight_lbs != null && p.date)
    .sort((a, b) => a.date.localeCompare(b.date));

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
          Body weight
        </h1>
        <p
          style={{
            fontSize: 12,
            color: "var(--cloud-text-dim)",
            margin: "2px 0 0",
          }}
        >
          {sorted.length} weigh-in{sorted.length === 1 ? "" : "s"} on file
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
        ) : sorted.length === 0 ? (
          <p
            style={{
              fontSize: 13,
              color: "var(--cloud-text-muted)",
              marginTop: "var(--cloud-s3)",
            }}
          >
            No weigh-ins logged yet.
          </p>
        ) : (
          <>
            <div
              className="cloud-mhome-section-h"
              style={{ marginTop: "var(--cloud-s4)" }}
            >
              <p className="eyebrow">Weigh-ins</p>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--cloud-s2)",
              }}
            >
              {sorted
                .map((p, idx) => ({ p, idx }))
                .reverse()
                .map(({ p, idx }) => {
                  const prev = idx > 0 ? sorted[idx - 1] : null;
                  const deltaLbs = prev
                    ? (p.bodyweight_lbs as number) -
                      (prev.bodyweight_lbs as number)
                    : null;
                  return (
                    <div
                      key={`${p.date}-${idx}`}
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
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          margin: 0,
                        }}
                      >
                        {formatDay(p.date)}
                      </p>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 16,
                            fontWeight: 600,
                            fontVariantNumeric: "tabular-nums",
                            color: "var(--cloud-text)",
                          }}
                        >
                          {round1(
                            convertWeight(p.bodyweight_lbs as number, unit),
                          )}
                          <span
                            style={{
                              fontSize: 10,
                              color: "var(--cloud-text-dim)",
                              fontWeight: 500,
                              marginLeft: 2,
                            }}
                          >
                            {unitLabel(unit)}
                          </span>
                        </span>
                        {deltaLbs != null && Math.abs(deltaLbs) >= 0.05 && (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 500,
                              color: "var(--cloud-text-dim)",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {deltaLbs > 0 ? "+" : "-"}
                            {round1(
                              convertWeight(Math.abs(deltaLbs), unit),
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
