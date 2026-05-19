"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  Minus,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import apiClient from "@/lib/api";
import { MobileSessionView } from "@/components/mobile-session-view";
import { computeLiftTrend, type TrendDirection } from "@/lib/mobile-trend";
import type { LiftKey } from "@/lib/progression";
import { convertWeight, unitLabel, type WeightUnit } from "@/lib/units";
import type * as Types from "@/lib/types";

interface Props {
  athlete: Types.AthleteResponse;
  programs: Types.ProgramListResponse[];
  unit: WeightUnit;
  lift: LiftKey;
  liftLabel: string;
  onBack: () => void;
}

const VERDICT: Record<
  TrendDirection,
  { label: string; color: string; Icon: LucideIcon }
> = {
  up: { label: "Trending up", color: "var(--cloud-success-text)", Icon: TrendingUp },
  flat: { label: "Holding", color: "var(--cloud-text-muted)", Icon: Minus },
  down: { label: "Sliding", color: "var(--cloud-danger-text)", Icon: TrendingDown },
};

function topSet(p: Types.E1RMDataPoint, unit: WeightUnit): string {
  const w = Math.round(convertWeight(p.weight_lbs, unit));
  const base = `${w} ${unitLabel(unit)} × ${p.reps}`;
  return p.actual_rpe != null ? `${base} @ ${p.actual_rpe}` : base;
}

/**
 * Plain-language read of what changed across the block: e1RM can climb
 * from heavier weight, fewer reps, or a higher RPE, and only the first is
 * a clean strength gain. Returns null when reps changed or RPE is missing.
 */
function whatMoved(points: Types.E1RMDataPoint[]): string | null {
  if (points.length < 2) return null;
  const a = points[0];
  const b = points[points.length - 1];
  if (a.reps !== b.reps) return null;
  if (a.actual_rpe == null || b.actual_rpe == null) return null;
  if (b.weight_lbs <= a.weight_lbs) return null;
  if (b.actual_rpe === a.actual_rpe) {
    return "Same reps and RPE, heavier bar: real strength gain.";
  }
  if (b.actual_rpe < a.actual_rpe) {
    return "Heavier at a lower RPE: moving up comfortably.";
  }
  return "Heavier but at a higher RPE: grinding harder for it.";
}

