"use client";

import { useMemo } from "react";

export interface ChartPoint {
  date: Date;
  value: number;
  isMeet?: boolean;
}

export interface BlockBoundary {
  date: Date;
  label?: string;
  blockType?: string;
  tooltipText?: string;
}

interface Props {
  points: ChartPoint[];
  blockBoundaries?: BlockBoundary[];
  rangeStart?: Date;
  rangeEnd?: Date;
  /** y-axis label/unit (e.g. "kg" or "lb") */
  unit?: string;
  /** caption above the chart */
  label?: string;
  /** delta string shown next to the label (e.g. "+27 since Nov") */
  caption?: string;
  /** disable the trailing glow on the latest point */
  hideCurrentGlow?: boolean;
}

// X-axis padding (room for y-axis labels on left)
const PAD_L = 28;
const PAD_R = 8;
const PAD_T = 24;
const PAD_B = 32;

const VB_W = 320;
const VB_H = 210;
const PLOT_W = VB_W - PAD_L - PAD_R;
const PLOT_H = VB_H - PAD_T - PAD_B;

const TICK_COUNT = 4;

function niceMax(rawMax: number, rawMin: number): { max: number; min: number; step: number } {
  const range = rawMax - rawMin;
  if (range <= 0) {
    return { max: rawMax + 10, min: Math.max(0, rawMax - 30), step: 10 };
  }
  const steps = [5, 10, 20, 25, 50, 100];
  const targetStep = range / (TICK_COUNT - 1);
  const step = steps.find((s) => s >= targetStep) ?? Math.ceil(targetStep / 10) * 10;
  const min = Math.floor(rawMin / step) * step;
  const max = min + step * (TICK_COUNT - 1);
  return { min, max: Math.max(max, Math.ceil(rawMax / step) * step), step };
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
}

