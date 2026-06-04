"use client";

import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import { useTheme } from "@/lib/theme-provider";
import { safeHttpUrl } from "@/lib/safe-url";
import {
  LIFTS,
  isSeriesPointMeta,
  prepareProgressionChartRows,
  type ChartRow,
  type LiftKey,
  type ProgressionLineValueMode,
  type ProgressionChartSeries,
  type SeriesPointMeta,
} from "@/lib/progression";
import { convertWeight, type WeightUnit } from "@/lib/units";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  rows: ChartRow[];
  visibleLifts: Set<LiftKey>;
  unit: WeightUnit;
  height?: number;
  mode?: "e1rm" | "volume";
  series?: ProgressionChartSeries[];
  competitionMaxes?: Partial<Record<LiftKey, number | null>>;
  tracksRpe?: boolean;
  volumePeakMarkers?: VolumePeakMarker[];
  highlightMarker?: ProgressionHighlightMarker | null;
  excludeOutliersFromLine?: boolean;
  lineValueMode?: ProgressionLineValueMode;
  rollingWindow?: number;
  meetMarkers?: ProgressionMeetMarker[];
  paddedYDomain?: boolean;
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

interface OutlierExplainerState {
  series: ProgressionChartSeries;
  meta: SeriesPointMeta;
}

interface SeriesDotProps {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: ChartRow;
}

export interface VolumePeakMarker {
  lift: LiftKey;
  label: string;
  rank: number;
}

export interface ProgressionHighlightMarker {
  label: string;
  y: number;
  color?: string;
}

export interface ProgressionMeetMarker {
  label: string;
  value: number;
  title?: string;
}

const PINNED_TOOLTIP_OFFSET = 12;
const PINNED_TOOLTIP_WIDTH_ESTIMATE = 340;
const PINNED_TOOLTIP_HEIGHT_ESTIMATE = 260;
const PINNED_TOOLTIP_MARGIN = 8;

// Recharts 3 chart-click state (MouseHandlerDataParam) has no activePayload.
// It gives the active row index, the category label, and the SVG coordinate.
interface ChartClickState {
  activeIndex?: number | string | null;
  activeLabel?: string | number;
  activeCoordinate?: { x?: number; y?: number };
}

function metaKey(seriesKey: string): string {
  return `${seriesKey}__meta`;
}

function formatWeightValue(valueLbs: number, unit: WeightUnit): string {
  const value = unit === "lbs" ? valueLbs : convertWeight(valueLbs, unit);
  return `${Math.round(value).toLocaleString("en-US")} ${unit}`;
}

