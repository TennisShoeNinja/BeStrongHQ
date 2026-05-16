"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { useTheme } from "@/lib/theme-provider";
import { LIFTS, type ChartRow, type LiftKey } from "@/lib/progression";

interface Props {
  rows: ChartRow[];
  visibleLifts: Set<LiftKey>;
  /** block-boundary timestamps for dashed reference verticals */
  boundaries: number[];
  unit: string;
  height?: number;
  mode?: "e1rm" | "volume";
  series?: { key: string; label: string; color: string }[];
}

/**
 * Multi-lift e1RM trajectory chart. One themed Recharts line per visible
 * lift, sharing a time x-axis, with dashed verticals where programs change.
 */
export function ProgressionChart({
  rows,
  visibleLifts,
  boundaries,
  unit,
  height = 280,
  mode = "e1rm",
  series,
}: Props) {
  const { resolvedMode } = useTheme();
  const dark = resolvedMode === "dark";
  const gridColor = dark ? "rgba(255,255,255,0.06)" : "#e2e8f0";
  const textColor = dark ? "rgba(250,250,250,0.5)" : "#64748b";
  const tooltipBg = dark ? "#09090b" : "#ffffff";
  const tooltipBorder = dark ? "rgba(255,255,255,0.18)" : "#e2e8f0";
  const boundaryColor = dark
    ? "rgba(124,180,237,0.20)"
    : "rgba(12,92,171,0.16)";
  const valueFormatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  });
  const isVolume = mode === "volume";

  if (rows.length < 2) {
    return (
      <div style={{ height, display: "grid", placeItems: "center" }}>
        <p className="cloud-text-dim" style={{ fontSize: 13 }}>
          Not enough training history to chart yet.
        </p>
      </div>
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tick={{ fontSize: 11, fill: textColor }}
            tickLine={false}
            tickFormatter={(ts: number) =>
              new Date(ts).toLocaleDateString("en-US", {
                month: "short",
                year: "2-digit",
              })
            }
          />
          <YAxis
            tick={{ fontSize: 11, fill: textColor }}
            tickLine={false}
            width={isVolume ? 54 : 40}
            domain={isVolume ? [0, "dataMax + 1000"] : ["dataMin - 10", "dataMax + 10"]}
            tickFormatter={(v: number) =>
              isVolume ? valueFormatter.format(Math.round(v)) : `${Math.round(v)}`
            }
          />
          <Tooltip
            contentStyle={{
              backgroundColor: tooltipBg,
              border: `1px solid ${tooltipBorder}`,
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelFormatter={(label) => {
              const ts = Number(label);
              return Number.isFinite(ts)
                ? new Date(ts).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "";
            }}
            formatter={(value, name) => {
              const formatted = valueFormatter.format(Math.round(Number(value)));
              return [
                isVolume ? formatted : `${Math.round(Number(value))} ${unit}`,
                isVolume ? `${name} volume` : name,
              ];
            }}
          />
          {boundaries.map((b, i) => (
            <ReferenceLine
              key={`boundary-${i}`}
              x={b}
              stroke={boundaryColor}
              strokeDasharray="2 3"
            />
          ))}
          {(series ?? LIFTS.filter((l) => visibleLifts.has(l.key))).map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 2, fill: s.color }}
              activeDot={{ r: 5 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