export function E1RMChart({
  points,
  blockBoundaries = [],
  rangeStart,
  rangeEnd,
  unit,
  label,
  caption,
  hideCurrentGlow,
}: Props) {
  const computed = useMemo(() => {
    if (points.length === 0) return null;
    const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());
    const start = rangeStart ?? sorted[0].date;
    const end = rangeEnd ?? sorted[sorted.length - 1].date;
    const visible = sorted.filter(
      (p) => p.date >= start && p.date <= end,
    );
    if (visible.length === 0) return null;

    const values = visible.map((p) => p.value);
    const rawMax = Math.max(...values);
    const rawMin = Math.min(...values);
    const { min: yMin, max: yMax, step: yStep } = niceMax(rawMax, rawMin);

    const timeSpan = Math.max(1, end.getTime() - start.getTime());
    const xOf = (d: Date) =>
      PAD_L + ((d.getTime() - start.getTime()) / timeSpan) * PLOT_W;
    const yOf = (v: number) =>
      PAD_T + ((yMax - v) / (yMax - yMin)) * PLOT_H;

    const coords = visible.map((p) => ({
      ...p,
      x: xOf(p.date),
      y: yOf(p.value),
    }));

    // Y-axis ticks (3-4 labels evenly spaced)
    const ticks: { y: number; label: number }[] = [];
    for (let v = yMin; v <= yMax; v += yStep) {
      ticks.push({ y: yOf(v), label: v });
    }

    // X-axis ticks, pick 3-4 months across the range
    const xTicks: { x: number; label: string }[] = [];
    const monthCursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (monthCursor <= end) {
      const cx = xOf(monthCursor);
      if (cx >= PAD_L - 2 && cx <= VB_W - PAD_R + 2) {
        xTicks.push({ x: cx, label: monthLabel(monthCursor) });
      }
      monthCursor.setMonth(monthCursor.getMonth() + 1);
    }
    // Decimate to ~4 labels if too many
    const stride = Math.max(1, Math.ceil(xTicks.length / 4));
    const xTicksOut = xTicks.filter((_, i) => i % stride === 0);

    const blockLines = blockBoundaries
      .filter((b) => b.date >= start && b.date <= end)
      .map((b) => ({
        x: xOf(b.date),
        label: b.label,
        tip: b.tooltipText ?? b.blockType,
      }));

    // Build area path (polyline closed at the bottom)
    const polylinePts = coords.map((c) => `${c.x},${c.y}`).join(" ");
    const areaPath = [
      `M ${coords[0].x},${coords[0].y}`,
      ...coords.slice(1).map((c) => `L ${c.x},${c.y}`),
      `L ${coords[coords.length - 1].x},${PAD_T + PLOT_H}`,
      `L ${coords[0].x},${PAD_T + PLOT_H}`,
      "Z",
    ].join(" ");

    const latest = coords[coords.length - 1];

    return {
      coords,
      latest,
      yTicks: ticks,
      xTicks: xTicksOut,
      blockLines,
      polylinePts,
      areaPath,
    };
  }, [points, blockBoundaries, rangeStart, rangeEnd]);

  return (
    <div
      style={{
        position: "relative",
        background: "var(--cloud-panel)",
        border: "1px solid var(--cloud-border)",
        borderRadius: "var(--cloud-r-lg)",
        padding: "16px 8px 6px",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.03), transparent 30%)",
          pointerEvents: "none",
        }}
      />
      {(label || caption) && (
        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            padding: "0 8px 12px",
          }}
        >
          {label && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--cloud-text-dim)",
              }}
            >
              {label}
            </span>
          )}
          {caption && (
            <span
              style={{
                fontSize: 11,
                color: "var(--cloud-success-text)",
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {caption}
            </span>
          )}
        </div>
      )}
      {!computed ? (
        <div
          className="cloud-text-muted"
          style={{
            position: "relative",
            padding: 48,
            textAlign: "center",
            fontSize: 13,
          }}
        >
          No data in this range yet.
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          style={{ display: "block", width: "100%", height: "auto" }}
        >
          <defs>
            <linearGradient id="e1rm-area-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#7CB4ED" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#0C5CAB" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Horizontal grid */}
          {computed.yTicks.map((t, i) => (
            <line
              key={`yg-${i}`}
              x1={PAD_L}
              x2={VB_W - PAD_R}
              y1={t.y}
              y2={t.y}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={1}
            />
          ))}

          {/* Block boundary verticals */}
          {computed.blockLines.map((bl, i) => {
            if (bl.tip) {
              return (
                <g key={`bl-${i}`}>
                  <title>{bl.tip}</title>
                  <line
                    x1={bl.x}
                    x2={bl.x}
                    y1={PAD_T}
                    y2={PAD_T + PLOT_H}
                    stroke="transparent"
                    strokeWidth={10}
                    style={{ pointerEvents: "stroke" }}
                  />
                  <line
                    x1={bl.x}
                    x2={bl.x}
                    y1={PAD_T}
                    y2={PAD_T + PLOT_H}
                    stroke="rgba(124,180,237,0.20)"
                    strokeWidth={1}
                    strokeDasharray="2 3"
                  />
                </g>
              );
            }

            return (
              <line
                key={`bl-${i}`}
                x1={bl.x}
                x2={bl.x}
                y1={PAD_T}
                y2={PAD_T + PLOT_H}
                stroke="rgba(124,180,237,0.20)"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
            );
          })}

          {/* Y-axis labels */}
          {computed.yTicks.map((t, i) => (
            <text
              key={`yl-${i}`}
              x={PAD_L - 6}
              y={t.y + 4}
              fontSize={9}
              fontFamily="var(--font-mono)"
              textAnchor="end"
              fill="rgba(250,250,250,0.40)"
            >
              {t.label}
            </text>
          ))}

          {/* Area fill — pointer-events disabled so it does not intercept
              hovers meant for the block boundary <title> tooltips beneath. */}
          <path
            d={computed.areaPath}
            fill="url(#e1rm-area-fill)"
            style={{ pointerEvents: "none" }}
          />

          {/* Data line — pointer-events disabled for the same reason. */}
          <polyline
            points={computed.polylinePts}
            fill="none"
            stroke="#7CB4ED"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: "none" }}
          />

          {/* Data dots */}
          {computed.coords.map((c, i) => {
            const isLast = i === computed.coords.length - 1;
            if (c.isMeet) {
              return (
                <circle
                  key={`pm-${i}`}
                  cx={c.x}
                  cy={c.y}
                  r={4}
                  fill="#FBBF24"
                  stroke="#0F0F12"
                  strokeWidth={1.5}
                />
              );
            }
            if (isLast && !hideCurrentGlow) {
              return (
                <g key={`pc-${i}`}>
                  <circle cx={c.x} cy={c.y} r={9} fill="rgba(12,92,171,0.20)" />
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={5}
                    fill="#0C5CAB"
                    stroke="#7CB4ED"
                    strokeWidth={2}
                  />
                </g>
              );
            }
            return (
              <circle
                key={`p-${i}`}
                cx={c.x}
                cy={c.y}
                r={2.5}
                fill="#0F0F12"
                stroke="#7CB4ED"
                strokeWidth={1.5}
              />
            );
          })}

          {/* X-axis labels */}
          {computed.xTicks.map((t, i) => (
            <text
              key={`xl-${i}`}
              x={t.x}
              y={VB_H - 12}
              fontSize={9}
              fontWeight={500}
              letterSpacing="0.06em"
              textAnchor="middle"
              fill="rgba(250,250,250,0.45)"
            >
              {t.label}
            </text>
          ))}
        </svg>
      )}
      {/* Legend strip */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          padding: "8px 12px 4px",
          fontSize: 10,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--cloud-text-dim)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              width: 14,
              height: 2,
              background:
                "repeating-linear-gradient(90deg, rgba(124,180,237,0.55) 0 3px, transparent 3px 6px)",
            }}
          />
          Block boundary
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#FBBF24",
              boxShadow: "0 0 0 1px #0F0F12",
            }}
          />
          Meet PR
        </span>
        {!hideCurrentGlow && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#0C5CAB",
                boxShadow: "0 0 0 1.5px #7CB4ED",
              }}
            />
            Now
          </span>
        )}
        {unit && <span style={{ marginLeft: "auto" }}>{unit}</span>}
      </div>
    </div>
  );
}