function BlockChart({
  points,
  color,
  unit,
  peakIndex = -1,
  onPointClick,
}: {
  points: Types.E1RMDataPoint[];
  color: string;
  unit: WeightUnit;
  peakIndex?: number;
  onPointClick?: (index: number) => void;
}) {
  const series = points.map((p) => p.e1rm as number);
  const n = series.length;
  const mean = series.reduce((s, v) => s + v, 0) / n;
  const half = Math.max(mean * 0.1, 1);
  const lo = mean - half;
  const hi = mean + half;

  const W = 320;
  const H = 150;
  const padL = 16;
  const padR = 16;
  const padT = 30;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const x = (i: number) =>
    n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW;
  const y = (v: number) => {
    const c = Math.min(hi, Math.max(lo, v));
    return padT + (1 - (c - lo) / (hi - lo)) * plotH;
  };
  const line = series
    .map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {series.map((v, i) => {
        const isEnd = i === 0 || i === n - 1;
        const isPeak = i === peakIndex;
        const labeled = isEnd || isPeak;
        const dotColor = isPeak ? "var(--cloud-warning)" : color;
        return (
          <g key={i}>
            <circle
              cx={x(i)}
              cy={y(v)}
              r={labeled ? 4.5 : 3}
              fill="var(--cloud-surface)"
              stroke={dotColor}
              strokeWidth={2}
            />
            {labeled && (
              <text
                x={x(i)}
                y={y(v) - 11}
                fontSize={11}
                fontWeight={600}
                textAnchor="middle"
                fill={isPeak ? "var(--cloud-warning)" : "var(--cloud-text)"}
              >
                {Math.round(convertWeight(v, unit))}
              </text>
            )}
            <text
              x={x(i)}
              y={H - 8}
              fontSize={9}
              textAnchor="middle"
              fill="var(--cloud-text-dim)"
            >
              W{points[i].week_number}
            </text>
            {onPointClick && (
              <circle
                cx={x(i)}
                cy={y(v)}
                r={16}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onClick={() => onPointClick(i)}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function MobileLiftBlockView({
  athlete,
  programs,
  unit,
  lift,
  liftLabel,
  onBack,
}: Props) {
  const { data: allPoints = [], isLoading } = useQuery({
    queryKey: ["e1rm-trends", athlete.id],
    queryFn: () => apiClient.getE1RMTrends(athlete.id),
  });
  const [drillSession, setDrillSession] = useState<{
    programId: number;
    week: number;
    day: number;
  } | null>(null);

  const trend = isLoading ? null : computeLiftTrend(allPoints, programs, lift);
  const verdict = trend?.direction ? VERDICT[trend.direction] : null;
  const color = verdict?.color ?? "var(--cloud-text-muted)";
  const points = trend?.points ?? [];
  const insight = whatMoved(points);
  const peakIndex =
    trend?.peakWeek != null
      ? points.findIndex((p) => p.week_number === trend.peakWeek)
      : -1;
  const scopeStr =
    trend?.scope === "current"
      ? "this block"
      : trend?.scope === "previous"
        ? "last block"
        : null;
  const deltaStr =
    trend?.deltaLbs != null
      ? `${trend.deltaLbs >= 0 ? "+" : "-"}${Math.round(
          convertWeight(Math.abs(trend.deltaLbs), unit),
        )} ${unitLabel(unit)}`
      : null;

  const openSession = (p: Types.E1RMDataPoint) => {
    if (p.program_id == null) return;
    setDrillSession({
      programId: p.program_id,
      week: p.week_number,
      day: p.day_number,
    });
  };

  if (drillSession) {
    return (
      <MobileSessionView
        athlete={athlete}
        unit={unit}
        lift={lift}
        liftLabel={liftLabel}
        programId={drillSession.programId}
        week={drillSession.week}
        day={drillSession.day}
        onBack={() => setDrillSession(null)}
      />
    );
  }

  return (
    <div>
      {/* Back bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
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
        {/* Title */}
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
        {trend?.variationLabel && (
          <p
            style={{
              fontSize: 12,
              color: "var(--cloud-text-dim)",
              margin: "2px 0 0",
            }}
          >
            {trend.variationLabel}
          </p>
        )}

        {/* Verdict + delta */}
        {verdict && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              margin: "var(--cloud-s3) 0 0",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 13,
                fontWeight: 600,
                color: verdict.color,
              }}
            >
              <verdict.Icon style={{ width: 15, height: 15 }} />
              {verdict.label}
            </span>
            {deltaStr && scopeStr && (
              <span style={{ fontSize: 12, color: "var(--cloud-text-muted)" }}>
                {deltaStr} · {scopeStr}
              </span>
            )}
          </div>
        )}

        {trend?.peakWeek != null && (
          <p
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--cloud-warning)",
              margin: "6px 0 0",
            }}
          >
            Peaked at week {trend.peakWeek}, then eased off by the last session.
          </p>
        )}

        {/* Chart */}
        <div style={{ marginTop: "var(--cloud-s3)" }}>
          {isLoading ? (
            <div
              className="cloud-panel"
              style={{ height: 150, borderRadius: "var(--cloud-r-md)" }}
            />
          ) : points.length >= 2 ? (
            <div
              className="cloud-panel"
              style={{
                borderRadius: "var(--cloud-r-md)",
                padding: "var(--cloud-s2)",
              }}
            >
              <BlockChart
                points={points}
                color={color}
                unit={unit}
                peakIndex={peakIndex}
                onPointClick={(i) => openSession(points[i])}
              />
            </div>
          ) : (
            <p
              style={{
                fontSize: 13,
                color: "var(--cloud-text-muted)",
                margin: 0,
              }}
            >
              Not enough sessions logged in this block yet for a trend.
            </p>
          )}
        </div>

        {/* What moved */}
        {insight && (
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--cloud-text)",
              margin: "var(--cloud-s3) 0 0",
            }}
          >
            {insight}
          </p>
        )}

        {/* Session list */}
        {points.length > 0 && (
          <>
            <div
              className="cloud-mhome-section-h"
              style={{ marginTop: "var(--cloud-s4)" }}
            >
              <p className="eyebrow">Sessions</p>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--cloud-s2)",
              }}
            >
              {[...points].reverse().map((p, i) => (
                <div
                  key={`${p.week_number}-${p.day_number}-${i}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openSession(p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openSession(p);
                    }
                  }}
                  style={{
                    background: "var(--cloud-panel)",
                    border: "1px solid var(--cloud-border)",
                    borderRadius: "var(--cloud-r-md)",
                    padding: "10px var(--cloud-s3)",
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 12,
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        margin: 0,
                      }}
                    >
                      Week {p.week_number}
                      {p.day_name ? ` · ${p.day_name}` : ""}
                    </p>
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--cloud-text-muted)",
                        margin: "2px 0 0",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {topSet(p, unit)}
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
                    {p.e1rm != null
                      ? Math.round(convertWeight(p.e1rm, unit))
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
          </>
        )}
      </div>
    </div>
  );
}
