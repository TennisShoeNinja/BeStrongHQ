"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import apiClient from "@/lib/api";
import {
  formatMeetDate,
  formatPlace,
  groupMeetResults,
} from "@/components/athlete-detail/utils";
import { convertWeight, unitLabel, type WeightUnit } from "@/lib/units";
import type * as Types from "@/lib/types";

interface Props {
  athlete: Types.AthleteResponse;
  unit: WeightUnit;
  onBack: () => void;
}

interface MeetBests {
  squat: number | null;
  bench: number | null;
  deadlift: number | null;
  total: number | null;
}

/** Best made attempt per lift at a meet, and the resulting total. */
function meetBests(rows: Types.MeetResultEntry[]): MeetBests {
  const best: Record<string, number> = {};
  for (const r of rows) {
    if (!r.made) continue;
    const cur = best[r.lift];
    if (cur == null || r.weight_lbs > cur) best[r.lift] = r.weight_lbs;
  }
  const squat = best.squat ?? null;
  const bench = best.bench ?? null;
  const deadlift = best.deadlift ?? null;
  const sum = (squat ?? 0) + (bench ?? 0) + (deadlift ?? 0);
  return { squat, bench, deadlift, total: sum > 0 ? sum : null };
}

function show(v: number | null, unit: WeightUnit): string {
  return v == null ? "-" : String(Math.round(convertWeight(v, unit)));
}

/** Tap-through from the meet card: meet-by-meet history, newest first. */
export function MobileMeetView({ athlete, unit, onBack }: Props) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["meet-results", athlete.id],
    queryFn: () => apiClient.listMeetResults(athlete.id),
  });

  const meets = groupMeetResults(rows); // newest-first

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
          Meet history
        </h1>
        <p
          style={{
            fontSize: 12,
            color: "var(--cloud-text-dim)",
            margin: "2px 0 0",
          }}
        >
          {meets.length} meet{meets.length === 1 ? "" : "s"}
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
        ) : meets.length === 0 ? (
          <p
            style={{
              fontSize: 13,
              color: "var(--cloud-text-muted)",
              marginTop: "var(--cloud-s3)",
            }}
          >
            No meets logged yet.
          </p>
        ) : (
          <>
            <div
              className="cloud-mhome-section-h"
              style={{ marginTop: "var(--cloud-s4)" }}
            >
              <p className="eyebrow">Meets</p>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--cloud-s2)",
              }}
            >
              {meets.map((g, i) => {
                const bests = meetBests(g.rows);
                const place = formatPlace(
                  g.rows.find((r) => r.place)?.place,
                );
                const date = formatMeetDate(g.meet_date);
                const meta = [g.federation, g.weight_class, g.division]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div
                    key={g.key || i}
                    style={{
                      background: "var(--cloud-panel)",
                      border: "1px solid var(--cloud-border)",
                      borderRadius: "var(--cloud-r-md)",
                      padding: "12px var(--cloud-s3)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          margin: 0,
                          minWidth: 0,
                        }}
                      >
                        {g.meet_name || "Meet"}
                      </p>
                      {place && (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--cloud-text)",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          {place}
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        gap: 8,
                        marginTop: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 22,
                          fontWeight: 600,
                          letterSpacing: "-0.02em",
                          fontVariantNumeric: "tabular-nums",
                          color: "var(--cloud-text)",
                        }}
                      >
                        {show(bests.total, unit)}
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--cloud-text-dim)",
                            fontWeight: 500,
                            marginLeft: 2,
                          }}
                        >
                          {unitLabel(unit)} total
                        </span>
                      </span>
                      {date && (
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--cloud-text-dim)",
                          }}
                        >
                          {date}
                        </span>
                      )}
                    </div>

                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--cloud-text-muted)",
                        margin: "6px 0 0",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      S {show(bests.squat, unit)} · B {show(bests.bench, unit)}{" "}
                      · DL {show(bests.deadlift, unit)}
                    </p>
                    {meta && (
                      <p
                        style={{
                          fontSize: 10,
                          color: "var(--cloud-text-dim)",
                          margin: "2px 0 0",
                        }}
                      >
                        {meta}
                      </p>
                    )}
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
