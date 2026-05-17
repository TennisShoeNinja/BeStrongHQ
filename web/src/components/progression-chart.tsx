"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  LIFTS,
  type ChartRow,
  type LiftKey,
  type ProgressionChartSeries,
  type SeriesPointMeta,
} from "@/lib/progression";
import { convertWeight, type WeightUnit } from "@/lib/units";

interface Props {
  rows: ChartRow[];
  visibleLifts: Set<LiftKey>;
  unit: WeightUnit;
  height?: number;
  mode?: "e1rm" | "volume";
  series?: ProgressionChartSeries[];
  competitionMaxes?: Partial<Record<LiftKey, number | null>>;
  tracksRpe?: boolean;
}

interface TooltipPayloadEntry {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: ChartRow;
}

interface TooltipState {
  label: string;
  payload: TooltipPayloadEntry[];
  x: number;
  y: number;
}

const PINNED_TOOLTIP_OFFSET = 12;
const PINNED_TOOLTIP_WIDTH_ESTIMATE = 340;
const PINNED_TOOLTIP_HEIGHT_ESTIMATE = 260;
const PINNED_TOOLTIP_MARGIN = 8;

interface ChartClickState {
  activeLabel?: string | number;
  activePayload?: TooltipPayloadEntry[];
  chartX?: number;
  chartY?: number;
}

function metaKey(seriesKey: string): string {
  return `${seriesKey}__meta`;
}

function isPointMeta(value: unknown): value is SeriesPointMeta {
  if (typeof value !== "object" || value == null) return false;
  const candidate = value as Partial<SeriesPointMeta>;
  return (
    typeof candidate.exerciseName === "string" &&
    typeof candidate.weightLbs === "number" &&
    typeof candidate.reps === "number" &&
    typeof candidate.e1rmLbs === "number" &&
    typeof candidate.weekNumber === "number" &&
    typeof candidate.dayNumber === "number"
  );
}

function formatWeightValue(valueLbs: number, unit: WeightUnit): string {
  const value = unit === "lbs" ? valueLbs : convertWeight(valueLbs, unit);
  return `${Math.round(value).toLocaleString("en-US")} ${unit}`;
}

