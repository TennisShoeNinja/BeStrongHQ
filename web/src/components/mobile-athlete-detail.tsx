"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Activity, Flame } from "lucide-react";
import apiClient from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import { MobileTopbar } from "@/components/mobile-topbar";
import {
  convertWeight,
  resolveWeightUnit,
  unitLabel,
  useLocalWeightUnit,
  type WeightUnit,
} from "@/lib/units";
import { CurrentCycleCard } from "@/components/current-cycle-card";
import { EmptyState } from "@/components/empty-state";
import { TodaySessionCard } from "@/components/today-session-card";
import type * as Types from "@/lib/types";

interface Props {
  athlete: Types.AthleteResponse;
  programs: Types.ProgramListResponse[];
}

function getInitials(name: string | undefined | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarColor(id: number): string {
  const idx = ((id % 6) + 6) % 6;
  return `cloud-av-${idx + 1}`;
}

function formatRelativeDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const entry = new Date(t);
  const entryDay = new Date(entry.getFullYear(), entry.getMonth(), entry.getDate());
  const days = Math.round((today.getTime() - entryDay.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) {
    return entry.toLocaleDateString("en-US", { weekday: "short" });
  }
  return entry.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatLiftValue(lbs: number | null | undefined, unit: WeightUnit): string {
  if (lbs == null || !Number.isFinite(lbs)) return "-";
  const v = convertWeight(lbs, unit);
  return String(Math.round(v));
}

function prettyLiftName(lift: string): string {
  return lift
    .split(/[_\s]+/)
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p))
    .join(" ");
}

