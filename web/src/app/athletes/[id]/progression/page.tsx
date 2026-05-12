"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import apiClient from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import * as Types from "@/lib/types";
import { E1RMChart, type ChartPoint, type BlockBoundary } from "@/components/e1rm-chart";

type LiftKey = "squat" | "bench" | "deadlift";
type RangeKey = "3m" | "6m" | "1y" | "all";

const LIFTS: { key: LiftKey; label: string }[] = [
  { key: "squat", label: "Squat" },
  { key: "bench", label: "Bench" },
  { key: "deadlift", label: "Deadlift" },
];

const RANGES: { key: RangeKey; label: string; months: number | null }[] = [
  { key: "3m", label: "3M", months: 3 },
  { key: "6m", label: "6M", months: 6 },
  { key: "1y", label: "1Y", months: 12 },
  { key: "all", label: "All", months: null },
];

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatBlockDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function liftMatches(entryLift: string, target: LiftKey): boolean {
  const l = entryLift.toLowerCase().trim();
  if (target === "squat") return l === "squat" || l === "s" || l === "sq";
  if (target === "bench") return l.startsWith("bench") || l === "b" || l === "bp";
  if (target === "deadlift")
    return l.startsWith("dead") || l === "dl" || l === "d";
  return false;
}

export default function AthleteProgressionPage() {
  const params = useParams();
  const router = useRouter();
  const athleteId = parseInt(params.id as string, 10);
  const { instance } = useAuth();
  const teamName = instance?.org_name || "BeStrong";

  const [lift, setLift] = useState<LiftKey>("squat");
  const [range, setRange] = useState<RangeKey>("1y");

  const { data: athlete } = useQuery({
    queryKey: ["athlete", athleteId],
    queryFn: () => apiClient.getAthlete(athleteId),
  });
  const { data: maxHistory = [] as Types.MaxHistoryEntry[] } = useQuery({
    queryKey: ["maxHistory", athleteId],
    queryFn: () => apiClient.getMaxHistory(athleteId),
  });
  const { data: meetResults = [] as Types.MeetResultEntry[] } = useQuery({
    queryKey: ["meetResults", athleteId],
    queryFn: () => apiClient.listMeetResults(athleteId),
  });
  const { data: programs = [] as Types.ProgramListResponse[] } = useQuery({
    queryKey: ["programs", athleteId],
    queryFn: () => apiClient.listPrograms(athleteId),
  });

  // Determine range bounds
  const { rangeStart, rangeEnd } = useMemo(() => {
    const end = new Date();
    if (range === "all") {
      return { rangeStart: undefined, rangeEnd: end };
    }
    const months = RANGES.find((r) => r.key === range)?.months ?? 12;
    const start = new Date();
    start.setMonth(start.getMonth() - months);
    return { rangeStart: start, rangeEnd: end };
  }, [range]);

  // Build chart points from MaxHistory + MeetResults for the selected lift
  const chartPoints: ChartPoint[] = useMemo(() => {
    const liftMax = maxHistory
      .filter((m) => liftMatches(m.lift, lift))
      .map<ChartPoint>((m) => ({
        date: new Date(m.recorded_at),
        value: m.new_value,
      }))
      .filter((p) => !isNaN(p.date.getTime()));

    const meetMax = meetResults
      .filter((m) => m.made && liftMatches(m.lift, lift) && m.meet_date)
      .map<ChartPoint>((m) => ({
        date: new Date(m.meet_date!),
        value: m.weight_lbs,
        isMeet: true,
      }))
      .filter((p) => !isNaN(p.date.getTime()));

    return [...liftMax, ...meetMax].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
  }, [maxHistory, meetResults, lift]);

  const blockBoundaries: BlockBoundary[] = useMemo(() => {
    return programs
      .map<BlockBoundary | null>((p) => {
        const d = parseDate(p.date_start);
        if (!d) return null;
        return { date: d, label: p.program_name ?? undefined };
      })
      .filter((b): b is BlockBoundary => b !== null);
  }, [programs]);

  // KPI numbers
  const visible = useMemo(() => {
    return chartPoints.filter((p) => {
      if (rangeStart && p.date < rangeStart) return false;
      if (rangeEnd && p.date > rangeEnd) return false;
      return true;
    });
  }, [chartPoints, rangeStart, rangeEnd]);

  const current = visible[visible.length - 1]?.value ?? null;
  const oldest = visible[0]?.value ?? null;
  const rangeDelta = current !== null && oldest !== null ? current - oldest : null;

  // Peaks per block
  const peaksByBlock = useMemo(() => {
    const sortedPrograms = [...programs].sort((a, b) => {
      const da = parseDate(a.date_start)?.getTime() ?? 0;
      const db = parseDate(b.date_start)?.getTime() ?? 0;
      return db - da; // most recent first
    });
    return sortedPrograms.map((p, i, arr) => {
      const start = parseDate(p.date_start);
      const end = parseDate(p.date_end);
      const inWindow = chartPoints.filter((pt) => {
        if (start && pt.date < start) return false;
        if (end && pt.date > end) return false;
        return true;
      });
      const peak = inWindow.reduce<number | null>(
        (acc, pt) => (acc === null || pt.value > acc ? pt.value : acc),
        null,
      );
      // delta vs previous (older) block — arr is most-recent-first, so previous = next index
      const prevBlock = arr[i + 1];
      let delta: number | null = null;
      if (prevBlock && peak !== null) {
        const prevStart = parseDate(prevBlock.date_start);
        const prevEnd = parseDate(prevBlock.date_end);
        const prevWindow = chartPoints.filter((pt) => {
          if (prevStart && pt.date < prevStart) return false;
          if (prevEnd && pt.date > prevEnd) return false;
          return true;
        });
        const prevPeak = prevWindow.reduce<number | null>(
          (acc, pt) => (acc === null || pt.value > acc ? pt.value : acc),
          null,
        );
        if (prevPeak !== null) delta = peak - prevPeak;
      }
      return {
        id: p.id,
        name: p.program_name ?? `Program ${p.program_number ?? p.id}`,
        number: p.program_number,
        start,
        end,
        peak,
        delta,
        isCurrent: i === 0,
      };
    });
  }, [programs, chartPoints]);

  const athleteName = athlete?.name ?? "Athlete";

  return (
    <div style={{ padding: "var(--cloud-s5)" }}>
      <div
        className="mx-auto flex flex-col"
        style={{ maxWidth: 720, gap: "var(--cloud-s4)" }}
      >
        {/* Header */}
        <div>
          <div className="flex items-center" style={{ gap: 12, marginBottom: 6 }}>
            <button
              type="button"
              onClick={() => router.push(`/athletes/${athleteId}`)}
              className="cloud-icon-btn"
              aria-label="Back to athlete"
              title="Back to athlete"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p
              className="cloud-eyebrow"
              style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}
            >
              <span>{teamName}</span>
              <span
                aria-hidden
                style={{
                  width: 3,
                  height: 3,
                  borderRadius: "50%",
                  background: "var(--cloud-text-dim)",
                  display: "inline-block",
                }}
              />
              <span style={{ color: "var(--cloud-text-dim)" }}>
                {athleteName} · Estimated 1RM
              </span>
            </p>
          </div>
          <h1
            className="font-semibold"
            style={{
              fontSize: 32,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              marginLeft: 50,
            }}
          >
            <span className="cloud-text-grad-blue">
              {LIFTS.find((l) => l.key === lift)?.label}
            </span>{" "}
            <span className="cloud-text">progression</span>
          </h1>
        </div>

        {/* Lift switcher — pill segmented control */}
        <div
          role="tablist"
          aria-label="Lift"
          style={{
            display: "inline-flex",
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid var(--cloud-border)",
            borderRadius: 999,
            padding: 3,
            gap: 2,
          }}
        >
          {LIFTS.map((l) => {
            const active = lift === l.key;
            return (
              <button
                key={l.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setLift(l.key)}
                style={{
                  flex: 1,
                  background: active ? "rgba(12, 92, 171, 0.22)" : "transparent",
                  boxShadow: active
                    ? "inset 0 0 0 1px rgba(12, 92, 171, 0.40)"
                    : undefined,
                  border: 0,
                  color: active ? "var(--cloud-text)" : "var(--cloud-text-muted)",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "8px 22px",
                  borderRadius: 999,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "-0.005em",
                }}
              >
                {l.label}
              </button>
            );
          })}
        </div>

        {/* Range chips */}
        <div style={{ display: "flex", gap: 6 }}>
          {RANGES.map((r) => {
            const active = range === r.key;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                style={{
                  background: active
                    ? "rgba(12, 92, 171, 0.20)"
                    : "var(--cloud-panel)",
                  border: `1px solid ${active ? "rgba(12, 92, 171, 0.40)" : "var(--cloud-border)"}`,
                  color: active
                    ? "var(--cloud-primary-text)"
                    : "var(--cloud-text-muted)",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "6px 14px",
                  borderRadius: 999,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "0.02em",
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        {/* KPI strip + chart */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            paddingBottom: 4,
          }}
        >
          <div>
            <p
              style={{
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--cloud-text-dim)",
                margin: 0,
              }}
            >
              Current
            </p>
            <p
              className="cloud-text"
              style={{
                fontSize: 34,
                fontWeight: 600,
                letterSpacing: "-0.025em",
                lineHeight: 1,
                margin: "2px 0 0",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {current !== null ? current : "—"}
              <span
                style={{
                  fontSize: 15,
                  color: "var(--cloud-text-dim)",
                  fontWeight: 500,
                  marginLeft: 4,
                }}
              >
                lb
              </span>
            </p>
          </div>
          {rangeDelta !== null && (
            <div
              style={{
                textAlign: "right",
                fontSize: 11,
                color: "var(--cloud-text-muted)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 600,
                  color:
                    rangeDelta >= 0
                      ? "var(--cloud-success-text)"
                      : "var(--cloud-danger-text)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {rangeDelta >= 0 ? "+" : ""}
                {rangeDelta.toFixed(rangeDelta % 1 === 0 ? 0 : 1)}
              </p>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: 10,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "var(--cloud-text-dim)",
                }}
              >
                {RANGES.find((r) => r.key === range)?.label} range
              </p>
            </div>
          )}
        </div>

        <E1RMChart
          points={chartPoints}
          blockBoundaries={blockBoundaries}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          unit="lb"
        />

        {/* Peaks by block list */}
        <div>
          <p
            className="cloud-eyebrow"
            style={{ margin: "0 0 12px" }}
          >
            Peaks by block
          </p>
          {peaksByBlock.length === 0 ? (
            <div
              className="cloud-panel"
              style={{ padding: 24, textAlign: "center", fontSize: 13 }}
            >
              <span className="cloud-text-muted">
                No programs logged yet for {athleteName}.
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {peaksByBlock.map((b) => (
                <div
                  key={b.id}
                  className={b.isCurrent ? "cloud-panel-primary" : "cloud-panel"}
                  style={{
                    padding: "12px 16px",
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <p
                      className="cloud-text"
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        letterSpacing: "-0.005em",
                        margin: 0,
                      }}
                    >
                      {b.name}
                      {b.isCurrent && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 600,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: "var(--cloud-primary-text)",
                            background: "rgba(12, 92, 171, 0.20)",
                            border: "1px solid rgba(12, 92, 171, 0.35)",
                            padding: "2px 6px",
                            borderRadius: 999,
                            marginLeft: 8,
                            verticalAlign: 2,
                          }}
                        >
                          Current
                        </span>
                      )}
                    </p>
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--cloud-text-dim)",
                        margin: "2px 0 0",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {b.number && `Block ${b.number} · `}
                      {formatBlockDate(b.start) ?? "?"} →{" "}
                      {formatBlockDate(b.end) ?? "present"}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p
                      className="cloud-text"
                      style={{
                        fontSize: 18,
                        fontWeight: 600,
                        letterSpacing: "-0.015em",
                        margin: 0,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {b.peak !== null ? b.peak : "—"}
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--cloud-text-dim)",
                          fontWeight: 500,
                          marginLeft: 2,
                        }}
                      >
                        lb
                      </span>
                    </p>
                    {b.delta !== null ? (
                      <p
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color:
                            b.delta >= 0
                              ? "var(--cloud-success-text)"
                              : "var(--cloud-danger-text)",
                          margin: "2px 0 0",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {b.delta >= 0 ? "+" : ""}
                        {b.delta.toFixed(b.delta % 1 === 0 ? 0 : 1)}
                      </p>
                    ) : (
                      <p
                        style={{
                          fontSize: 11,
                          color: "var(--cloud-text-dim)",
                          margin: "2px 0 0",
                        }}
                      >
                        —
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
