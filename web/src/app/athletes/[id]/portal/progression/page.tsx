"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import apiClient from "@/lib/api";
import { PortalSidebar } from "@/components/portal-sidebar";
import * as Types from "@/lib/types";
import {
  E1RMChart,
  type BlockBoundary,
  type ChartPoint,
} from "@/components/e1rm-chart";

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

// TODO: This route is currently coach-only via AuthLayout. Once athlete-side
// auth ships, gate this with athlete-token verification AND keep a coach
// "preview" entry; do not let coach AuthLayout alone become the portal door.
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function liftMatches(entryLift: string, target: LiftKey): boolean {
  const l = entryLift.toLowerCase().trim();
  if (target === "squat") return l === "squat" || l === "s" || l === "sq";
  if (target === "bench") return l.startsWith("bench") || l === "b" || l === "bp";
  if (target === "deadlift")
    return l.startsWith("dead") || l === "dl" || l === "d";
  return false;
}

export default function AthletePortalProgressionPage() {
  const params = useParams();
  const athleteId = parseInt(params.id as string, 10);

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
  const athleteName = athlete?.name ?? "Athlete";

  return (
    <div style={{ padding: "var(--cloud-s5)" }}>
      <div
        className="mx-auto flex flex-col lg:flex-row"
        style={{ maxWidth: 1100, gap: "var(--cloud-s4)" }}
      >
        <div className="w-full lg:w-60 lg:shrink-0">
          <PortalSidebar
            athleteId={athleteId}
            athleteName={athleteName}
            athleteEmail={athlete?.email}
            lastUpdatedISO={athlete?.updated_at}
            activeTab="progression"
          />
        </div>

        <main
          className="flex min-w-0 flex-1 flex-col"
          style={{ gap: "var(--cloud-s4)" }}
        >
          <Link
            href={`/athletes/${athleteId}`}
            className="cloud-btn cloud-btn-ghost"
            style={{ alignSelf: "flex-start" }}
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={1.8} />
            Back to athlete
          </Link>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1
                className="font-semibold cloud-text"
                style={{
                  fontSize: 32,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.05,
                  margin: 0,
                }}
              >
                {athleteName}
              </h1>
              <p className="cloud-text-dim" style={{ marginTop: 8 }}>
                Estimated 1RM progression
              </p>
            </div>
            <div
              className="cloud-eyebrow-sm"
              style={{
                border: "1px solid var(--cloud-border)",
                borderRadius: "var(--cloud-r-sm)",
                padding: "6px 10px",
                background: "var(--cloud-panel)",
                whiteSpace: "nowrap",
              }}
            >
              COACH PREVIEW
            </div>
          </div>

          <section
            className="cloud-panel-raised"
            style={{
              padding: "var(--cloud-s4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--cloud-s3)",
            }}
          >
            <div>
              <p className="cloud-eyebrow" style={{ marginBottom: 8 }}>
                LIFT
              </p>
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
                        background: active
                          ? "rgba(12, 92, 171, 0.22)"
                          : "transparent",
                        boxShadow: active
                          ? "inset 0 0 0 1px rgba(12, 92, 171, 0.40)"
                          : undefined,
                        border: 0,
                        color: active
                          ? "var(--cloud-text)"
                          : "var(--cloud-text-muted)",
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
            </div>

            <div>
              <p className="cloud-eyebrow" style={{ marginBottom: 8 }}>
                RANGE
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
                        border: `1px solid ${
                          active ? "rgba(12, 92, 171, 0.40)" : "var(--cloud-border)"
                        }`,
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
            </div>
          </section>

          <section
            className="cloud-panel-raised"
            style={{
              padding: "var(--cloud-s4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--cloud-s3)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                paddingBottom: 4,
                gap: "var(--cloud-s3)",
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
                  {current !== null ? current : "No data"}
                  {current !== null && (
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
                  )}
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

            {visible.length > 0 ? (
              <E1RMChart
                points={chartPoints}
                blockBoundaries={blockBoundaries}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                unit="lb"
              />
            ) : (
              <p
                className="cloud-text-dim"
                style={{ margin: 0, padding: "var(--cloud-s4)", textAlign: "center" }}
              >
                No data yet for this lift in the selected range.
              </p>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