export function MobileAthleteDetail({ athlete, programs }: Props) {
  const router = useRouter();
  const { instance } = useAuth();
  const teamName = instance?.org_name || "BeStrong";

  const localUnit = useLocalWeightUnit();
  const { data: settingsData } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiClient.getSettings(),
    staleTime: 60000,
  });
  const unit: WeightUnit = resolveWeightUnit(localUnit, settingsData?.default_unit);

  const { data: maxHistory = [] } = useQuery({
    queryKey: ["max-history", athlete.id],
    queryFn: () => apiClient.getMaxHistory(athlete.id),
  });
  const { data: todaySessions = [] } = useQuery({
    queryKey: ["today-sessions"],
    queryFn: () => apiClient.getTodaySessions(),
    staleTime: 60000,
  });
  const todaySessionEntry =
    todaySessions.find((entry) => entry.athlete_id === athlete.id) ?? null;

  const recentEntries = [...maxHistory]
    .sort((a, b) => {
      const ta = new Date(a.recorded_at).getTime();
      const tb = new Date(b.recorded_at).getTime();
      return tb - ta;
    })
    .slice(0, 3);

  const initials = getInitials(athlete.name);
  const avClass = getAvatarColor(athlete.id);
  const eyebrowBits = [teamName];
  if (athlete.sex && athlete.weight_class) {
    eyebrowBits.push(`${athlete.sex}, ${athlete.weight_class}`);
  }

  const metaBits: string[] = [];
  if (athlete.age != null) metaBits.push(`${athlete.age} yrs`);
  if (athlete.division) metaBits.push(athlete.division);
  if (athlete.membership_no != null) metaBits.push(`OPL #${athlete.membership_no}`);

  const lifts: Array<{ label: string; lbs: number | null | undefined }> = [
    { label: "Squat", lbs: athlete.squat_max_lbs },
    { label: "Bench", lbs: athlete.bench_max_lbs },
    { label: "Deadlift", lbs: athlete.deadlift_max_lbs },
  ];

  return (
    <div>
      <MobileTopbar backHref="/athletes" />

      <div style={{ padding: "var(--cloud-s2) var(--cloud-s4) 96px" }}>
        {/* Identity block */}
        <div
          style={{
            display: "flex",
            gap: "var(--cloud-s3)",
            alignItems: "flex-start",
            marginBottom: "var(--cloud-s4)",
          }}
        >
          <div
            className={avClass}
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              fontWeight: 600,
              fontSize: 22,
              color: "var(--cloud-text)",
              border: "1px solid var(--cloud-border-strong)",
              flex: "none",
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              className="cloud-mhome-team-eyebrow"
              style={{ marginBottom: 4 }}
            >
              {eyebrowBits.map((bit, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "var(--cloud-s2)" }}>
                  {i > 0 && <span className="sep" aria-hidden />}
                  <span>{bit}</span>
                </span>
              ))}
            </p>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
                margin: 0,
              }}
            >
              <span className="cloud-text-grad-blue">{athlete.name}</span>
            </h1>
            {metaBits.length > 0 && (
              <p
                style={{
                  fontSize: 12,
                  color: "var(--cloud-text-dim)",
                  margin: "var(--cloud-s1) 0 0",
                  letterSpacing: "0.01em",
                }}
              >
                {metaBits.join(" · ")}
              </p>
            )}
          </div>
        </div>

        {/* Current cycle */}
        <div className="cloud-mhome-section-h">
          <p className="eyebrow">Current cycle</p>
        </div>
        <div style={{ marginBottom: "var(--cloud-s5)" }}>
          <CurrentCycleCard
            athlete={athlete}
            currentProgram={programs[0] ?? null}
            onOpenMeet={(mid) => router.push(`/meets/${mid}`)}
          />
        </div>

        {todaySessionEntry?.session && (
          <div style={{ marginBottom: "var(--cloud-s5)" }}>
            <TodaySessionCard entry={todaySessionEntry} />
          </div>
        )}

        {/* Recent activity */}
        <div className="cloud-mhome-section-h">
          <p className="eyebrow">Recent</p>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--cloud-s2)",
            marginBottom: "var(--cloud-s5)",
          }}
        >
          {recentEntries.length === 0 ? (
            <EmptyState
              icon={Activity}
              iconTone="muted"
              body="No recent activity logged yet."
              compact
            />
          ) : (
            recentEntries.map((entry) => {
              const liftName = prettyLiftName(entry.lift);
              const weight = formatLiftValue(entry.new_value, unit);
              const subBits: string[] = [];
              const wt = `${weight}${unitLabel(unit)}`;
              const reps = entry.reps != null ? `${wt} × ${entry.reps}` : wt;
              subBits.push(reps);
              return (
                <div
                  key={entry.id}
                  style={{
                    position: "relative",
                    background: "var(--cloud-panel)",
                    border: "1px solid var(--cloud-border)",
                    borderRadius: "var(--cloud-r-md)",
                    padding: "12px var(--cloud-s3)",
                    display: "grid",
                    gridTemplateColumns: "32px 1fr auto",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(16, 185, 129, 0.12)",
                      color: "var(--cloud-success-text)",
                      border: "1px solid rgba(16, 185, 129, 0.25)",
                    }}
                  >
                    <Flame style={{ width: 14, height: 14 }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        letterSpacing: "-0.005em",
                        margin: 0,
                      }}
                    >
                      New PR · {liftName}
                    </p>
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--cloud-text-muted)",
                        margin: "2px 0 0",
                        letterSpacing: "0.02em",
                      }}
                    >
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}>
                        {subBits.join(" · ")}
                      </span>
                    </p>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--cloud-text-dim)",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {formatRelativeDay(entry.recorded_at)}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Estimated 1RM strip */}
        <div className="cloud-mhome-section-h">
          <p className="eyebrow">Estimated 1RM</p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "var(--cloud-s2)",
            marginBottom: "var(--cloud-s5)",
          }}
        >
          {lifts.map((lift) => (
            <div
              key={lift.label}
              style={{
                position: "relative",
                background: "var(--cloud-panel)",
                border: "1px solid var(--cloud-border)",
                borderRadius: "var(--cloud-r-md)",
                padding: "14px 12px 12px",
                overflow: "hidden",
              }}
            >
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--cloud-text-dim)",
                  margin: "0 0 6px",
                }}
              >
                {lift.label}
              </p>
              <p
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                  margin: 0,
                  color: "var(--cloud-text)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatLiftValue(lift.lbs, unit)}
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
              </p>
              {/* TODO: wire trailing sparkline from MaxHistory once weekly aggregation lands */}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
