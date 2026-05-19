"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Medal } from "lucide-react";
import apiClient from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import { compactDate, sortRecentFirst } from "@/lib/pr-history";
import type { PREventEntry } from "@/lib/types";
import { convertWeight, formatWeight, type WeightUnit } from "@/lib/units";

function blockLabel(event: PREventEntry): string {
  const name = event.program_name?.trim();
  if (name) return name;
  return event.program_number != null ? `Block ${event.program_number}` : "Block";
}

function deltaLabel(deltaLbs: number, unit: WeightUnit): string {
  const converted = Math.round(convertWeight(deltaLbs, unit));
  return `${converted >= 0 ? "+" : ""}${converted} ${unit}`;
}

export function PRHistoryTimeline({
  athleteId,
  unit,
}: {
  athleteId: number;
  unit: WeightUnit;
}) {
  const { instanceSettings } = useAuth();
  const tracksRpe = instanceSettings.tracks_rpe;
  const maxLabel = tracksRpe ? "e1RM" : "Estimated max";

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["pr-events", athleteId],
    queryFn: () => apiClient.getPREvents(athleteId),
  });

  const rows = useMemo(() => [...events].sort(sortRecentFirst), [events]);
  const lifetimeTotal = rows.length;
  const totalDisplay = isLoading ? "..." : String(lifetimeTotal);

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
          <p className="cloud-eyebrow-sm" style={{ margin: 0, lineHeight: 1.3 }}>
            Celebration PRs
          </p>
          <h2 style={{ marginTop: 2 }}>PR History</h2>
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
          <span className="cloud-eyebrow-sm">
            Lifetime PRs
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="cloud-text-muted" style={{ padding: "0 var(--cloud-s4) var(--cloud-s4)", fontSize: 13 }}>
          Loading PR history...
        </div>
      ) : rows.length === 0 ? (
        <p className="cloud-text-muted" style={{ margin: 0, padding: "0 var(--cloud-s4) var(--cloud-s4)", fontSize: 13 }}>
          No PRs logged yet.
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
            {rows.map((event) => (
              <li
                key={`${event.program_id}-${event.variation_canon}-${event.recorded_at ?? "pending"}`}
                style={{
                  alignItems: "center",
                  background: "rgba(255, 255, 255, 0.025)",
                  border: "1px solid var(--cloud-border)",
                  borderRadius: 8,
                  display: "grid",
                  gap: "var(--cloud-s3)",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  padding: "12px 14px",
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
                    <p
                      className="cloud-text"
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        lineHeight: 1.25,
                        margin: 0,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={event.variation}
                    >
                      {event.variation}
                    </p>
                    {event.is_competition && (
                      <span
                        className="cloud-eyebrow-sm"
                        style={{
                          alignItems: "center",
                          background: "rgba(12, 92, 171, 0.12)",
                          border: "1px solid rgba(12, 92, 171, 0.34)",
                          borderRadius: 999,
                          display: "inline-flex",
                          gap: 5,
                          lineHeight: 1,
                          padding: "4px 7px",
                        }}
                      >
                        <Medal aria-hidden="true" size={12} strokeWidth={1.8} />
                        Competition
                      </span>
                    )}
                  </div>
                  <p className="cloud-text-muted" style={{ fontSize: 12, lineHeight: 1.4, margin: "5px 0 0" }}>
                    {blockLabel(event)} <span aria-hidden="true">/</span> {compactDate(event.recorded_at)}
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
                    style={{ fontSize: 14, fontVariantNumeric: "tabular-nums", fontWeight: 800, lineHeight: 1.2 }}
                  >
                    {formatWeight(event.e1rm, unit)}
                  </span>
                  <span
                    style={{
                      background: "rgba(34, 197, 94, 0.12)",
                      borderRadius: 999,
                      color: "#86efac",
                      fontSize: 12,
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 800,
                      lineHeight: 1.2,
                      padding: "2px 7px",
                    }}
                  >
                    {deltaLabel(event.delta, unit)}
                  </span>
                  <span className="cloud-text-dim" style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {maxLabel}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
