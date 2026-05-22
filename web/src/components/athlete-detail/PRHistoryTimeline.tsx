"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api";
import * as Types from "@/lib/types";
import { convertWeight, formatWeight, type WeightUnit } from "@/lib/units";
import PRDetailModal from "@/components/PRDetailModal";

// This panel only explores the three competition compounds. Accessories
// (lift === "accessory") and totals are intentionally left out.
const COMP_LIFTS = ["squat", "bench", "deadlift"] as const;
type CompLift = (typeof COMP_LIFTS)[number];

const LIFT_TINT: Record<CompLift, { text: string; bg: string; border: string }> = {
  squat: { text: "#fb923c", bg: "rgba(251, 146, 60, 0.18)", border: "rgba(251, 146, 60, 0.45)" },
  bench: { text: "#22d3ee", bg: "rgba(34, 211, 238, 0.16)", border: "rgba(34, 211, 238, 0.45)" },
  deadlift: { text: "#a78bfa", bg: "rgba(167, 139, 250, 0.16)", border: "rgba(167, 139, 250, 0.45)" },
};

const SELECT_STYLE: CSSProperties = {
  background: "var(--cloud-panel)",
  border: "1px solid var(--cloud-border)",
  borderRadius: 8,
  color: "var(--cloud-text)",
  colorScheme: "dark",
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 600,
  padding: "6px 10px",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// "Program 5 - W3D1" -> "Program 5"; bare notes pass through.
function programLabel(note: string | null): string | null {
  if (!note) return null;
  const wd = /W\d+D\d+/i.exec(note);
  const head = (wd ? note.slice(0, wd.index) : note).replace(/[\s-]+$/, "").trim();
  return head || null;
}

interface Lane {
  key: string;
  lift: CompLift;
  exercise_name: string;
  reps: number;
  pr: Types.MaxHistoryEntry;
}

export function PRHistoryTimeline({
  athleteId,
  unit,
  athleteName,
}: {
  athleteId: number;
  unit: WeightUnit;
  athleteName?: string | null;
}) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ["max-history", athleteId],
    queryFn: () => apiClient.getMaxHistory(athleteId),
  });
  const { data: programs } = useQuery({
    queryKey: ["programs", athleteId],
    queryFn: () => apiClient.listPrograms(athleteId),
  });

  const [activeLifts, setActiveLifts] = useState<Set<CompLift>>(
    () => new Set(COMP_LIFTS),
  );
  const [selectedReps, setSelectedReps] = useState<number | null>(null);
  const [selectedVariation, setSelectedVariation] = useState<string>("");
  const [selectedPR, setSelectedPR] = useState<Types.MaxHistoryEntry | null>(null);

  // One lane per (lift | exercise | reps); the lane's PR is its heaviest entry.
  const lanes = useMemo<Lane[]>(() => {
    const byLane = new Map<string, Lane>();
    for (const h of history) {
      const lift = h.lift.toLowerCase();
      if (!(COMP_LIFTS as readonly string[]).includes(lift)) continue;
      if (h.reps == null || h.exercise_name == null) continue;
      const key = `${lift}|${h.exercise_name}|${h.reps}`;
      const existing = byLane.get(key);
      const isBetter =
        !existing ||
        h.new_value > existing.pr.new_value ||
        (h.new_value === existing.pr.new_value &&
          new Date(h.recorded_at).getTime() > new Date(existing.pr.recorded_at).getTime());
      if (isBetter) {
        byLane.set(key, {
          key,
          lift: lift as CompLift,
          exercise_name: h.exercise_name,
          reps: h.reps,
          pr: h,
        });
      }
    }
    return Array.from(byLane.values());
  }, [history]);

  // Filter chain. Reps/variation selections degrade gracefully to "all" when a
  // lift toggle removes the option they pointed at, so no reset bookkeeping.
  const view = useMemo(() => {
    const forLifts = lanes.filter((l) => activeLifts.has(l.lift));

    const availableReps = Array.from(new Set(forLifts.map((l) => l.reps))).sort(
      (a, b) => a - b,
    );
    const effectiveReps =
      selectedReps != null && availableReps.includes(selectedReps) ? selectedReps : null;

    const forReps = forLifts.filter(
      (l) => effectiveReps == null || l.reps === effectiveReps,
    );

    const availableVariations = Array.from(
      new Set(forReps.map((l) => l.exercise_name)),
    ).sort((a, b) => a.localeCompare(b));
    const effectiveVariation = availableVariations.includes(selectedVariation)
      ? selectedVariation
      : "";

    const rows = forReps
      .filter((l) => !effectiveVariation || l.exercise_name === effectiveVariation)
      .sort(
        (a, b) =>
          new Date(b.pr.recorded_at).getTime() - new Date(a.pr.recorded_at).getTime(),
      );

    return { availableReps, effectiveReps, availableVariations, effectiveVariation, rows };
  }, [lanes, activeLifts, selectedReps, selectedVariation]);

  const lifetimeTotal = lanes.length;
  const totalDisplay = isLoading ? "..." : String(lifetimeTotal);

  const toggleLift = (lift: CompLift) => {
    setActiveLifts((prev) => {
      const next = new Set(prev);
      if (next.has(lift)) next.delete(lift);
      else next.add(lift);
      return next;
    });
  };

  return (
    <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
      <div
        className="cloud-panel-head"
        style={{
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "var(--cloud-s3)",
          paddingBottom: "var(--cloud-s3)",
        }}
      >
        <div>
          <h2>PR History</h2>
        </div>
        <div
          aria-label={`${totalDisplay} lifetime PRs`}
          style={{
            alignItems: "baseline",
            background: "rgba(12, 92, 171, 0.12)",
            border: "1px solid rgba(12, 92, 171, 0.32)",
            borderRadius: 8,
            display: "flex",
            gap: 6,
            marginLeft: "auto",
            padding: "6px 10px",
          }}
        >
          <span
            className="cloud-text"
            style={{
              fontSize: 18,
              fontVariantNumeric: "tabular-nums",
              fontWeight: 800,
              lineHeight: 1,
            }}
          >
            {totalDisplay}
          </span>
          <span className="cloud-eyebrow-sm">Lifetime PRs</span>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--cloud-s3)",
          padding: "var(--cloud-s3) var(--cloud-s4)",
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          {COMP_LIFTS.map((lift) => {
            const active = activeLifts.has(lift);
            const tint = LIFT_TINT[lift];
            return (
              <button
                key={lift}
                type="button"
                aria-pressed={active}
                onClick={() => toggleLift(lift)}
                style={{
                  background: active ? tint.bg : "var(--cloud-panel)",
                  border: `1px solid ${active ? tint.border : "var(--cloud-border)"}`,
                  borderRadius: 999,
                  color: active ? tint.text : "var(--cloud-text-dim)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.01em",
                  opacity: active ? 1 : 0.65,
                  padding: "6px 12px",
                  textTransform: "capitalize",
                  transition: "all 0.1s",
                }}
              >
                {lift}
              </button>
            );
          })}
        </div>

        <div style={{ alignItems: "center", display: "flex", gap: 8, marginLeft: "auto" }}>
          {view.availableReps.length > 0 && (
            <select
              value={view.effectiveReps == null ? "" : String(view.effectiveReps)}
              onChange={(e) =>
                setSelectedReps(e.target.value === "" ? null : Number(e.target.value))
              }
              aria-label="Reps"
              style={SELECT_STYLE}
            >
              <option value="">All reps</option>
              {view.availableReps.map((r) => (
                <option key={r} value={String(r)}>
                  {r}RM
                </option>
              ))}
            </select>
          )}

          {view.availableVariations.length > 1 && (
            <select
              value={view.effectiveVariation}
              onChange={(e) => setSelectedVariation(e.target.value)}
              aria-label="Variation"
              style={SELECT_STYLE}
            >
              <option value="">All variations</option>
              {view.availableVariations.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {isLoading ? (
        <div
          className="cloud-text-muted"
          style={{ padding: "0 var(--cloud-s4) var(--cloud-s4)", fontSize: 13 }}
        >
          Loading PR history...
        </div>
      ) : lanes.length === 0 ? (
        <p
          className="cloud-text-muted"
          style={{ margin: 0, padding: "0 var(--cloud-s4) var(--cloud-s4)", fontSize: 13 }}
        >
          No PRs logged yet.
        </p>
      ) : view.rows.length === 0 ? (
        <p
          className="cloud-text-muted"
          style={{ margin: 0, padding: "0 var(--cloud-s4) var(--cloud-s4)", fontSize: 13 }}
        >
          No PRs match these filters.
        </p>
      ) : (
        <div
          className="cloud-thin-scroll"
          tabIndex={0}
          aria-label="PR history"
          style={{
            maxHeight: 360,
            overflowY: "auto",
            padding: "0 var(--cloud-s4) var(--cloud-s4)",
          }}
        >
          <ol style={{ display: "grid", gap: 8, listStyle: "none", margin: 0, padding: 0 }}>
            {view.rows.map((lane) => {
              const pr = lane.pr;
              const tint = LIFT_TINT[lane.lift];
              const isCompMatch = pr.source === "comp_match";
              const deltaLbs = pr.old_value != null ? pr.new_value - pr.old_value : null;
              const deltaDisplay =
                deltaLbs != null ? Math.round(convertWeight(deltaLbs, unit)) : null;
              const block = programLabel(pr.note);
              return (
                <li key={lane.key}>
                  <button
                    type="button"
                    onClick={() => setSelectedPR(pr)}
                    title="See full progression"
                    className="cloud-text"
                    style={{
                      alignItems: "center",
                      background: "rgba(255, 255, 255, 0.025)",
                      border: "1px solid var(--cloud-border)",
                      borderRadius: 8,
                      cursor: "pointer",
                      display: "grid",
                      gap: "var(--cloud-s3)",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      padding: "12px 14px",
                      textAlign: "left",
                      transition: "background 0.1s, border-color 0.1s",
                      width: "100%",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--cloud-panel-hover)";
                      e.currentTarget.style.borderColor = tint.border;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.025)";
                      e.currentTarget.style.borderColor = "var(--cloud-border)";
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          alignItems: "center",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 8,
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            color: tint.text,
                            fontSize: 14,
                            fontWeight: 700,
                            lineHeight: 1.25,
                            maxWidth: "100%",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={lane.exercise_name}
                        >
                          {lane.exercise_name}
                        </span>
                        <span
                          style={{
                            background: "rgba(245, 158, 11, 0.1)",
                            border: "1px solid rgba(245, 158, 11, 0.35)",
                            borderRadius: "var(--cloud-r-sm)",
                            color: "#fcd34d",
                            fontSize: 10,
                            fontWeight: 500,
                            letterSpacing: "0.06em",
                            lineHeight: 1,
                            padding: "3px 6px",
                            textTransform: "uppercase",
                          }}
                        >
                          {lane.reps}RM
                        </span>
                      </div>
                      <p
                        className="cloud-text-muted"
                        style={{ fontSize: 12, lineHeight: 1.4, margin: "5px 0 0" }}
                      >
                        {formatDate(pr.recorded_at)}
                        {block && (
                          <>
                            {" "}
                            <span aria-hidden="true">/</span> {block}
                          </>
                        )}
                      </p>
                    </div>
                    <div
                      style={{
                        alignItems: "flex-end",
                        display: "grid",
                        gap: 3,
                        justifyItems: "end",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span
                        className="cloud-text"
                        style={{
                          fontSize: 14,
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 800,
                          lineHeight: 1.2,
                        }}
                      >
                        {formatWeight(pr.new_value, unit, { decimals: 0 })}
                        {lane.reps > 1 && (
                          <span className="cloud-text-muted" style={{ fontWeight: 500 }}>
                            {" "}
                            × {lane.reps}
                          </span>
                        )}
                      </span>
                      {isCompMatch ? (
                        <span
                          style={{
                            color: "#fcd34d",
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          Comp Match
                        </span>
                      ) : (
                        deltaDisplay != null &&
                        deltaDisplay !== 0 && (
                          <span
                            style={{
                              background:
                                deltaDisplay > 0
                                  ? "rgba(34, 197, 94, 0.12)"
                                  : "rgba(248, 113, 113, 0.12)",
                              borderRadius: 999,
                              color: deltaDisplay > 0 ? "#86efac" : "#fca5a5",
                              fontSize: 12,
                              fontVariantNumeric: "tabular-nums",
                              fontWeight: 800,
                              lineHeight: 1.2,
                              padding: "2px 7px",
                            }}
                          >
                            {deltaDisplay > 0 ? "+" : ""}
                            {deltaDisplay} {unit}
                          </span>
                        )
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <PRDetailModal
        open={!!selectedPR}
        onClose={() => setSelectedPR(null)}
        pr={selectedPR}
        allHistory={history}
        athleteName={athleteName ?? null}
        unit={unit}
        programIndex={programs?.map((p) => ({
          id: p.id,
          program_number: p.program_number ?? null,
          program_name: p.program_name ?? null,
        }))}
        programSheetUrls={
          programs
            ? Object.fromEntries(programs.map((p) => [p.id, p.google_sheet_url ?? null]))
            : undefined
        }
      />
    </div>
  );
}