function TooltipLabel({ children }: { children: string }) {
  return (
    <div
      style={{
        color: "var(--cloud-text-dim)",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function RichTooltip({
  active,
  label,
  payload,
  series,
  mode,
  unit,
  tracksRpe,
  pinned,
  onClose,
}: {
  active?: boolean;
  label?: string | number;
  payload?: TooltipPayloadEntry[];
  series: ProgressionChartSeries[];
  mode: "e1rm" | "volume";
  unit: WeightUnit;
  tracksRpe: boolean;
  pinned?: boolean;
  onClose?: () => void;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const seriesByKey = new Map(series.map((item) => [item.key, item]));
  const visiblePayload = payload.filter((entry) => {
    const key = String(entry.dataKey ?? "");
    return key && !key.endsWith("__meta") && entry.value != null;
  });
  if (visiblePayload.length === 0) return null;

  return (
    <div
      style={{
        minWidth: 260,
        maxWidth: 340,
        background: "var(--cloud-surface-raised)",
        border: "1px solid var(--cloud-border-strong)",
        borderRadius: 10,
        padding: "10px 12px",
        color: "var(--cloud-text)",
        boxShadow: "0 18px 48px -24px rgba(0, 0, 0, 0.85)",
        fontSize: 12,
        fontVariantNumeric: "tabular-nums",
        pointerEvents: "auto",
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div>
          <TooltipLabel>Block</TooltipLabel>
          <div style={{ fontWeight: 700 }}>{label}</div>
        </div>
        {pinned && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close pinned tooltip"
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              border: "1px solid var(--cloud-border)",
              background: "var(--cloud-panel)",
              color: "var(--cloud-text-muted)",
              cursor: "pointer",
              fontSize: 14,
              lineHeight: "18px",
            }}
          >
            x
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {visiblePayload.map((entry) => {
          const key = String(entry.dataKey ?? "");
          const descriptor = seriesByKey.get(key);
          const color = descriptor?.color ?? entry.color ?? "var(--cloud-primary-text)";
          const metaValue = row[metaKey(key)];
          const meta: SeriesPointMeta | null = isPointMeta(metaValue)
            ? metaValue
            : null;
          const displayValue =
            typeof entry.value === "number"
              ? `${Math.round(entry.value).toLocaleString("en-US")}${mode === "e1rm" ? ` ${unit}` : ""}`
              : String(entry.value ?? "");
          if (mode !== "e1rm" || !meta) {
            return (
              <div key={key}>
                <div style={{ color, fontWeight: 700 }}>
                  {descriptor?.label ?? entry.name ?? key}
                </div>
                <div style={{ color: "var(--cloud-text-muted)" }}>
                  {mode === "volume" ? `${displayValue} volume` : displayValue}
                </div>
              </div>
            );
          }
          const rpePart =
            tracksRpe && meta.actualRpe != null ? ` @ RPE ${meta.actualRpe}` : "";
          return (
            <div key={key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ color, fontWeight: 700 }}>
                {descriptor?.label ?? entry.name ?? key}
              </div>
              <div>{meta.exerciseName}</div>
              <div style={{ color: "var(--cloud-text-muted)" }}>
                {formatWeightValue(meta.weightLbs, unit)} x {meta.reps}
                {rpePart}
              </div>
              <div style={{ color: "var(--cloud-text-muted)" }}>
                e1RM {formatWeightValue(meta.e1rmLbs, unit)}
              </div>
              <div style={{ color: "var(--cloud-text-dim)" }}>
                W{meta.weekNumber} D{meta.dayNumber}
              </div>
              {meta.sourceUrl && (
                <a
                  href={meta.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "var(--cloud-primary-text)",
                    textDecoration: "none",
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  Open source sheet
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Multi-lift e1RM trajectory chart. One themed Recharts line per visible
 * lift, sharing a categorical block or week x-axis.
 */
export function ProgressionChart({
  rows,
  visibleLifts,
  unit,
  height = 280,
  mode = "e1rm",
  series,
  competitionMaxes,
  tracksRpe = true,
}: Props) {
  const { resolvedMode } = useTheme();
  const dark = resolvedMode === "dark";
  const gridColor = dark ? "rgba(255,255,255,0.06)" : "#e2e8f0";
  const textColor = dark ? "rgba(250,250,250,0.5)" : "#64748b";
  const valueFormatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  });
  const isVolume = mode === "volume";
  const showCompetitionMaxes = mode === "e1rm" && competitionMaxes != null;
  const [pinnedTooltip, setPinnedTooltip] = useState<TooltipState | null>(null);
  const renderedSeries = series ?? LIFTS.filter((l) => visibleLifts.has(l.key));
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });
  const seriesSignature = useMemo(
    () => renderedSeries.map((item) => item.key).join("|"),
    [renderedSeries],
  );

  useEffect(() => {
    setPinnedTooltip(null);
  }, [mode, rows, seriesSignature, unit]);

  useEffect(() => {
    const node = chartRef.current;
    if (!node) return;
    const updateSize = () => {
      setChartSize({
        width: node.clientWidth,
        height: node.clientHeight,
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const pinnedPosition = useMemo(() => {
    if (!pinnedTooltip) return null;
    const maxLeft = Math.max(
      PINNED_TOOLTIP_MARGIN,
      chartSize.width - PINNED_TOOLTIP_WIDTH_ESTIMATE - PINNED_TOOLTIP_MARGIN,
    );
    const maxTop = Math.max(
      PINNED_TOOLTIP_MARGIN,
      chartSize.height - PINNED_TOOLTIP_HEIGHT_ESTIMATE - PINNED_TOOLTIP_MARGIN,
    );
    return {
      left: Math.min(
        Math.max(pinnedTooltip.x + PINNED_TOOLTIP_OFFSET, PINNED_TOOLTIP_MARGIN),
        maxLeft,
      ),
      top: Math.min(
        Math.max(pinnedTooltip.y + PINNED_TOOLTIP_OFFSET, PINNED_TOOLTIP_MARGIN),
        maxTop,
      ),
    };
  }, [chartSize.height, chartSize.width, pinnedTooltip]);

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
    <div ref={chartRef} style={{ height, position: "relative" }}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={rows}
          margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
          onClick={(state: ChartClickState) => {
            const payload = state.activePayload;
            if (!payload || payload.length === 0) {
              setPinnedTooltip(null);
              return;
            }
            const label = state.activeLabel;
            setPinnedTooltip({
              label: typeof label === "string" || typeof label === "number" ? String(label) : "",
              payload,
              x: state.chartX ?? 0,
              y: state.chartY ?? 0,
            });
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="label"
            type="category"
            tick={{ fontSize: 11, fill: textColor }}
            tickLine={false}
            interval="preserveStartEnd"
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
            content={(props) =>
              pinnedTooltip ? null : (
                <RichTooltip
                  active={props.active}
                  label={props.label}
                  payload={
                    props.payload as unknown as TooltipPayloadEntry[] | undefined
                  }
                  series={renderedSeries}
                  mode={mode}
                  unit={unit}
                  tracksRpe={tracksRpe !== false}
                />
              )
            }
          />
          {showCompetitionMaxes &&
            LIFTS.filter((lift) => visibleLifts.has(lift.key)).map((lift) => {
              const max = competitionMaxes?.[lift.key];
              if (max == null) return null;
              const rounded = Math.round(max);
              return (
                <ReferenceLine
                  key={`comp-max-${lift.key}`}
                  y={max}
                  stroke={lift.color}
                  strokeDasharray="4 4"
                  strokeOpacity={0.55}
                  label={{
                    value: `${lift.label} ${valueFormatter.format(rounded)}`,
                    position: "insideTopRight",
                    fill: lift.color,
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                />
              );
            })}
          {renderedSeries.map((s) => (
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
      {pinnedTooltip && pinnedPosition && (
        <div
          style={{
            position: "absolute",
            left: pinnedPosition.left,
            top: pinnedPosition.top,
            zIndex: 5,
          }}
        >
          <RichTooltip
            active
            label={pinnedTooltip.label}
            payload={pinnedTooltip.payload}
            series={renderedSeries}
            mode={mode}
            unit={unit}
            tracksRpe={tracksRpe !== false}
            pinned
            onClose={() => setPinnedTooltip(null)}
          />
        </div>
      )}
    </div>
  );
}
