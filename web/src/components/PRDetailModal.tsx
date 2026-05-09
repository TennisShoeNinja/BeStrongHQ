"use client";

import { useMemo, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Trophy, ExternalLink, X } from "lucide-react";
import * as Types from "@/lib/types";
import {
  type WeightUnit,
  formatWeight,
  convertWeight,
} from "@/lib/units";

interface PRDetailModalProps {
  open: boolean;
  onClose: () => void;
  
  pr: Types.MaxHistoryEntry | null;
  
  allHistory: Types.MaxHistoryEntry[];
  athleteName?: string | null;
  
  programSheetUrls?: Record<number, string | null | undefined>;
  
  programIndex?: Array<{ id: number; program_number: number | null; program_name: string | null }>;
  unit?: WeightUnit;
}


const LIFT_COLORS: Record<string, string> = {
  squat: "#fb923c",
  bench: "#22d3ee",
  deadlift: "#a78bfa",
  total: "#fcd34d",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}


function parseNote(note: string | null): {
  programLabel: string | null;
  programNumber: number | null;
  weekDay: string | null;
} {
  if (!note) return { programLabel: null, programNumber: null, weekDay: null };
  const wd = /W(\d+)D(\d+)/i.exec(note);
  const weekDay = wd ? `W${wd[1]}D${wd[2]}` : null;
  const head = wd ? note.slice(0, wd.index).replace(/[\s-]+$/, "") : note;
  const numMatch = /Program\s+(\d+)/i.exec(head);
  const programNumber = numMatch ? parseInt(numMatch[1], 10) : null;
  return { programLabel: head || null, programNumber, weekDay };
}

