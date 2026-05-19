"use client";

import { useQuery } from "@tanstack/react-query";
import { Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import apiClient from "@/lib/api";
import { Spark } from "@/components/spark";
import { LIFTS, type LiftKey } from "@/lib/progression";
import {
  computeLiftTrend,
  type LiftTrend,
  type TrendDirection,
} from "@/lib/mobile-trend";
import { convertWeight, unitLabel, type WeightUnit } from "@/lib/units";
import type * as Types from "@/lib/types";

interface Props {
  athlete: Types.AthleteResponse;
  programs: Types.ProgramListResponse[];
  unit: WeightUnit;
  onSelectLift?: (lift: LiftKey) => void;
}

const VERDICT: Record<
  TrendDirection,
  { label: string; color: string; tone: "success" | "danger" | "primary"; Icon: LucideIcon }
> = {
  up: {
    label: "Trending up",
    color: "var(--cloud-success-text)",
    tone: "success",
    Icon: TrendingUp,
  },
  flat: {
    label: "Holding",
    color: "var(--cloud-text-muted)",
    tone: "primary",
    Icon: Minus,
  },
  down: {
    label: "Sliding",
    color: "var(--cloud-danger-text)",
    tone: "danger",
    Icon: TrendingDown,
  },
};

function storedMax(athlete: Types.AthleteResponse, lift: LiftKey): number | null {
  const v =
    lift === "squat"
      ? athlete.squat_max_lbs
      : lift === "bench"
        ? athlete.bench_max_lbs
        : athlete.deadlift_max_lbs;
  return v ?? null;
}

/**
 * Fixed plus/minus 10% band for the sparkline so its slope reflects the
 * real size of the move. Without it Spark auto-zooms to the series, which
 * dramatises a 4 lb "holding" wobble into the same steep line as a 40 lb
 * climb.
 */
function sparkBand(series: number[]): [number, number] | undefined {
  if (series.length < 2) return undefined;
  const mean = series.reduce((sum, v) => sum + v, 0) / series.length;
  const half = Math.max(mean * 0.1, 1);
  return [mean - half, mean + half];
}

function cardShell(children: React.ReactNode, onClick?: () => void) {
  const style: React.CSSProperties = {
    background: "var(--cloud-panel)",
    border: "1px solid var(--cloud-border)",
    borderRadius: "var(--cloud-r-md)",
    padding: "12px var(--cloud-s3)",
  };
  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        style={{ ...style, cursor: "pointer" }}
      >
        {children}
      </div>
    );
  }
  return <div style={style}>{children}</div>;
}

function LiftCard({
  label,
  trend,
  fallbackMax,
  unit,
  onSelect,
}: {
  label: string;
  trend: LiftTrend;
  fallbackMax: number | null;
  unit: WeightUnit;
  onSelect?: () => void;
}) {
  const verdict = trend.direction ? VERDICT[trend.direction] : null;
  const usingStored = trend.currentE1rm == null && fallbackMax != null;
  const valueLbs = trend.currentE1rm ?? fallbackMax;
  const valueStr =
    valueLbs != null ? String(Math.round(convertWeight(valueLbs, unit))) : "-";

  const deltaStr =
    trend.deltaLbs != null
      ? `${trend.deltaLbs >= 0 ? "+" : "-"}${Math.round(
          convertWeight(Math.abs(trend.deltaLbs), unit),
        )} ${unitLabel(unit)}`
      : null;
  const scopeStr =
    trend.scope === "current"
      ? "this block"
      : trend.scope === "previous"
        ? "last block"
        : null;

  let sub: string;
  if (deltaStr && scopeStr) sub = `${deltaStr} · ${scopeStr}`;
  else if (usingStored) sub = "Stored max · no training data yet";
  else if (trend.currentE1rm != null) sub = "New block · give it a week";
  else sub = "No data yet";

  return cardShell(
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--cloud-text-dim)",
            }}
          >
            {label}
          </span>
          {trend.variationLabel && (
            <p
              style={{
                fontSize: 10,
                color: "var(--cloud-text-dim)",
                margin: "2px 0 0",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {trend.variationLabel}
            </p>
          )}
        </div>
        {verdict ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
              fontSize: 11,
              fontWeight: 600,
              color: verdict.color,
            }}
          >
            <verdict.Icon style={{ width: 13, height: 13 }} />
            {verdict.label}
          </span>
        ) : (
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              flexShrink: 0,
              color: "var(--cloud-text-dim)",
            }}
          >
            {usingStored
              ? "Stored max"
              : trend.currentE1rm != null
                ? "New block"
                : "No data"}
          </span>
        )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginTop: 6,
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            color: "var(--cloud-text)",
          }}
        >
          {valueStr}
          <span
            style={{
              fontSize: 11,
              color: "var(--cloud-text-dim)",
              fontWeight: 500,
              marginLeft: 2,
            }}
          >
            {unitLabel(unit)}
          </span>
        </span>
        {verdict && trend.series.length >= 2 && (
          <Spark
            points={trend.series}
            tone={verdict.tone}
            domain={sparkBand(trend.series)}
            width={64}
            height={24}
            strokeWidth={2}
          />
        )}
      </div>

      <p
        style={{
          fontSize: 11,
          color: "var(--cloud-text-muted)",
          margin: "6px 0 0",
          letterSpacing: "0.01em",
        }}
      >
        {sub}
      </p>
      {trend.peakWeek != null && (
        <p
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "var(--cloud-warning)",
            margin: "2px 0 0",
          }}
        >
          Peaked week {trend.peakWeek}
        </p>
      )}
    </>,
    onSelect,
  );
}

export function MobileLiftCards({
  athlete,
  programs,
  unit,
  onSelectLift,
}: Props) {
  const { data: points = [], isLoading } = useQuery({
    queryKey: ["e1rm-trends", athlete.id],
    queryFn: () => apiClient.getE1RMTrends(athlete.id),
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--cloud-s2)",
      }}
    >
      {LIFTS.map((lift) => {
        if (isLoading) {
          return (
            <div key={lift.key} style={{ height: 84 }}>
              {cardShell(
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--cloud-text-dim)",
                  }}
                >
                  {lift.label}
                </span>,
              )}
            </div>
          );
        }
        return (
          <LiftCard
            key={lift.key}
            label={lift.label}
            trend={computeLiftTrend(points, programs, lift.key)}
            fallbackMax={storedMax(athlete, lift.key)}
            unit={unit}
            onSelect={
              onSelectLift ? () => onSelectLift(lift.key) : undefined
            }
          />
        );
      })}
    </div>
  );
}