function formatWeightDelta(valueLbs: number, unit: WeightUnit): string {
  const value = unit === "lbs" ? valueLbs : convertWeight(valueLbs, unit);
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
  return `${sign}${Math.abs(rounded).toLocaleString("en-US")} ${unit}`;
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
  onExplainOutlier,
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
  onExplainOutlier?: (series: ProgressionChartSeries, meta: SeriesPointMeta) => void;
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

  // All lifts in one block share the same program spreadsheet, so collapse
  // the per-lift sheet links into one footer link (distinct URLs only).
  const sheetUrls = Array.from(
    new Set(
      visiblePayload
        .map((entry) => {
          const m = row[metaKey(String(entry.dataKey ?? ""))];
          return isSeriesPointMeta(m) ? safeHttpUrl(m.sourceUrl) : null;
        })
        .filter((u): u is string => Boolean(u)),
    ),
  );

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
          const meta: SeriesPointMeta | null = isSeriesPointMeta(metaValue)
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
              <div style={{ color: "var(--cloud-text-muted)" }}>
                {formatWeightValue(meta.weightLbs, unit)} x {meta.reps}
                {rpePart}
              </div>
              <div style={{ color: "var(--cloud-text-dim)" }}>
                e1RM {formatWeightValue(meta.e1rmLbs, unit)} · W{meta.weekNumber}{" "}
                D{meta.dayNumber}
              </div>
              {meta.isOutlier && descriptor && (
                <div
                  style={{
                    marginTop: 5,
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    borderRadius: 8,
                    background: "rgba(245, 158, 11, 0.1)",
                    color: "var(--cloud-warning-text)",
                    padding: "7px 8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span style={{ lineHeight: 1.35 }}>
                    {meta.outlierReason ?? "This point was flagged as an outlier."}
                  </span>
                  {onExplainOutlier && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onExplainOutlier(descriptor, meta);
                      }}
                      style={{
                        border: "1px solid rgba(245, 158, 11, 0.45)",
                        borderRadius: 999,
                        background: "var(--cloud-panel)",
                        color: "var(--cloud-warning-text)",
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "3px 7px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Explain
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {sheetUrls.length > 0 && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px solid var(--cloud-border)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {sheetUrls.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--cloud-primary-text)",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Open source sheet
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function OutlierExplainerDialog({
  state,
  unit,
  tracksRpe,
  onOpenChange,
}: {
  state: OutlierExplainerState | null;
  unit: WeightUnit;
  tracksRpe: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const meta = state?.meta ?? null;
  const average = meta?.outlierAverageLbs ?? null;
  const delta = meta && average != null ? meta.e1rmLbs - average : null;
  const references = meta?.outlierReferencePoints ?? [];

  return (
    <Dialog open={state !== null} onOpenChange={onOpenChange}>
      <DialogContent className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] max-w-2xl">
        {state && meta && (
          <>
            <DialogHeader>
              <DialogTitle
                style={{
                  color: "var(--cloud-text)",
                  fontSize: 18,
                  fontWeight: 700,
                }}
              >
                Where this flag came from
              </DialogTitle>
              <DialogDescription
                style={{
                  color: "var(--cloud-text-muted)",
                  fontSize: 13,
                  lineHeight: 1.45,
                }}
              >
                This point was flagged by comparing it with the recent average
                for the same lift pattern.
              </DialogDescription>
            </DialogHeader>

            <div style={{ display: "grid", gap: 14 }}>
              <div
                style={{
                  border: "1px solid rgba(245, 158, 11, 0.28)",
                  borderRadius: 10,
                  background: "rgba(245, 158, 11, 0.1)",
                  color: "var(--cloud-warning-text)",
                  padding: "10px 12px",
                  fontSize: 13,
                  lineHeight: 1.4,
                }}
              >
                {meta.outlierReason ?? "This e1RM sits outside the expected recent range."}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: 10,
                }}
              >
                {[
                  ["This point", formatWeightValue(meta.e1rmLbs, unit)],
                  [
                    "Trailing average",
                    average == null ? "Not available" : formatWeightValue(average, unit),
                  ],
                  ["Delta", delta == null ? "Not available" : formatWeightDelta(delta, unit)],
                ].map(([labelText, valueText]) => (
                  <div
                    key={labelText}
                    style={{
                      border: "1px solid var(--cloud-border)",
                      borderRadius: 8,
                      background: "var(--cloud-panel)",
                      padding: "10px 12px",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <TooltipLabel>{labelText}</TooltipLabel>
                    <div
                      style={{
                        color: "var(--cloud-text)",
                        fontSize: 18,
                        fontWeight: 750,
                        marginTop: 4,
                      }}
                    >
                      {valueText}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <TooltipLabel>Flagged point</TooltipLabel>
                <div
                  style={{
                    marginTop: 6,
                    border: "1px solid var(--cloud-border)",
                    borderRadius: 8,
                    background: "var(--cloud-panel)",
                    padding: "10px 12px",
                    color: "var(--cloud-text)",
                    fontSize: 13,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <div style={{ fontWeight: 700, color: state.series.color }}>
                    {state.series.label}
                  </div>
                  <div>{meta.exerciseName}</div>
                  <div style={{ color: "var(--cloud-text-muted)" }}>
                    {formatWeightValue(meta.weightLbs, unit)} x {meta.reps}
                    {tracksRpe && meta.actualRpe != null ? ` @ RPE ${meta.actualRpe}` : ""}
                  </div>
                  <div style={{ color: "var(--cloud-text-dim)" }}>
                    W{meta.weekNumber} D{meta.dayNumber}
                  </div>
                </div>
              </div>

              <div>
                <TooltipLabel>Reference points</TooltipLabel>
                <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
                  {references.length === 0 ? (
                    <div
                      style={{
                        border: "1px solid var(--cloud-border)",
                        borderRadius: 8,
                        background: "var(--cloud-panel)",
                        color: "var(--cloud-text-muted)",
                        padding: "10px 12px",
                        fontSize: 13,
                      }}
                    >
                      No reference points were returned for this flag.
                    </div>
                  ) : (
                    references.map((ref, index) => {
                      const rpePart =
                        tracksRpe && ref.actual_rpe != null
                          ? ` @ RPE ${ref.actual_rpe}`
                          : "";
                      const sourceUrl = safeHttpUrl(ref.google_sheet_url);
                      return (
                        <div
                          key={`${ref.program_number ?? "unknown"}-${ref.week_number}-${ref.day_number}-${index}`}
                          style={{
                            border: "1px solid var(--cloud-border)",
                            borderRadius: 8,
                            background: "var(--cloud-panel)",
                            padding: "9px 11px",
                            color: "var(--cloud-text)",
                            display: "grid",
                            gap: 3,
                            fontSize: 12,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>{ref.exercise_name}</div>
                          <div style={{ color: "var(--cloud-text-muted)" }}>
                            {formatWeightValue(ref.weight_lbs, unit)} x {ref.reps}
                            {rpePart}
                          </div>
                          <div style={{ color: "var(--cloud-text-muted)" }}>
                            e1RM {formatWeightValue(ref.e1rm, unit)}
                          </div>
                          <div style={{ color: "var(--cloud-text-dim)" }}>
                            P{ref.program_number ?? "?"} W{ref.week_number} D{ref.day_number}
                            {ref.day_name ? `, ${ref.day_name}` : ""}
                          </div>
                          {sourceUrl && (
                            <a
                              href={sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: "var(--cloud-primary-text)",
                                textDecoration: "none",
                                fontWeight: 700,
                              }}
                            >
                              Open source sheet
                            </a>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function renderSeriesDot(
  props: SeriesDotProps,
  series: ProgressionChartSeries,
  mode: "e1rm" | "volume",
  onExplainOutlier: (series: ProgressionChartSeries, meta: SeriesPointMeta) => void,
  volumePeakByKey: Map<string, VolumePeakMarker>,
) {
  const { cx, cy, payload, index } = props;
  if (cx == null || cy == null) {
    return <g key={`dot-${series.key}-${index ?? "empty"}`} />;
  }
  if (mode === "volume") {
    const label = String(payload?.label ?? "");
    const marker = volumePeakByKey.get(`${series.key}|${label}`);
    if (!marker) {
      return (
        <circle
          key={`dot-${series.key}-${payload?.label ?? index ?? "point"}`}
          cx={cx}
          cy={cy}
          r={2}
          fill={series.color}
          stroke="none"
        />
      );
    }
    return (
      <g key={`volume-peak-${series.key}-${label}`} style={{ pointerEvents: "none" }}>
        <title>{`${series.label} peak ${marker.rank}`}</title>
        <circle
          cx={cx}
          cy={cy}
          r={9}
          fill="var(--cloud-surface-raised)"
          stroke={series.color}
          strokeWidth={2}
        />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--cloud-text)"
          fontSize={9}
          fontWeight={800}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {marker.rank}
        </text>
      </g>
    );
  }
  const metaValue = payload?.[metaKey(series.key)];
  const meta = isSeriesPointMeta(metaValue) ? metaValue : null;
  if (mode !== "e1rm" || !meta?.isOutlier) {
    return (
      <circle
        key={`dot-${series.key}-${payload?.label ?? index ?? "point"}`}
        cx={cx}
        cy={cy}
        r={2}
        fill={series.color}
        stroke="none"
      />
    );
  }

  const handleClick = (event: MouseEvent<SVGGElement>) => {
    event.stopPropagation();
    onExplainOutlier(series, meta);
  };

  return (
    <g
      key={`outlier-${series.key}-${payload?.label ?? index ?? "point"}`}
      onClick={handleClick}
      style={{ cursor: "pointer" }}
      aria-label={`Explain outlier for ${series.label}`}
    >
      <title>{meta.outlierReason ?? "Outlier point"}</title>
      <circle
        cx={cx}
        cy={cy}
        r={7}
        fill="rgba(245, 158, 11, 0.12)"
        stroke="var(--cloud-warning-text)"
        strokeWidth={2}
      />
      <circle cx={cx} cy={cy} r={2.75} fill={series.color} stroke="none" />
      <circle cx={cx} cy={cy} r={11} fill="transparent" />
    </g>
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
  volumePeakMarkers = [],
  highlightMarker = null,
  excludeOutliersFromLine = false,
  lineValueMode = "raw",
  rollingWindow = 3,
  meetMarkers = [],
  paddedYDomain = false,
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
  const [outlierExplainer, setOutlierExplainer] =
    useState<OutlierExplainerState | null>(null);
  const renderedSeries = series ?? LIFTS.filter((l) => visibleLifts.has(l.key));
  const prepared = useMemo(
    () =>
      prepareProgressionChartRows(rows, renderedSeries, {
        excludeOutliersFromLine,
        lineValueMode: mode === "e1rm" ? lineValueMode : "raw",
        rollingWindow,
      }),
    [
      excludeOutliersFromLine,
      lineValueMode,
      mode,
      renderedSeries,
      rollingWindow,
      rows,
    ],
  );
  const chartRows = prepared.rows;
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });
  const seriesSignature = useMemo(
    () => renderedSeries.map((item) => item.key).join("|"),
    [renderedSeries],
  );
  const volumePeakByKey = useMemo(() => {
    const markers = new Map<string, VolumePeakMarker>();
    for (const marker of volumePeakMarkers) {
      markers.set(`${marker.lift}|${marker.label}`, marker);
    }
    return markers;
  }, [volumePeakMarkers]);

  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      setPinnedTooltip(null);
      setOutlierExplainer(null);
    });
    return () => cancelAnimationFrame(handle);
  }, [mode, rows, seriesSignature, unit]);

  const yDomain = useMemo<[number, number] | [number, string] | [string, string]>(() => {
    if (isVolume) return [0, "dataMax + 1000"];
    if (!paddedYDomain) return ["dataMin - 10", "dataMax + 10"];

    const values: number[] = [];
    for (const row of chartRows) {
      for (const item of renderedSeries) {
        const value = row[item.key];
        if (typeof value === "number") values.push(value);
      }
    }
    for (const marker of meetMarkers) values.push(marker.value);
    // The highlight marker is drawn as a ReferenceDot; fold its value into the
    // domain so it can never float above/below the plotted axis (off the grid).
    if (highlightMarker && typeof highlightMarker.y === "number") {
      values.push(highlightMarker.y);
    }
    if (values.length === 0) return [0, 100];

    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = Math.max(1, max - min);
    const padding = Math.max(10, spread * 0.08);
    return [Math.max(0, min - padding), max + padding];
  }, [chartRows, highlightMarker, isVolume, meetMarkers, paddedYDomain, renderedSeries]);

  // Recharts switches a category x-axis to a serial-number (index) domain as
  // soon as tick labels are duplicated (e.g. several unnumbered "P? W1"
  // blocks). A ReferenceDot/-Line keyed by the string label then can't resolve
  // and pins to the axis origin (far left). This resolver returns the row index
  // in that case (and the label otherwise) so reference marks land on the
  // actual point. Returns null when the label isn't on the chart.
  const resolveAxisX = useMemo(() => {
    const labels = chartRows.map((row) => row.label);
    const hasDuplicateLabels = labels.length !== new Set(labels).size;
    const indexByLabel = new Map<string, number>();
    labels.forEach((label, idx) => {
      if (!indexByLabel.has(label)) indexByLabel.set(label, idx);
    });
    return (label: string): number | string | null => {
      const idx = indexByLabel.get(label);
      if (idx == null) return null;
      return hasDuplicateLabels ? idx : label;
    };
  }, [chartRows]);

  const highlightMarkerX = highlightMarker
    ? resolveAxisX(highlightMarker.label)
    : null;

  const outlierMarkers = useMemo(() => {
    const lower = yDomain[0];
    if (isVolume || !excludeOutliersFromLine || typeof lower !== "number") {
      return [];
    }
    const upper = typeof yDomain[1] === "number" ? yDomain[1] : Number.POSITIVE_INFINITY;
    return prepared.outlierMarkers.map((marker) => ({
      ...marker,
      displayValue: Math.min(Math.max(marker.value, lower), upper),
    }));
  }, [excludeOutliersFromLine, isVolume, prepared.outlierMarkers, yDomain]);

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

  if (chartRows.length < 2) {
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
          data={chartRows}
          margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
          onClick={(state: ChartClickState) => {
            const rawIndex = state.activeIndex;
            const index =
              typeof rawIndex === "number" ? rawIndex : Number(rawIndex);
            const row = Number.isInteger(index) ? chartRows[index] : undefined;
            if (!row) {
              setPinnedTooltip(null);
              return;
            }
            const payload: TooltipPayloadEntry[] = renderedSeries.flatMap(
              (s) => {
                const value = row[s.key];
                if (typeof value !== "number") return [];
                return [
                  {
                    dataKey: s.key,
                    name: s.label,
                    color: s.color,
                    value,
                    payload: row,
                  },
                ];
              },
            );
            if (payload.length === 0) {
              setPinnedTooltip(null);
              return;
            }
            setPinnedTooltip({
              label: String(state.activeLabel ?? row.label ?? ""),
              payload,
              x: state.activeCoordinate?.x ?? 0,
              y: state.activeCoordinate?.y ?? 0,
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
            domain={yDomain}
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
                  onExplainOutlier={(seriesItem, meta) =>
                    setOutlierExplainer({ series: seriesItem, meta })
                  }
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
              dot={(dotProps) =>
                renderSeriesDot(
                  dotProps as SeriesDotProps,
                  s,
                  mode,
                  (seriesItem, meta) =>
                    setOutlierExplainer({ series: seriesItem, meta }),
                  volumePeakByKey,
                )
              }
              activeDot={{ r: 5 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
          {mode === "e1rm" &&
            outlierMarkers.map((marker) => (
              <ReferenceDot
                key={`outlier-marker-${marker.series.key}-${marker.label}`}
                x={resolveAxisX(marker.label) ?? undefined}
                y={marker.displayValue}
                r={7}
                fill="rgba(245, 158, 11, 0.12)"
                stroke="var(--cloud-warning-text)"
                strokeWidth={2}
                ifOverflow="visible"
                onClick={(event) => {
                  if (
                    event &&
                    typeof event === "object" &&
                    "stopPropagation" in event &&
                    typeof event.stopPropagation === "function"
                  ) {
                    event.stopPropagation();
                  }
                  setOutlierExplainer({ series: marker.series, meta: marker.meta });
                }}
                style={{ cursor: "pointer" }}
              />
            ))}
          {mode === "e1rm" &&
            meetMarkers.map((marker) => (
              <ReferenceDot
                key={`meet-marker-${marker.label}-${marker.value}`}
                x={resolveAxisX(marker.label) ?? undefined}
                y={marker.value}
                r={5}
                fill="var(--cloud-warning-text)"
                stroke="var(--cloud-surface-raised)"
                strokeWidth={2}
                ifOverflow="visible"
              />
            ))}
          {mode === "e1rm" && highlightMarker && highlightMarkerX != null && (
            <ReferenceDot
              x={highlightMarkerX}
              y={highlightMarker.y}
              r={9}
              fill="rgba(245, 158, 11, 0.22)"
              stroke={highlightMarker.color ?? "var(--cloud-warning-text)"}
              strokeWidth={3}
              // "visible" (not "extendDomain"): on a category x-axis,
              // extendDomain can't extend the band scale and Recharts pins the
              // dot to the axis origin (far left). The y value is already kept
              // in-domain by the yDomain calc, so it renders on the line.
              ifOverflow="visible"
            />
          )}
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
            onExplainOutlier={(seriesItem, meta) =>
              setOutlierExplainer({ series: seriesItem, meta })
            }
          />
        </div>
      )}
      <OutlierExplainerDialog
        state={outlierExplainer}
        unit={unit}
        tracksRpe={tracksRpe !== false}
        onOpenChange={(open) => {
          if (!open) setOutlierExplainer(null);
        }}
      />
      {mode === "e1rm" && meetMarkers.length > 0 && (
        <div
          style={{
            position: "absolute",
            right: 10,
            bottom: 4,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--cloud-text-muted)",
            fontSize: 11,
            fontWeight: 600,
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: "var(--cloud-warning-text)",
              boxShadow: "0 0 0 2px rgba(15, 15, 18, 0.85)",
            }}
          />
          Meet max
        </div>
      )}
    </div>
  );
}