export default function PRDetailModal({
  open,
  onClose,
  pr,
  allHistory,
  athleteName,
  programSheetUrls,
  programIndex,
  unit = "lbs",
}: PRDetailModalProps) {
  const lane = useMemo(() => {
    if (!pr) return [] as Types.MaxHistoryEntry[];
    const isTotal = pr.lift.toLowerCase() === "total";
    const matched = allHistory.filter((h) => {
      if (h.lift !== pr.lift) return false;
      if (isTotal) return true;
      return (h.exercise_name ?? null) === (pr.exercise_name ?? null) && (h.reps ?? null) === (pr.reps ?? null);
    });
    return matched.slice().sort(
      (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
    );
  }, [pr, allHistory]);

  // SSR-safe gate so createPortal(document.body) only runs on the client.
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!open || !pr || !isClient) return null;

  const cat = pr.lift.toLowerCase();
  const repLabel = pr.reps != null ? `${pr.reps}RM` : cat === "total" ? "Training total" : "PR";
  const exerciseTitle = pr.exercise_name ?? (cat === "total" ? "Training total" : pr.lift);
  const titleColor = LIFT_COLORS[cat] ?? "var(--cloud-text)";

  const isCompMatch = pr.source === "comp_match";
  const deltaLbs = pr.old_value != null ? pr.new_value - pr.old_value : null;
  const deltaPct =
    pr.old_value != null && pr.old_value > 0
      ? ((pr.new_value - pr.old_value) / pr.old_value) * 100
      : null;
  const deltaDisplay =
    deltaLbs != null ? Math.round(convertWeight(deltaLbs, unit)) : null;

  
  const priorEntry = lane.find((h) => new Date(h.recorded_at).getTime() < new Date(pr.recorded_at).getTime());
  const daysBetween =
    priorEntry != null
      ? Math.max(
          0,
          Math.round(
            (new Date(pr.recorded_at).getTime() - new Date(priorEntry.recorded_at).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : null;

  return createPortal(
    <>
      {}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          zIndex: 60,
          backdropFilter: "blur(2px)",
        }}
        aria-hidden
      />

      {}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${repLabel} ${exerciseTitle} progression`}
        className="cloud-panel-raised"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(640px, calc(100vw - 2rem))",
          maxHeight: "calc(100vh - 4rem)",
          padding: "20px 24px 24px",
          zIndex: 61,
          overflowY: "auto",
          color: "var(--cloud-text)",
          boxShadow: "0 20px 40px -16px rgba(0,0,0,0.6), 0 8px 16px -4px rgba(0,0,0,0.4)",
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        {}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <Trophy style={{ width: 20, height: 20, color: titleColor, flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              style={{
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                margin: 0,
                color: "var(--cloud-text)",
              }}
            >
              <span style={{ color: titleColor, textTransform: "capitalize", marginRight: 8 }}>
                {cat === "total" ? "Total" : cat}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "2px 6px",
                  borderRadius: "var(--cloud-r-sm)",
                  backgroundColor: "rgba(245, 158, 11, 0.1)",
                  color: "#fcd34d",
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                  marginRight: 8,
                  verticalAlign: "middle",
                }}
              >
                {repLabel}
              </span>
              <span style={{ color: "var(--cloud-text)" }}>{exerciseTitle}</span>
            </h3>
            {athleteName && (
              <p
                style={{
                  fontSize: 12,
                  color: "var(--cloud-text-muted)",
                  margin: "2px 0 0",
                }}
              >
                {athleteName}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cloud-btn cloud-btn-ghost"
            style={{
              padding: 6,
              minWidth: 0,
              height: "auto",
              flexShrink: 0,
            }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {}
        {isCompMatch && (
          <div
            style={{
              background: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.35)",
              borderRadius: "var(--cloud-r-sm)",
              padding: "10px 14px",
              marginBottom: 16,
              fontSize: 13,
              color: "var(--cloud-text-muted)",
            }}
          >
            <span style={{ fontSize: 14, color: "#fcd34d", fontWeight: 600 }}>
              Comp Match
            </span>
            <span style={{ marginLeft: 8 }}>
              matched competition PR of {formatWeight(pr.new_value, unit, { decimals: 0 })} in training
            </span>
          </div>
        )}

        {!isCompMatch && deltaDisplay != null && deltaDisplay !== 0 && (
          <div
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid var(--cloud-border)",
              borderRadius: "var(--cloud-r-sm)",
              padding: "10px 14px",
              marginBottom: 16,
              fontSize: 13,
              color: "var(--cloud-text-muted)",
            }}
          >
            <span
              style={{
                fontSize: 14,
                color: deltaDisplay > 0 ? "#86efac" : "#fca5a5",
                fontWeight: 600,
              }}
            >
              {deltaDisplay > 0 ? "+" : ""}
              {deltaDisplay} {unit}
            </span>
            {deltaPct != null && (
              <span
                style={{
                  marginLeft: 6,
                  color: deltaDisplay > 0 ? "#86efac" : "#fca5a5",
                }}
              >
                ({deltaPct > 0 ? "+" : ""}
                {deltaPct.toFixed(1)}%)
              </span>
            )}
            {daysBetween != null && (
              <span style={{ marginLeft: 8 }}>
                over {daysBetween} day{daysBetween === 1 ? "" : "s"}
              </span>
            )}
            {pr.old_value != null && (
              <span style={{ marginLeft: 8, color: "var(--cloud-text-dim)" }}>
                · prior best {formatWeight(pr.old_value, unit, { decimals: 0 })}
              </span>
            )}
          </div>
        )}

        {!isCompMatch && pr.old_value == null && (
          <div
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid var(--cloud-border)",
              borderRadius: "var(--cloud-r-sm)",
              padding: "10px 14px",
              marginBottom: 16,
              fontSize: 12,
              color: "var(--cloud-text-muted)",
            }}
          >
            First recorded entry for this lane — no prior best to compare against.
          </div>
        )}

        {}
        <div style={{ marginBottom: 8 }}>
          <p
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: "var(--cloud-text-dim)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              margin: "0 0 8px 0",
            }}
          >
            Progression
          </p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {lane.map((entry, idx) => {
              const isCurrent = entry.id === pr.id;
              const isEntryCompMatch = entry.source === "comp_match";
              const isEntryMeet = entry.source === "meet" || entry.source === "opl";
              const { programNumber, weekDay, programLabel } = parseNote(entry.note);
              const matchedProgram = programIndex?.find((p) =>
                programNumber != null ? p.program_number === programNumber : false
              );
              const sheetUrl = matchedProgram && programSheetUrls
                ? programSheetUrls[matchedProgram.id]
                : null;
              const stepDelta =
                entry.old_value != null ? entry.new_value - entry.old_value : null;
              const stepDeltaDisplay =
                stepDelta != null ? Math.round(convertWeight(stepDelta, unit)) : null;
              return (
                <div
                  key={entry.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 8px",
                    borderTop: idx === 0 ? "none" : "1px solid var(--cloud-border)",
                    backgroundColor: isCurrent ? "rgba(245, 158, 11, 0.1)" : "transparent",
                    borderLeft: isCurrent ? "2px solid #fcd34d" : "2px solid transparent",
                    paddingLeft: 8,
                  }}
                >
                  <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 6 }}>
                    {isCurrent && <Trophy style={{ width: 14, height: 14, color: "#fcd34d" }} />}
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--cloud-text)",
                      }}
                    >
                      {formatWeight(entry.new_value, unit, { decimals: 0 })}
                      {entry.reps != null && entry.reps > 1 && (
                        <span
                          style={{
                            color: "var(--cloud-text-muted)",
                            fontWeight: 400,
                            marginLeft: 4,
                          }}
                        >
                          × {entry.reps}
                        </span>
                      )}
                    </span>
                    {!isEntryCompMatch && stepDeltaDisplay != null && stepDeltaDisplay !== 0 && (
                      <span
                        style={{
                          fontSize: 11,
                          color: stepDeltaDisplay > 0 ? "#86efac" : "#fca5a5",
                          fontWeight: 500,
                        }}
                      >
                        {stepDeltaDisplay > 0 ? "+" : ""}
                        {stepDeltaDisplay}
                      </span>
                    )}
                    {isEntryCompMatch && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 500,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          padding: "1px 5px",
                          borderRadius: 3,
                          backgroundColor: "rgba(245, 158, 11, 0.12)",
                          color: "#fcd34d",
                          border: "1px solid rgba(245, 158, 11, 0.35)",
                        }}
                      >
                        Comp Match
                      </span>
                    )}
                    {isEntryMeet && !isEntryCompMatch && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 500,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          padding: "1px 5px",
                          borderRadius: 3,
                          backgroundColor: "rgba(96, 165, 250, 0.12)",
                          color: "#93c5fd",
                          border: "1px solid rgba(96, 165, 250, 0.35)",
                        }}
                      >
                        Meet
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 12,
                      color: "var(--cloud-text-muted)",
                    }}
                  >
                    <span>{formatDate(entry.recorded_at)}</span>
                    {weekDay && <span style={{ marginLeft: 6 }}>· {weekDay}</span>}
                    {programLabel && (
                      <span
                        style={{
                          marginLeft: 6,
                          color: "var(--cloud-text)",
                        }}
                      >
                        · {programLabel}
                      </span>
                    )}
                  </div>
                  {sheetUrl && (
                    <a
                      href={sheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 11,
                        color: "#93c5fd",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                        textDecoration: "none",
                        flexShrink: 0,
                      }}
                      title="Open the source sheet"
                    >
                      Sheet <ExternalLink style={{ width: 11, height: 11 }} />
                    </a>
                  )}
                </div>
              );
            })}
            {lane.length === 0 && (
              <p
                style={{
                  fontSize: 13,
                  color: "var(--cloud-text-muted)",
                  margin: 0,
                }}
              >
                No prior progression recorded.
              </p>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
