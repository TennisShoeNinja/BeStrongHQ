"use client";

import { useQuery } from "@tanstack/react-query";
import { Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import apiClient from "@/lib/api";
import { Spark } from "@/components/spark";
import { convertWeight, unitLabel, type WeightUnit } from "@/lib/units";
import type * as Types from "@/lib/types";

interface Props {
  athlete: Types.AthleteResponse;
  unit: WeightUnit;
  onOpen: () => void;
}

/** Within plus/minus this many lbs over the window reads as "holding". */
const BW_FLAT_LBS = 1.5;
/** Trend window: weigh-ins from roughly the last six weeks. */
const BW_WINDOW_DAYS = 42;

const SHELL: React.CSSProperties = {
  background: "var(--cloud-panel)",
  border: "1px solid var(--cloud-border)",
  borderRadius: "var(--cloud-r-md)",
  padding: "12px var(--cloud-s3)",
};
const LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--cloud-text-dim)",
};

const DIR: Record<"up" | "flat" | "down", { label: string; Icon: LucideIcon }> = {
  up: { label: "Gaining", Icon: TrendingUp },
  flat: { label: "Holding", Icon: Minus },
  down: { label: "Dropping", Icon: TrendingDown },
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function MobileBodyweightCard({ athlete, unit, onOpen }: Props) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["bodyweight-trend", athlete.id],
    queryFn: () => apiClient.getBodyweightTrend(athlete.id),
  });

  const sorted = [...rows]
    .filter((p) => p.bodyweight_lbs != null && p.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (isLoading) {
    return (
      <div style={{ ...SHELL, height: 84 }}>
        <span style={LABEL}>Body weight</span>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div style={SHELL}>
        <span style={LABEL}>Body weight</span>
        <p
          style={{
            fontSize: 13,
            color: "var(--cloud-text-muted)",
            margin: "6px 0 0",
          }}
        >
          No weigh-ins logged yet.
        </p>
      </div>
    );
  }

  const current = sorted[sorted.length - 1].bodyweight_lbs as number;

  // Trend window: weigh-ins from the last ~6 weeks, else the last two on file.
  const lastTime = new Date(sorted[sorted.length - 1].date).getTime();
  const cutoff = lastTime - BW_WINDOW_DAYS * 86400000;
  let windowPts = sorted.filter((p) => new Date(p.date).getTime() >= cutoff);
  if (windowPts.length < 2) windowPts = sorted.slice(-2);

  const series = windowPts.map((p) => p.bodyweight_lbs as number);
  const hasTrend = series.length >= 2;
  const deltaLbs = hasTrend ? series[series.length - 1] - series[0] : 0;

  let dir: "up" | "flat" | "down" = "flat";
  if (hasTrend && deltaLbs > BW_FLAT_LBS) dir = "up";
  else if (hasTrend && deltaLbs < -BW_FLAT_LBS) dir = "down";
  const verdict = DIR[dir];

  // Sparkline scaled to a tight band so a real cut shows, without a daily
  // ounce of noise dramatising the line.
  const mean = series.reduce((s, v) => s + v, 0) / series.length;
  const halfBand = Math.max(mean * 0.06, 1);
  const domain: [number, number] = [mean - halfBand, mean + halfBand];

  const goal = athlete.goal_bodyweight_lbs ?? null;
  let goalText: string | null = null;
  let goalOnTarget = false;
  if (goal != null) {
    const gapLbs = current - goal;
    if (Math.abs(gapLbs) <= 1) {
      goalText = "On goal";
      goalOnTarget = true;
    } else {
      goalText = `${round1(convertWeight(Math.abs(gapLbs), unit))} ${unitLabel(
        unit,
      )} ${gapLbs > 0 ? "above" : "below"} goal`;
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{ ...SHELL, cursor: "pointer" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={LABEL}>Body weight</span>
        {hasTrend && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              fontWeight: 600,
              color: "var(--cloud-text-muted)",
            }}
          >
            <verdict.Icon style={{ width: 13, height: 13 }} />
            {verdict.label}
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
          {round1(convertWeight(current, unit))}
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
        {hasTrend && (
          <Spark
            points={series}
            tone="primary"
            domain={domain}
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
        }}
      >
        {hasTrend
          ? `${deltaLbs >= 0 ? "+" : "-"}${round1(
              convertWeight(Math.abs(deltaLbs), unit),
            )} ${unitLabel(unit)} · last 6 wk`
          : "Not enough weigh-ins for a trend yet"}
      </p>
      {goalText && (
        <p
          style={{
            fontSize: 11,
            fontWeight: 500,
            margin: "2px 0 0",
            color: goalOnTarget
              ? "var(--cloud-success-text)"
              : "var(--cloud-text-dim)",
          }}
        >
          {goalText}
        </p>
      )}
    </div>
  );
}
