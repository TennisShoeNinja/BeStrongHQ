"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";
import apiClient from "@/lib/api";
import * as Types from "@/lib/types";
import { convertWeight, formatWeight, kgToLbs, type WeightUnit } from "@/lib/units";
import { weightClassCapKg } from "@/lib/weight-classes";
import { useTheme } from "@/lib/theme-provider";
import { formatDate } from "./utils";
import { WeightChangeStat } from "./WeightChangeStat";


type BwTimeRange = "4w" | "3m" | "6m" | "1y" | "all";
const BW_RANGE_LABELS: Record<BwTimeRange, string> = {
  "4w": "4 Weeks",
  "3m": "3 Months",
  "6m": "6 Months",
  "1y": "1 Year",
  all: "All Time",
};
const BW_RANGE_DAYS: Record<BwTimeRange, number> = {
  "4w": 28,
  "3m": 90,
  "6m": 180,
  "1y": 365,
  all: 99999,
};

type StartingMode = "program" | "all";

const round1 = (n: number): number => Math.round(n * 10) / 10;


export function BodyMetricsCard({
  athleteId,
  unit,
  weightClass,
  goalBodyweightLbs,
  hasUpcomingMeet,
  hidden,
}: {
  athleteId: number;
  unit: WeightUnit;
  weightClass: string | null;
  goalBodyweightLbs: number | null;
  hasUpcomingMeet: boolean;
  hidden: boolean;
}) {
  const { resolvedMode } = useTheme();
  const [showMacroTable, setShowMacroTable] = useState(false);
  const [bwRange, setBwRange] = useState<BwTimeRange>("3m");
  const [startingMode, setStartingMode] = useState<StartingMode>("program");

  const { data: wellnessData, isLoading } = useQuery({
    queryKey: ["wellness", athleteId],
    queryFn: () => apiClient.getAthleteWellness(athleteId),
    enabled: !hidden,
  });

  const { data: bwTrend = [] } = useQuery({
    queryKey: ["bodyweight-trend", athleteId],
    queryFn: () => apiClient.getBodyweightTrend(athleteId),
    enabled: !hidden,
  });

  
  
  
  
  const gridColor = resolvedMode === "dark" ? "rgba(255,255,255,0.06)" : "#e2e8f0";
  const textColor = resolvedMode === "dark" ? "rgba(250,250,250,0.5)" : "#64748b";
  const bwLineColor = "#22d3ee"; 
  
  
  
  const tooltipBg = resolvedMode === "dark" ? "#09090b" : "#ffffff";
  const tooltipBorder = resolvedMode === "dark" ? "rgba(255,255,255,0.18)" : "#e2e8f0";
  const tooltipShadow = resolvedMode === "dark"
    ? "0 10px 24px -8px rgba(0,0,0,0.7), 0 4px 12px -4px rgba(0,0,0,0.5)"
    : "0 4px 12px rgba(0,0,0,0.1)";

  if (hidden) return null;

  if (isLoading) {
    return (
      <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
        <div className="cloud-panel-head">
          <h2>Body Metrics</h2>
        </div>
        <div className="cloud-text-muted" style={{ padding: "var(--cloud-s4)", fontSize: 13 }}>
          Loading body metrics...
        </div>
      </div>
    );
  }

  if (!wellnessData || wellnessData.summary.total_entries === 0) {
    
    
    
    return (
      <div
        className="cloud-panel flex items-center"
        style={{
          marginBottom: "var(--cloud-s5)",
          padding: "var(--cloud-s2) var(--cloud-s4)",
          gap: "var(--cloud-s2)",
          fontSize: 12,
        }}
      >
        <span className="cloud-text" style={{ fontWeight: 500 }}>Body Metrics</span>
        <span className="cloud-text-muted">— no tracking data yet</span>
      </div>
    );
  }

  const { summary } = wellnessData;

  
  
  const rangeCounts = (() => {
    const today = new Date();
    const counts: Record<BwTimeRange, number> = {
      "4w": 0,
      "3m": 0,
      "6m": 0,
      "1y": 0,
      all: bwTrend.length,
    };
    for (const r of ["4w", "3m", "6m", "1y"] as BwTimeRange[]) {
      const cutoff = new Date(today);
      cutoff.setDate(cutoff.getDate() - BW_RANGE_DAYS[r]);
      const cutoffStr = cutoff.toISOString().split("T")[0];
      counts[r] = bwTrend.filter((pt) => (pt.date || "") >= cutoffStr).length;
    }
    return counts;
  })();

  
  
  const activeRange: BwTimeRange = (() => {
    if (rangeCounts[bwRange] >= 2) return bwRange;
    for (const r of ["4w", "3m", "6m", "1y"] as BwTimeRange[]) {
      if (rangeCounts[r] >= 2) return r;
    }
    return "all";
  })();

  
  const filteredBwTrend = (() => {
    if (activeRange === "all") return bwTrend;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - BW_RANGE_DAYS[activeRange]);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    return bwTrend.filter((pt) => (pt.date || "") >= cutoffStr);
  })();

  
  
  
  
  
  const toChartPoint = (pt: Types.BodyweightTrendPoint) => ({
    ts: pt.date ? new Date(pt.date + "T00:00:00").getTime() : NaN,
    bodyweight: pt.bodyweight_lbs != null ? convertWeight(pt.bodyweight_lbs, unit) : null,
  });
  const chartData = filteredBwTrend
    .map(toChartPoint)
    .filter((pt) => Number.isFinite(pt.ts));

  const chartSpanDays =
    chartData.length >= 2
      ? Math.round(
          (chartData[chartData.length - 1].ts - chartData[0].ts) / 86400000
        )
      : 0;

  const formatXTick = (ts: number) => {
    if (!Number.isFinite(ts)) return "";
    const d = new Date(ts);
    if (chartSpanDays > 180) {
      return d.toLocaleDateString("en-US", { month: "short" }) +
        " '" + d.getFullYear().toString().slice(2);
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  
  const goalDisplay =
    goalBodyweightLbs != null ? convertWeight(goalBodyweightLbs, unit) : null;
  const capKg = weightClassCapKg(weightClass);
  const capDisplay =
    capKg != null ? (unit === "kg" ? capKg : kgToLbs(capKg)) : null;
  const showCap = capDisplay != null && hasUpcomingMeet;



  const yDomain: [number | string, number | string] = (() => {
    const vals = chartData
      .map((p) => p.bodyweight)
      .filter((v): v is number => v != null);
    if (vals.length === 0) return ["dataMin - 2", "dataMax + 2"];
    if (showCap && capDisplay !== null) vals.push(capDisplay);
    if (goalDisplay !== null) vals.push(goalDisplay);
    return [Math.min(...vals) - 2, Math.max(...vals) + 2];
  })();

  
  
  const latestBw = summary.latest_bodyweight;
  const deltaToGoalLbs =
    latestBw != null && goalBodyweightLbs != null
      ? round1(latestBw - goalBodyweightLbs)
      : null;
  const deltaToCapLbs =
    latestBw != null && capKg != null
      ? round1(latestBw - kgToLbs(capKg))
      : null;

  
  const macroEntries = wellnessData.data
    .filter(
      (d) =>
        d.actual_calories !== null ||
        d.actual_protein !== null ||
        d.actual_carbs !== null ||
        d.actual_fat !== null
    )
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
      <div className="cloud-panel-head">
        <h2>Body Metrics</h2>
      </div>

      <div className="space-y-6" style={{ padding: "var(--cloud-s4)" }}>
        {}
        {(() => {
          const hasWeight =
            summary.starting_bodyweight !== null ||
            summary.latest_bodyweight !== null ||
            summary.min_bodyweight !== null ||
            summary.bodyweight_change !== null ||
            summary.change_30d !== null ||
            summary.avg_bw_this_week !== null;
          const hasNutrition =
            summary.avg_actual_calories !== null ||
            summary.calorie_compliance_pct !== null;
          if (!hasWeight && !hasNutrition) return null;

          const effectiveStartingMode: StartingMode =
            startingMode === "program" && summary.starting_bodyweight_program === null
              ? "all"
              : startingMode;
          const startingValue =
            effectiveStartingMode === "program"
              ? summary.starting_bodyweight_program
              : summary.starting_bodyweight;
          const startingDate =
            effectiveStartingMode === "program"
              ? summary.starting_bodyweight_program_date
              : summary.starting_bodyweight_date;
          const canToggleStarting =
            summary.starting_bodyweight_program !== null &&
            summary.starting_bodyweight !== null &&
            summary.starting_bodyweight_program !== summary.starting_bodyweight;

          return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {hasWeight && (
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--cloud-border)", borderRadius: "var(--cloud-r-md)", padding: "var(--cloud-s4)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className="cloud-text-dim"
                      style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}
                    >
                      Weight
                    </div>
                    {canToggleStarting && (
                      <div className="flex gap-1">
                        {(["program", "all"] as const).map((m) => {
                          const active = effectiveStartingMode === m;
                          return (
                            <button
                              key={m}
                              onClick={() => setStartingMode(m)}
                              className="px-2 py-0.5 rounded transition-colors"
                              style={{
                                fontSize: 10,
                                letterSpacing: "0.04em",
                                fontWeight: active ? 600 : 500,
                                color: active ? "#93c5fd" : "var(--cloud-text-dim)",
                                background: active ? "rgba(12, 92, 171, 0.18)" : "transparent",
                                border: `1px solid ${active ? "rgba(12, 92, 171, 0.4)" : "transparent"}`,
                              }}
                            >
                              {m === "program" ? "Program" : "All-Time"}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    {startingValue !== null && (
                      <div>
                        <div className="cloud-text-dim mb-0.5" style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}>Starting</div>
                        <div className="cloud-text font-semibold" style={{ fontSize: 18, letterSpacing: "-0.01em" }}>
                          {formatWeight(startingValue, unit, { decimals: 1 })}
                        </div>
                        {startingDate && (
                          <div className="cloud-text-dim" style={{ fontSize: 11 }}>
                            {formatDate(startingDate)}
                          </div>
                        )}
                      </div>
                    )}
                    {summary.latest_bodyweight !== null && (
                      <div>
                        <div className="cloud-text-dim mb-0.5" style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}>Current</div>
                        <div className="cloud-text font-semibold" style={{ fontSize: 18, letterSpacing: "-0.01em" }}>
                          {formatWeight(summary.latest_bodyweight, unit, { decimals: 1 })}
                        </div>
                        {summary.latest_bodyweight_date && (
                          <div className="cloud-text-dim" style={{ fontSize: 11 }}>
                            {formatDate(summary.latest_bodyweight_date)}
                          </div>
                        )}
                      </div>
                    )}
                    {summary.min_bodyweight !== null && (
                      <div>
                        <div className="cloud-text-dim mb-0.5" style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}>All-Time Low</div>
                        <div className="font-semibold" style={{ fontSize: 18, letterSpacing: "-0.01em", color: "#22d3ee" }}>
                          {formatWeight(summary.min_bodyweight, unit, { decimals: 1 })}
                        </div>
                        {summary.min_bodyweight_date && (
                          <div className="cloud-text-dim" style={{ fontSize: 11 }}>
                            {formatDate(summary.min_bodyweight_date)}
                          </div>
                        )}
                      </div>
                    )}
                    {summary.bodyweight_change !== null && (
                      <WeightChangeStat
                        label="All-Time Change"
                        valueLbs={summary.bodyweight_change}
                        unit={unit}
                      />
                    )}
                    {summary.change_30d !== null && (
                      <WeightChangeStat
                        label="Last 30 Days"
                        valueLbs={summary.change_30d}
                        unit={unit}
                      />
                    )}
                    {summary.avg_bw_this_week !== null && (
                      <div>
                        <div className="cloud-text-dim mb-0.5" style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}>This Week Avg</div>
                        <div className="cloud-text font-semibold" style={{ fontSize: 18, letterSpacing: "-0.01em" }}>
                          {formatWeight(summary.avg_bw_this_week, unit, { decimals: 1 })}
                        </div>
                        {summary.avg_bw_last_week !== null && (
                          <div className="cloud-text-dim" style={{ fontSize: 11 }}>
                            Last wk: {formatWeight(summary.avg_bw_last_week, unit, { decimals: 1 })}
                          </div>
                        )}
                      </div>
                    )}
                    {goalBodyweightLbs !== null && (
                      <div>
                        <div className="cloud-text-dim mb-0.5" style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}>Goal</div>
                        <div className="cloud-text font-semibold" style={{ fontSize: 18, letterSpacing: "-0.01em" }}>
                          {formatWeight(goalBodyweightLbs, unit, { decimals: 1 })}
                        </div>
                        {deltaToGoalLbs !== null && (
                          <div className="cloud-text-dim" style={{ fontSize: 11 }}>
                            {deltaToGoalLbs === 0
                              ? "On goal"
                              : `${deltaToGoalLbs > 0 ? "+" : "−"}${formatWeight(
                                  Math.abs(deltaToGoalLbs),
                                  unit,
                                  { decimals: 1 }
                                )} to go`}
                          </div>
                        )}
                      </div>
                    )}
                    {showCap && capDisplay !== null && (
                      <div>
                        <div className="cloud-text-dim mb-0.5" style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}>Class Cap</div>
                        <div className="cloud-text font-semibold" style={{ fontSize: 18, letterSpacing: "-0.01em" }}>
                          {unit === "kg"
                            ? `${round1(capDisplay)} kg`
                            : `${round1(capDisplay)} lbs`}
                        </div>
                        {deltaToCapLbs !== null && (
                          <div
                            style={{
                              fontSize: 11,
                              color: deltaToCapLbs > 0 ? "#fcd34d" : "var(--cloud-text-dim)",
                            }}
                          >
                            {deltaToCapLbs > 0
                              ? `+${formatWeight(deltaToCapLbs, unit, { decimals: 1 })} over`
                              : deltaToCapLbs === 0
                              ? "At cap"
                              : `${formatWeight(Math.abs(deltaToCapLbs), unit, { decimals: 1 })} under`}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {hasNutrition && (
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--cloud-border)", borderRadius: "var(--cloud-r-md)", padding: "var(--cloud-s4)" }}>
                  <div
                    className="cloud-text-dim mb-3"
                    style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}
                  >
                    Nutrition
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    {summary.avg_actual_calories !== null && (
                      <div>
                        <div className="cloud-text-dim mb-0.5" style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}>Avg Calories</div>
                        <div className="cloud-text font-semibold" style={{ fontSize: 18, letterSpacing: "-0.01em" }}>
                          {Math.round(summary.avg_actual_calories)}
                        </div>
                        {summary.avg_goal_calories !== null && (
                          <div className="cloud-text-dim" style={{ fontSize: 11 }}>
                            Goal: {Math.round(summary.avg_goal_calories)}
                          </div>
                        )}
                      </div>
                    )}
                    {summary.calorie_compliance_pct !== null && (
                      <div>
                        <div className="cloud-text-dim mb-0.5" style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}>Logging</div>
                        <div
                          className="font-semibold"
                          style={{
                            fontSize: 18,
                            letterSpacing: "-0.01em",
                            color:
                              summary.calorie_compliance_pct >= 80
                                ? "#86efac"
                                : summary.calorie_compliance_pct >= 50
                                ? "#93c5fd"
                                : "#fcd34d",
                          }}
                        >
                          {summary.calorie_compliance_pct}%
                        </div>
                        <div className="cloud-text-dim" style={{ fontSize: 11 }}>
                          {summary.entries_with_calories} of {summary.total_entries} days
                        </div>
                      </div>
                    )}
                    {summary.avg_actual_protein !== null && (
                      <div>
                        <div className="cloud-text-dim mb-0.5" style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}>Avg Protein</div>
                        <div className="cloud-text font-semibold" style={{ fontSize: 18, letterSpacing: "-0.01em" }}>
                          {Math.round(summary.avg_actual_protein)}g
                        </div>
                      </div>
                    )}
                    {summary.avg_actual_carbs !== null && (
                      <div>
                        <div className="cloud-text-dim mb-0.5" style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}>Avg Carbs</div>
                        <div className="cloud-text font-semibold" style={{ fontSize: 18, letterSpacing: "-0.01em" }}>
                          {Math.round(summary.avg_actual_carbs)}g
                        </div>
                      </div>
                    )}
                    {summary.avg_actual_fat !== null && (
                      <div>
                        <div className="cloud-text-dim mb-0.5" style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}>Avg Fat</div>
                        <div className="cloud-text font-semibold" style={{ fontSize: 18, letterSpacing: "-0.01em" }}>
                          {Math.round(summary.avg_actual_fat)}g
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {}
        {bwTrend.length >= 2 && (
          <div>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="cloud-text flex items-center gap-1.5 font-medium" style={{ fontSize: 13 }}>
                Bodyweight Trend
                <span
                  className="cloud-text-dim font-normal"
                  style={{ fontSize: 11 }}
                  title={
                    chartData.length === bwTrend.length
                      ? `${bwTrend.length} weigh-in${bwTrend.length !== 1 ? "s" : ""} on file`
                      : `${chartData.length} in the active range · ${bwTrend.length} total on file`
                  }
                >
                  {chartData.length === bwTrend.length
                    ? `${bwTrend.length} weigh-in${bwTrend.length !== 1 ? "s" : ""}`
                    : `${chartData.length} of ${bwTrend.length} weigh-ins`}
                </span>
              </h3>
              <div className="flex gap-1">
                {(Object.keys(BW_RANGE_LABELS) as BwTimeRange[]).map((range) => {
                  const count = rangeCounts[range];
                  const disabled = count < 2;
                  const active = activeRange === range;
                  return (
                    <button
                      key={range}
                      onClick={() => {
                        if (!disabled) setBwRange(range);
                      }}
                      disabled={disabled}
                      title={
                        disabled
                          ? `No weigh-ins in this range`
                          : `${count} weigh-in${count !== 1 ? "s" : ""}`
                      }
                      className="px-2.5 py-1 rounded transition-colors"
                      style={{
                        fontSize: 11,
                        fontWeight: active ? 600 : 500,
                        color: active
                          ? "#93c5fd"
                          : disabled
                          ? "var(--cloud-text-dim)"
                          : "var(--cloud-text-muted)",
                        background: active ? "rgba(12, 92, 171, 0.18)" : "transparent",
                        border: `1px solid ${active ? "rgba(12, 92, 171, 0.4)" : "transparent"}`,
                        opacity: disabled ? 0.4 : 1,
                        cursor: disabled ? "not-allowed" : "pointer",
                      }}
                    >
                      {BW_RANGE_LABELS[range]}
                    </button>
                  );
                })}
              </div>
            </div>
            {chartData.length < 2 ? (
              <div className="h-64 flex items-center justify-center">
                <p className="cloud-text-dim text-sm">No weigh-ins on file yet</p>
              </div>
            ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height={256}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tick={{ fontSize: 11, fill: textColor }}
                    tickLine={false}
                    tickFormatter={formatXTick}
                    angle={chartSpanDays > 90 ? -35 : 0}
                    textAnchor={chartSpanDays > 90 ? "end" : "middle"}
                    height={chartSpanDays > 90 ? 50 : 30}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: textColor }}
                    tickLine={false}
                    domain={yDomain}
                    tickFormatter={(v: number) => `${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: tooltipBg,
                      border: `1px solid ${tooltipBorder}`,
                      borderRadius: "8px",
                      fontSize: "12px",
                      boxShadow: tooltipShadow,
                    }}
                    labelFormatter={(label) => {
                      const ts = Number(label);
                      if (!Number.isFinite(ts)) return "";
                      const d = new Date(ts);
                      return d.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      });
                    }}
                    formatter={(value) => {
                      if (value == null) return ["—", "Bodyweight"];
                      return [`${(Math.round(Number(value) * 10) / 10)} ${unit}`, "Bodyweight"];
                    }}
                  />
                  {goalDisplay !== null && (
                    <ReferenceLine
                      y={goalDisplay}
                      stroke="#10b981"
                      strokeDasharray="4 4"
                      label={{
                        value: `Goal ${round1(goalDisplay)}`,
                        position: "insideTopRight",
                        fill: "#86efac",
                        fontSize: 10,
                      }}
                    />
                  )}
                  {showCap && capDisplay !== null && (
                    <ReferenceLine
                      y={capDisplay}
                      stroke="#ef4444"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      label={{
                        value: `Class Cap ${round1(capDisplay)}`,
                        position: "insideBottomRight",
                        fill: "#fca5a5",
                        fontSize: 10,
                      }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="bodyweight"
                    stroke={bwLineColor}
                    strokeWidth={2}
                    dot={{ r: 2.5, fill: bwLineColor }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            )}
          </div>
        )}

        {}
        {macroEntries.length > 0 && (
          <div>
            <button
              onClick={() => setShowMacroTable(!showMacroTable)}
              className="w-full flex items-center gap-2 px-3 py-2 cloud-text-muted hover:bg-[rgba(255,255,255,0.03)] transition-colors rounded"
              style={{ fontSize: 12, fontWeight: 500 }}
            >
              {showMacroTable ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <span title="All-time count of days with macro data logged.">
                Daily Nutrition Log ({macroEntries.length} days logged, all-time)
              </span>
            </button>

            {showMacroTable && (
              <div
                className="mt-2 overflow-x-auto rounded"
                style={{ border: "1px solid var(--cloud-border)", background: "rgba(255,255,255,0.02)" }}
              >
                <table className="w-full">
                  <thead>
                    <tr
                      className="cloud-text-dim"
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        fontWeight: 500,
                        background: "rgba(0,0,0,0.15)",
                      }}
                    >
                      <th className="text-left py-2 px-3">Date</th>
                      <th className="text-right py-2 px-3">Calories</th>
                      <th className="text-right py-2 px-3">Protein</th>
                      <th className="text-right py-2 px-3">Carbs</th>
                      <th className="text-right py-2 px-3">Fat</th>
                      <th className="text-right py-2 px-3">Weight ({unit})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {macroEntries.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-t border-[color:var(--cloud-border)] hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                      >
                        <td className="py-2 px-3 cloud-text" style={{ fontSize: 12 }}>
                          {entry.date ? formatDate(entry.date) : `W${entry.week_number} ${entry.day_of_week}`}
                        </td>
                        <td className="text-right py-2 px-3 cloud-text" style={{ fontSize: 12 }}>
                          {entry.actual_calories !== null ? Math.round(entry.actual_calories) : "—"}
                          {entry.goal_calories !== null && (
                            <span className="cloud-text-dim ml-1" style={{ fontSize: 11 }}>
                              / {Math.round(entry.goal_calories)}
                            </span>
                          )}
                        </td>
                        <td className="text-right py-2 px-3 cloud-text" style={{ fontSize: 12 }}>
                          {entry.actual_protein !== null ? `${Math.round(entry.actual_protein)}g` : "—"}
                        </td>
                        <td className="text-right py-2 px-3 cloud-text" style={{ fontSize: 12 }}>
                          {entry.actual_carbs !== null ? `${Math.round(entry.actual_carbs)}g` : "—"}
                        </td>
                        <td className="text-right py-2 px-3 cloud-text" style={{ fontSize: 12 }}>
                          {entry.actual_fat !== null ? `${Math.round(entry.actual_fat)}g` : "—"}
                        </td>
                        <td className="text-right py-2 px-3 cloud-text" style={{ fontSize: 12 }}>
                          {entry.bodyweight_lbs !== null
                            ? formatWeight(entry.bodyweight_lbs, unit, { decimals: 1, unitless: true })
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
