"use client";

import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronDown, ChevronRight } from "lucide-react";
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

const LIFT_ORDER = ["squat", "bench", "deadlift"] as const;
const LIFT_LABEL: Record<string, string> = {
  squat: "Squat",
  bench: "Bench",
  deadlift: "Dead",
};
const LIFT_TINT: Record<string, string> = {
  squat: "#fb923c",
  bench: "#22d3ee",
  deadlift: "#a78bfa",
};

const ATTEMPT_GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "48px repeat(3, minmax(0, 1fr))",
  gap: 6,
  alignItems: "center",
};

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

/** Attempt rows by lift + attempt number, plus the id of the best made lift. */
function buildAttempts(rows: Types.MeetResultEntry[]) {
  const byLift: Record<string, Record<number, Types.MeetResultEntry>> = {
    squat: {},
    bench: {},
    deadlift: {},
  };
  const bestId: Record<string, number | null> = {
    squat: null,
    bench: null,
    deadlift: null,
  };
  const bestVal: Record<string, number> = {};
  for (const r of rows) {
    if (!(r.lift in byLift)) continue;
    byLift[r.lift][r.attempt_number] = r;
    if (r.made && (bestVal[r.lift] == null || r.weight_lbs > bestVal[r.lift])) {
      bestVal[r.lift] = r.weight_lbs;
      bestId[r.lift] = r.id;
    }
  }
  return { byLift, bestId };
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

  // Default the most recent meet open: a coach at a meet asks "what did I hit
  // last time," so the newest attempts should be visible without a tap.
  const [expanded, setExpanded] = useState<Set<string> | null>(null);
  const effectiveExpanded =
    expanded ?? new Set(meets[0] ? [meets[0].key] : []);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const base = prev ?? new Set(meets[0] ? [meets[0].key] : []);
      const next = new Set(base);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
                const { byLift, bestId } = buildAttempts(g.rows);
                const place = formatPlace(
                  g.rows.find((r) => r.place)?.place,
                );
                const date = formatMeetDate(g.meet_date);
                const meta = [g.federation, g.weight_class, g.division]
                  .filter(Boolean)
                  .join(" · ");
                const isOpen = effectiveExpanded.has(g.key || String(i));
                return (
                  <div
                    key={g.key || i}
                    style={{
                      background: "var(--cloud-panel)",
                      border: "1px solid var(--cloud-border)",
                      borderRadius: "var(--cloud-r-md)",
                      overflow: "hidden",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(g.key || String(i))}
                      aria-expanded={isOpen}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        background: "transparent",
                        border: "none",
                        padding: "12px var(--cloud-s3)",
                        cursor: "pointer",
                        color: "inherit",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <p
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            margin: 0,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {g.meet_name || "Meet"}
                        </p>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            flexShrink: 0,
                          }}
                        >
                          {place && (
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: "var(--cloud-text)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {place}
                            </span>
                          )}
                          {isOpen ? (
                            <ChevronDown
                              style={{
                                width: 16,
                                height: 16,
                                color: "var(--cloud-text-dim)",
                              }}
                            />
                          ) : (
                            <ChevronRight
                              style={{
                                width: 16,
                                height: 16,
                                color: "var(--cloud-text-dim)",
                              }}
                            />
                          )}
                        </span>
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
                    </button>

                    {isOpen && (
                      <div
                        style={{
                          borderTop: "1px solid var(--cloud-border)",
                          padding: "10px var(--cloud-s3) 12px",
                        }}
                      >
                        <div
                          style={{
                            ...ATTEMPT_GRID,
                            fontSize: 10,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            fontWeight: 500,
                            color: "var(--cloud-text-dim)",
                            marginBottom: 4,
                          }}
                        >
                          <div />
                          <div style={{ textAlign: "center" }}>A1</div>
                          <div style={{ textAlign: "center" }}>A2</div>
                          <div style={{ textAlign: "center" }}>A3</div>
                        </div>
                        {LIFT_ORDER.map((lift) => (
                          <div
                            key={lift}
                            style={{ ...ATTEMPT_GRID, padding: "3px 0" }}
                          >
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: LIFT_TINT[lift],
                              }}
                            >
                              {LIFT_LABEL[lift]}
                            </div>
                            {[1, 2, 3].map((n) => {
                              const r = byLift[lift][n];
                              if (!r) {
                                return (
                                  <div
                                    key={n}
                                    style={{
                                      textAlign: "center",
                                      fontSize: 13,
                                      color: "var(--cloud-text-dim)",
                                      fontVariantNumeric: "tabular-nums",
                                    }}
                                  >
                                    -
                                  </div>
                                );
                              }
                              const isBest = r.id === bestId[lift];
                              const cellStyle: CSSProperties = r.made
                                ? isBest
                                  ? {
                                      background: "rgba(34, 197, 94, 0.15)",
                                      color: "#86efac",
                                      border: "1px solid rgba(34, 197, 94, 0.3)",
                                      fontWeight: 600,
                                    }
                                  : { color: "#86efac" }
                                : {
                                    color: "#fca5a5",
                                    textDecoration: "line-through",
                                  };
                              return (
                                <div
                                  key={n}
                                  style={{
                                    textAlign: "center",
                                    fontSize: 13,
                                    borderRadius: 6,
                                    padding: "2px 0",
                                    fontVariantNumeric: "tabular-nums",
                                    ...cellStyle,
                                  }}
                                >
                                  {Math.round(convertWeight(r.weight_lbs, unit))}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
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
