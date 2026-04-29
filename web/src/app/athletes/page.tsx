"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import apiClient from "@/lib/api";
import * as Types from "@/lib/types";
import { useAuth } from "@/lib/auth-provider";
import { useNow } from "@/lib/use-now";
import {
  AlertCircle,
  ArrowUp,
  Calendar as CalendarIcon,
  Download,
  Plus,
  Settings,
} from "lucide-react";

type ViewType = "Athletes" | "Availability";
type WeightUnit = "lbs" | "kg";
type ColumnKey =
  | "name" | "age" | "division" | "weight_class" | "latest_block_type"
  | "program_due" | "next_meet_name"
  | "meet_date" | "weeks_out" | "days_out" | "squat_max_lbs" | "bench_max_lbs"
  | "deadlift_max_lbs" | "total_lbs" | "email" | "phone" | "availability_status"
  | "out_from" | "out_through" | "tags" | "latest_program_name"
  | "program_count";

interface ColumnConfig {
  key: ColumnKey;
  label: string;
}

const ALL_COLUMNS: ColumnConfig[] = [
  { key: "name", label: "Name" },
  { key: "age", label: "Age" },
  { key: "division", label: "Division" },
  { key: "weight_class", label: "Weight Class" },
  { key: "latest_block_type", label: "Block" },
  { key: "program_due", label: "Program Due" },
  { key: "next_meet_name", label: "Next Meet" },
  { key: "meet_date", label: "Meet Date" },
  { key: "weeks_out", label: "Weeks Out" },
  { key: "days_out", label: "Days Out" },
  { key: "squat_max_lbs", label: "Squat" },
  { key: "bench_max_lbs", label: "Bench" },
  { key: "deadlift_max_lbs", label: "Deadlift" },
  { key: "total_lbs", label: "Total" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "availability_status", label: "Availability" },
  { key: "out_from", label: "Out From" },
  { key: "out_through", label: "Out Through" },
  { key: "tags", label: "Tags" },
  { key: "latest_program_name", label: "Latest Program" },
  { key: "program_count", label: "Programs" },
];

const DEFAULT_COLUMNS: Record<ViewType, ColumnKey[]> = {
  Athletes: ["name", "latest_block_type", "weight_class", "program_due", "next_meet_name", "squat_max_lbs", "bench_max_lbs", "deadlift_max_lbs", "total_lbs", "program_count"],
  Availability: ["name", "availability_status", "out_from", "out_through"],
};

const NUMERIC_COLUMNS: ColumnKey[] = [
  "age", "weeks_out", "days_out", "squat_max_lbs", "bench_max_lbs",
  "deadlift_max_lbs", "total_lbs", "program_count",
];

type FilteredAthlete = Types.AthleteListResponse;

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


function getBlockBadgeClass(block: string | null | undefined): string {
  if (!block) return "cloud-badge";
  const lower = block.toLowerCase();
  if (lower.includes("deload") || lower.includes("recovery")) {
    return "cloud-badge cloud-badge-warning";
  }
  if (lower.includes("peak") || lower.includes("taper")) {
    return "cloud-badge cloud-badge-success";
  }
  if (
    lower.includes("strength") ||
    lower.includes("hypertrophy") ||
    lower.includes("volume") ||
    lower.includes("accum") ||
    lower.includes("base")
  ) {
    return "cloud-badge cloud-badge-primary";
  }
  return "cloud-badge";
}

function formatRelative(isoDate: string | null | undefined, now: number): string {
  if (!isoDate) return "never";
  const ts = new Date(isoDate).getTime();
  if (isNaN(ts)) return "never";
  const diffSec = (now - ts) / 1000;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) {
    const m = Math.floor(diffSec / 60);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const d = Math.floor(diffSec / 86400);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}


const DOTS_COEFFS = {
  M: [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -1.093e-6],
  F: [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -1.0706e-6],
} as const;


const IPF_GL_COEFFS = {
  M: { A: 1199.72839, B: 1025.18162, C: 0.00921 },
  F: { A: 610.32796, B: 1045.59282, C: 0.03048 },
} as const;

type ScoreFormula = "dots" | "ipf-gl";

function dotsScore(totalLbs: number | null | undefined, bwLbs: number | null | undefined, sex: string | null | undefined): number | null {
  if (!totalLbs || !bwLbs) return null;
  const s = (sex || "").toUpperCase().startsWith("F") ? "F" : "M";
  const [a, b, c, d, e] = DOTS_COEFFS[s];
  const bwKg = bwLbs / 2.20462;
  const totalKg = totalLbs / 2.20462;
  const denom = a + b * bwKg + c * bwKg ** 2 + d * bwKg ** 3 + e * bwKg ** 4;
  if (denom <= 0) return null;
  return (500 * totalKg) / denom;
}

function ipfGlScore(totalLbs: number | null | undefined, bwLbs: number | null | undefined, sex: string | null | undefined): number | null {
  if (!totalLbs || !bwLbs) return null;
  const s = (sex || "").toUpperCase().startsWith("F") ? "F" : "M";
  const { A, B, C } = IPF_GL_COEFFS[s];
  const bwKg = bwLbs / 2.20462;
  const totalKg = totalLbs / 2.20462;
  const denom = A - B * Math.exp(-C * bwKg);
  if (denom <= 0) return null;
  return (100 * totalKg) / denom;
}

function scoreFor(formula: ScoreFormula, totalLbs: number | null | undefined, bwLbs: number | null | undefined, sex: string | null | undefined): number | null {
  return formula === "ipf-gl" ? ipfGlScore(totalLbs, bwLbs, sex) : dotsScore(totalLbs, bwLbs, sex);
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  if (isNaN(target.getTime())) return null;
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

export default function AthletesPage() {
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view") as ViewType | null;
  const searchQuery = searchParams.get("q") ?? "";
  const now = useNow();
  const [currentView, setCurrentView] = useState<ViewType>(
    viewParam && ["Athletes", "Availability"].includes(viewParam)
      ? viewParam
      : "Athletes"
  );
  const [sortField, setSortField] = useState<ColumnKey>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [showArchived, setShowArchived] = useState(false);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("lbs");
  const [scoreFormula, setScoreFormula] = useState<ScoreFormula>("dots");
  const [columnConfig, setColumnConfig] = useState<Record<ViewType, ColumnKey[]>>(DEFAULT_COLUMNS);
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  const columnDropdownRef = useRef<HTMLDivElement>(null);
  const [draggingColumn, setDraggingColumn] = useState<ColumnKey | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ColumnKey | null>(null);
  
  
  const suppressNextSortClick = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedUnit = localStorage.getItem("bestrong_weight_unit") as WeightUnit;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (savedUnit) setWeightUnit(savedUnit);

      const savedFormula = localStorage.getItem("bestrong_score_formula");
      if (savedFormula === "dots" || savedFormula === "ipf-gl") {
        setScoreFormula(savedFormula);
      }

      const savedColumnConfig = localStorage.getItem("bestrong_column_config");
      if (savedColumnConfig) {
        try {
          const parsed = JSON.parse(savedColumnConfig) as Partial<Record<string, string[]>>;
          
          
          if (parsed["Vacations"] && !parsed["Availability"]) {
            parsed["Availability"] = parsed["Vacations"];
          }
          
          
          
          
          const KEY_RENAMES: Record<string, ColumnKey> = {
            vacation_status: "availability_status",
            vacation_start: "out_from",
            vacation_end: "out_through",
          };
          (Object.keys(parsed) as string[]).forEach((view) => {
            const saved = parsed[view];
            if (!saved) return;
            const seen = new Set<string>();
            const migrated: ColumnKey[] = [];
            saved.forEach((k) => {
              const next = (KEY_RENAMES[k] ?? k) as ColumnKey;
              if (!seen.has(next)) {
                seen.add(next);
                migrated.push(next);
              }
            });
            parsed[view] = migrated;
          });
          
          
          
          
          const merged = { ...DEFAULT_COLUMNS } as Record<ViewType, ColumnKey[]>;
          (Object.keys(merged) as ViewType[]).forEach((view) => {
            const saved = parsed[view] as ColumnKey[] | undefined;
            if (!saved) return;
            const defaults = DEFAULT_COLUMNS[view];
            const missing = defaults.filter((c) => !saved.includes(c));
            merged[view] = missing.length ? [...saved, ...missing] : saved;
          });
          setColumnConfig(merged);
        } catch {}
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("bestrong_weight_unit", weightUnit);
    }
  }, [weightUnit]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("bestrong_score_formula", scoreFormula);
    }
  }, [scoreFormula]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("bestrong_column_config", JSON.stringify(columnConfig));
    }
  }, [columnConfig]);

  useEffect(() => {
    if (!showColumnDropdown) return;
    const onDocClick = (e: MouseEvent) => {
      if (columnDropdownRef.current && !columnDropdownRef.current.contains(e.target as Node)) {
        setShowColumnDropdown(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showColumnDropdown]);

  
  const { data: athletes = [], isLoading, error } = useQuery({
    queryKey: ["athletes", showArchived],
    queryFn: () => apiClient.listAthletes(showArchived),
  });

  const { data: meets = [] } = useQuery({
    queryKey: ["meets"],
    queryFn: () => apiClient.listMeets(),
  });

  const { data: driveAuthStatus } = useQuery({
    queryKey: ["gdrive-auth-status"],
    queryFn: () => apiClient.getGDriveAuthStatus(),
    staleTime: 60000,
  });

  const { data: sessionsStats } = useQuery({
    queryKey: ["sessions-stats", "week"],
    queryFn: () => apiClient.getSessionsStats("week"),
    staleTime: 60_000,
  });

  
  const activeAthletes = useMemo(() => athletes.filter((a) => !a.archived), [athletes]);

  const upcomingMeets = useMemo(() => {
    return meets
      .filter((m) => {
        if (!m.meet_date) return false;
        const end = m.meet_date_end || m.meet_date;
        const d = daysUntil(end);
        return d !== null && d >= 0;
      })
      .sort((a, b) => {
        if (!a.meet_date || !b.meet_date) return 0;
        return new Date(a.meet_date).getTime() - new Date(b.meet_date).getTime();
      });
  }, [meets]);

  const nextMeet = upcomingMeets[0];
  const nextMeetDays = nextMeet ? daysUntil(nextMeet.meet_date) : null;
  const nextMeetEntered = nextMeet
    ? activeAthletes.filter((a) => a.next_meet_id === nextMeet.id).length
    : 0;

  const avgScore = useMemo(() => {
    const scores = activeAthletes
      .map((a) => scoreFor(scoreFormula, a.total_lbs, a.latest_bodyweight_lbs, a.sex))
      .filter((s): s is number => typeof s === "number" && s > 0);
    if (scores.length === 0) return null;
    return {
      value: scores.reduce((s, v) => s + v, 0) / scores.length,
      count: scores.length,
    };
  }, [activeAthletes, scoreFormula]);

  const lastDriveSync = driveAuthStatus?.last_successful_sync_at ?? null;

  
  const featuredAthlete = useMemo(() => {
    return (
      activeAthletes.find((a) => a.squat_max_lbs) || activeAthletes[0] || null
    );
  }, [activeAthletes]);

  
  const formatDate = (dateStr: string | undefined | null) => {
    if (!dateStr) return "—";
    try {
      const c = dateStr.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(c)) {
        const d = new Date(c + "T00:00:00");
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
        }
      }
      const d = new Date(c);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
      }
      return "—";
    } catch {
      return "—";
    }
  };

  const convertToKg = (lbs: number | undefined | null) => {
    if (!lbs) return null;
    return (lbs / 2.20462).toFixed(1);
  };

  const formatWeight = (lbs: number | undefined | null): string => {
    if (!lbs) return "—";
    if (weightUnit === "kg") return `${convertToKg(lbs)} kg`;
    return `${lbs} lbs`;
  };

  const getAvailabilityBadgeClass = (status: string | undefined | null) => {
    if (!status) return "cloud-badge";
    const lower = status.toLowerCase();
    if (lower === "available" || lower === "out") return "cloud-badge cloud-badge-warning";
    return "cloud-badge";
  };

  
  
  
  
  
  const isAvailable = (athlete: FilteredAthlete) =>
    (athlete.availability_status ?? "").trim().toLowerCase() === "available";

  const getCellValue = (athlete: FilteredAthlete, columnKey: ColumnKey): string | number | undefined => {
    switch (columnKey) {
      case "squat_max_lbs": return formatWeight(athlete.squat_max_lbs);
      case "bench_max_lbs": return formatWeight(athlete.bench_max_lbs);
      case "deadlift_max_lbs": return formatWeight(athlete.deadlift_max_lbs);
      case "total_lbs": return formatWeight(athlete.total_lbs);
      case "program_due": return formatDate(athlete.program_due);
      case "meet_date": return formatDate(athlete.meet_date);
      case "out_from":
        return isAvailable(athlete) ? "—" : formatDate(athlete.out_from);
      case "out_through":
        return isAvailable(athlete) ? "—" : formatDate(athlete.out_through);
      default:
        return (athlete[columnKey as keyof FilteredAthlete] as string | number | undefined) || "—";
    }
  };

  const getColumnLabel = (columnKey: ColumnKey): string => {
    const column = ALL_COLUMNS.find((c) => c.key === columnKey);
    if (!column) return columnKey;
    if (["squat_max_lbs", "bench_max_lbs", "deadlift_max_lbs", "total_lbs"].includes(columnKey)) {
      return `${column.label} (${weightUnit})`;
    }
    return column.label;
  };

  const filteredAndSortedAthletes = useMemo(() => {
    let result = [...athletes];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((a) => a.name?.toLowerCase().includes(q));
    }
    result.sort((a, b) => {
      const aVal = a[sortField as keyof FilteredAthlete];
      const bVal = b[sortField as keyof FilteredAthlete];
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal || "").toLowerCase();
      const bStr = String(bVal || "").toLowerCase();
      return sortDirection === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
    return result;
  }, [athletes, searchQuery, sortField, sortDirection]);

  const visibleColumns = columnConfig[currentView];

  const toggleColumn = (columnKey: ColumnKey) => {
    setColumnConfig((prev) => {
      const current = prev[currentView];
      const updated = current.includes(columnKey)
        ? current.filter((c) => c !== columnKey)
        : [...current, columnKey];
      return { ...prev, [currentView]: updated };
    });
  };

  const handleSortClick = (columnKey: ColumnKey) => {
    if (suppressNextSortClick.current) {
      suppressNextSortClick.current = false;
      return;
    }
    if (sortField === columnKey) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(columnKey);
      setSortDirection("asc");
    }
  };

  
  
  
  const reorderColumn = (from: ColumnKey, to: ColumnKey) => {
    if (from === to || from === "name" || to === "name") return;
    setColumnConfig((prev) => {
      const current = prev[currentView];
      const fromIdx = current.indexOf(from);
      if (fromIdx < 0) return prev;
      const without = current.filter((c) => c !== from);
      const toIdx = without.indexOf(to);
      if (toIdx < 0) return prev;
      const next = [...without.slice(0, toIdx), from, ...without.slice(toIdx)];
      return { ...prev, [currentView]: next };
    });
  };

  
  if (error) {
    return (
      <div style={{ padding: "var(--cloud-s5)" }}>
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-semibold cloud-text" style={{ letterSpacing: "-0.02em" }}>
            Athletes
          </h1>
          <div
            className="mt-6 flex items-center gap-3 p-4 rounded-[var(--cloud-r-md)]"
            style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.3)" }}
          >
            <AlertCircle className="h-5 w-5 flex-shrink-0" style={{ color: "var(--cloud-danger-text)" }} />
            <p style={{ color: "var(--cloud-danger-text)" }}>Failed to load athletes. Please try again.</p>
          </div>
        </div>
      </div>
    );
  }

  const views: ViewType[] = ["Athletes", "Availability"];

  
  const subtitleParts: string[] = [];
  if (!isLoading) {
    subtitleParts.push(`${activeAthletes.length} active`);
    if (nextMeet && nextMeetEntered > 0) {
      subtitleParts.push(`${nextMeetEntered} entered in ${nextMeet.name}`);
    }
    if (lastDriveSync) {
      subtitleParts.push(`last Drive sync ${formatRelative(lastDriveSync, now)}`);
    }
  }

  return (
    <div style={{ padding: "var(--cloud-s5)" }}>
      <div className="flex flex-col" style={{ gap: "var(--cloud-s4)" }}>
        {}
        <div className="flex items-start justify-between" style={{ gap: "var(--cloud-s3)" }}>
          <div className="min-w-0">
            <h1
              className="font-semibold cloud-text"
              style={{ fontSize: 32, letterSpacing: "-0.03em", lineHeight: 1.1 }}
            >
              Athletes
            </h1>
            <p className="cloud-text-muted" style={{ fontSize: 13, marginTop: 4 }}>
              {isLoading ? "Loading…" : (subtitleParts.join(" · ") || "—")}
            </p>
          </div>
          <div className="flex items-center flex-shrink-0" style={{ gap: "var(--cloud-s2)" }}>
            <a
              href={apiClient.athletesExportCsvUrl()}
              className="cloud-btn cloud-btn-ghost"
              download
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </a>
            <Link href="/athletes/new" className="cloud-btn cloud-btn-primary">
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              Add athlete
            </Link>
          </div>
        </div>

        {}
        <div className="cloud-stats">
          <StatCard
            label="Active athletes"
            value={isLoading ? "—" : activeAthletes.length.toString()}
            foot={
              <span className="cloud-text-muted">
                {athletes.length - activeAthletes.length} archived
              </span>
            }
          />
          <StatCard
            label="Sessions this week"
            value={
              sessionsStats ? sessionsStats.this_window.toString() : "—"
            }
            foot={
              sessionsStats ? (
                typeof sessionsStats.delta_pct === "number" ? (
                  <>
                    <span
                      className={
                        sessionsStats.delta_pct >= 0 ? "cloud-delta-up" : "cloud-delta-down"
                      }
                    >
                      {sessionsStats.delta_pct >= 0 ? "+" : ""}
                      {sessionsStats.delta_pct}%
                    </span>
                    <span className="cloud-text-muted">week over week</span>
                  </>
                ) : (
                  <span className="cloud-text-muted">
                    {sessionsStats.last_window} last week
                  </span>
                )
              ) : null
            }
          />
          <StatCard
            label="Avg score"
            value={avgScore ? avgScore.value.toFixed(1) : "—"}
            labelAccessory={
              <ScoreFormulaToggle value={scoreFormula} onChange={setScoreFormula} />
            }
            foot={
              avgScore ? (
                <span className="cloud-text-muted">
                  {avgScore.count} with bodyweight logged
                </span>
              ) : (
                <span className="cloud-text-muted">
                  log bodyweight to compute
                </span>
              )
            }
          />
          <StatCard
            label="Next meet in"
            value={nextMeetDays !== null ? `${nextMeetDays}` : "—"}
            valueSuffix={
              nextMeetDays !== null ? (
                <span className="cloud-text-muted" style={{ fontSize: 14, fontWeight: 400 }}> days</span>
              ) : null
            }
            foot={
              nextMeet ? (
                <span className="cloud-text-muted truncate">
                  {nextMeet.name} · {nextMeetEntered} entered
                </span>
              ) : (
                <span className="cloud-text-muted">no upcoming meets</span>
              )
            }
          />
        </div>

        {}
        <div className="cloud-grid-2">
          {}
          <div className="cloud-panel">
            <div className="cloud-panel-head" style={{ flexWrap: "wrap", gap: "var(--cloud-s3)" }}>
              <div>
                <h2>Roster</h2>
                <p>Click an athlete to open their profile</p>
              </div>
              <div className="cloud-tabs">
                {views.map((view) => (
                  <button
                    key={view}
                    role="tab"
                    aria-selected={currentView === view}
                    onClick={() => setCurrentView(view)}
                    className="cloud-tab"
                  >
                    {view}
                  </button>
                ))}
              </div>
            </div>

            {}
            <div
              className="flex items-center flex-wrap"
              style={{
                gap: "var(--cloud-s2)",
                padding: "var(--cloud-s2) var(--cloud-s4)",
                borderBottom: "1px solid var(--cloud-border)",
                background: "rgba(0,0,0,0.15)",
              }}
            >
              <div className="cloud-segmented" role="tablist" aria-label="Weight unit">
                <button
                  type="button"
                  role="tab"
                  aria-selected={weightUnit === "lbs"}
                  onClick={() => setWeightUnit("lbs")}
                  className="cloud-segmented-item"
                >
                  LBS
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={weightUnit === "kg"}
                  onClick={() => setWeightUnit("kg")}
                  className="cloud-segmented-item"
                >
                  KG
                </button>
              </div>
              <label
                className="flex items-center cursor-pointer cloud-text-muted"
                style={{ fontSize: 12, gap: 6, padding: "0 var(--cloud-s2)" }}
              >
                <input
                  type="checkbox"
                  className="cloud-checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />
                Show archived
              </label>
              <div className="relative ml-auto" ref={columnDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowColumnDropdown((v) => !v)}
                  className="cloud-btn cloud-btn-ghost cloud-btn-sm"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Columns
                </button>
                {showColumnDropdown && (
                  <div
                    className="absolute z-30 cloud-panel-raised"
                    style={{
                      top: "calc(100% + 6px)",
                      right: 0,
                      minWidth: 240,
                      boxShadow: "0 20px 40px -16px rgba(0,0,0,0.6), 0 8px 16px -4px rgba(0,0,0,0.4)",
                    }}
                  >
                    <div className="max-h-96 overflow-y-auto cloud-thin-scroll" style={{ padding: "var(--cloud-s2)" }}>
                      {ALL_COLUMNS.map((column) => (
                        <label
                          key={column.key}
                          className="flex items-center cursor-pointer cloud-text-hover rounded"
                          style={{ padding: "6px var(--cloud-s2)", gap: "var(--cloud-s2)", fontSize: 12 }}
                        >
                          <input
                            type="checkbox"
                            className="cloud-checkbox"
                            checked={visibleColumns.includes(column.key)}
                            onChange={() => toggleColumn(column.key)}
                          />
                          <span>{column.label}</span>
                        </label>
                      ))}
                    </div>
                    <div
                      className="flex"
                      style={{
                        gap: "var(--cloud-s2)",
                        padding: "var(--cloud-s2)",
                        borderTop: "1px solid var(--cloud-border)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setColumnConfig((prev) => ({
                            ...prev,
                            [currentView]: DEFAULT_COLUMNS[currentView],
                          }))
                        }
                        className="cloud-btn cloud-btn-ghost cloud-btn-sm flex-1"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowColumnDropdown(false)}
                        className="cloud-btn cloud-btn-primary cloud-btn-sm flex-1"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {}
            {isLoading ? (
              <div style={{ padding: "var(--cloud-s4)" }}>
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="animate-pulse rounded"
                      style={{ height: 48, background: "var(--cloud-panel-hover)" }}
                    />
                  ))}
                </div>
              </div>
            ) : filteredAndSortedAthletes.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center text-center"
                style={{ padding: "var(--cloud-s6) var(--cloud-s4)", gap: "var(--cloud-s3)" }}
              >
                <p className="cloud-text-muted" style={{ fontSize: 14 }}>
                  {searchQuery.trim()
                    ? "No athletes match your search."
                    : "No athletes yet — add your first athlete to get started."}
                </p>
                {!searchQuery.trim() && (
                  <Link href="/athletes/new" className="cloud-btn cloud-btn-primary">
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Add athlete
                  </Link>
                )}
              </div>
            ) : (
              <div className="cloud-table-scroll">
                <table className="cloud-table">
                  <thead>
                    <tr>
                      {visibleColumns.map((columnKey) => {
                        const isSorted = sortField === columnKey;
                        const isNumericCol = NUMERIC_COLUMNS.includes(columnKey);
                        const isDraggable = columnKey !== "name";
                        const isDragTarget =
                          isDraggable &&
                          dragOverColumn === columnKey &&
                          draggingColumn !== null &&
                          draggingColumn !== columnKey;
                        return (
                          <th
                            key={columnKey}
                            onClick={() => handleSortClick(columnKey)}
                            draggable={isDraggable}
                            onDragStart={(e) => {
                              if (!isDraggable) return;
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", columnKey);
                              setDraggingColumn(columnKey);
                            }}
                            onDragEnd={() => {
                              setDraggingColumn(null);
                              setDragOverColumn(null);
                            }}
                            onDragOver={(e) => {
                              if (!isDraggable || !draggingColumn) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                              if (dragOverColumn !== columnKey) setDragOverColumn(columnKey);
                            }}
                            onDragLeave={() => {
                              if (dragOverColumn === columnKey) setDragOverColumn(null);
                            }}
                            onDrop={(e) => {
                              if (!isDraggable || !draggingColumn) return;
                              e.preventDefault();
                              if (draggingColumn !== columnKey) {
                                reorderColumn(draggingColumn, columnKey);
                                suppressNextSortClick.current = true;
                              }
                              setDraggingColumn(null);
                              setDragOverColumn(null);
                            }}
                            className="cloud-th-sortable"
                            style={{
                              color: isSorted ? "var(--cloud-text-muted)" : undefined,
                              textAlign: isNumericCol ? "right" : "left",
                              whiteSpace: "nowrap",
                              cursor: isDraggable ? "grab" : undefined,
                              opacity: draggingColumn === columnKey ? 0.4 : undefined,
                              boxShadow: isDragTarget
                                ? "inset 2px 0 0 0 var(--cloud-primary)"
                                : undefined,
                            }}
                          >
                            {getColumnLabel(columnKey)}
                            {isSorted && (
                              <span style={{ marginLeft: 4, fontSize: 9 }}>
                                {sortDirection === "asc" ? "▲" : "▼"}
                              </span>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedAthletes.map((athlete) => (
                      <tr key={athlete.id}>
                        {visibleColumns.map((columnKey) => {
                          const isNumeric = NUMERIC_COLUMNS.includes(columnKey);
                          const tdStyle: React.CSSProperties = {
                            textAlign: isNumeric ? "right" : "left",
                            fontVariantNumeric: isNumeric ? "tabular-nums" : undefined,
                            whiteSpace: "nowrap",
                          };

                          if (columnKey === "name") {
                            return (
                              <td key={columnKey} style={tdStyle}>
                                <Link
                                  href={`/athletes/${athlete.id}`}
                                  className="cloud-athlete-cell group"
                                  style={{ textDecoration: "none" }}
                                >
                                  <span className={`cloud-athlete-avatar ${getAvatarColor(athlete.id)}`}>
                                    {getInitials(athlete.name)}
                                  </span>
                                  <span>
                                    <span className="cloud-athlete-name group-hover:underline block">
                                      {athlete.name}
                                    </span>
                                    <span className="cloud-athlete-meta">
                                      {[
                                        athlete.weight_class,
                                        athlete.sex,
                                        athlete.archived ? "Archived" : null,
                                      ].filter(Boolean).join(" · ") || "—"}
                                    </span>
                                  </span>
                                </Link>
                              </td>
                            );
                          }
                          if (columnKey === "next_meet_name") {
                            return (
                              <td key={columnKey} style={tdStyle}>
                                {athlete.next_meet_name ? (
                                  <Link
                                    href={`/meets/${athlete.next_meet_id}`}
                                    className="hover:underline"
                                    style={{ color: "var(--cloud-primary-text)" }}
                                  >
                                    {athlete.next_meet_name}
                                  </Link>
                                ) : (
                                  <span className="cloud-text-dim">—</span>
                                )}
                              </td>
                            );
                          }
                          if (columnKey === "latest_block_type") {
                            return (
                              <td key={columnKey} style={tdStyle}>
                                {athlete.latest_block_type ? (
                                  <span className={getBlockBadgeClass(athlete.latest_block_type)}>
                                    <span className="cloud-badge-dot" />
                                    {athlete.latest_block_type}
                                  </span>
                                ) : (
                                  <span className="cloud-text-dim">—</span>
                                )}
                              </td>
                            );
                          }
                          if (columnKey === "availability_status") {
                            return (
                              <td key={columnKey} style={tdStyle}>
                                {athlete.availability_status ? (
                                  <span className={getAvailabilityBadgeClass(athlete.availability_status)}>
                                    <span className="cloud-badge-dot" />
                                    {athlete.availability_status}
                                  </span>
                                ) : (
                                  <span className="cloud-text-dim">—</span>
                                )}
                              </td>
                            );
                          }

                          const val = getCellValue(athlete, columnKey);
                          const isDash = val === "—";
                          return (
                            <td
                              key={columnKey}
                              style={tdStyle}
                              className={isDash ? "cloud-text-dim" : "cloud-text"}
                            >
                              {val}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {}
          <FeaturedChartPanel athlete={featuredAthlete} />
        </div>

        {}
        <div className="cloud-grid-halves">
          <RecentPRsPanel />
          <UpcomingMeetsPanel meets={upcomingMeets} athletes={activeAthletes} />
        </div>

        {}
        {!isLoading && filteredAndSortedAthletes.length > 0 && (
          <div className="cloud-text-muted" style={{ fontSize: 12 }}>
            Showing {filteredAndSortedAthletes.length} of {athletes.length} athlete
            {athletes.length !== 1 ? "s" : ""}
            {searchQuery.trim() && <> matching &ldquo;{searchQuery}&rdquo;</>}
          </div>
        )}
      </div>
    </div>
  );
}


function ScoreFormulaToggle({
  value,
  onChange,
}: {
  value: ScoreFormula;
  onChange: (next: ScoreFormula) => void;
}) {
  const options: { id: ScoreFormula; label: string }[] = [
    { id: "dots", label: "DOTS" },
    { id: "ipf-gl", label: "GL" },
  ];
  return (
    <div className="flex gap-1">
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
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
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}


function StatCard({
  label,
  value,
  valueSuffix,
  foot,
  labelAccessory,
}: {
  label: string;
  value: string;
  valueSuffix?: React.ReactNode;
  foot?: React.ReactNode;
  labelAccessory?: React.ReactNode;
}) {
  return (
    <div className="cloud-stat">
      <div
        className="cloud-stat-label"
        style={
          labelAccessory
            ? { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }
            : undefined
        }
      >
        <span>{label}</span>
        {labelAccessory}
      </div>
      <div className="cloud-stat-value">
        {value}
        {valueSuffix}
      </div>
      <div className="cloud-stat-foot">{foot}</div>
    </div>
  );
}


function FeaturedChartPanel({
  athlete,
}: {
  athlete: Types.AthleteListResponse | null;
}) {
  const { tenantSettings } = useAuth();
  const tracksRpe = tenantSettings.tracks_rpe;
  const { data: trends, isLoading } = useQuery({
    queryKey: ["e1rm-trends-featured", athlete?.id],
    queryFn: () =>
      apiClient.getE1RMTrends(athlete!.id, {
        liftCategory: "squat",
        primaryOnly: true,
      }),
    enabled: !!athlete?.id,
    staleTime: 60000,
  });

  if (!athlete) {
    return (
      <div className="cloud-panel flex flex-col">
        <div className="cloud-panel-head">
          <div>
            <h2>Featured athlete</h2>
            <p>Select an athlete to feature here</p>
          </div>
        </div>
        <div
          className="flex-1 grid place-items-center cloud-text-muted"
          style={{ padding: "var(--cloud-s6)", fontSize: 13 }}
        >
          No athletes yet.
        </div>
      </div>
    );
  }

  const points = (trends || []).filter((p) => typeof p.e1rm === "number");
  const chartData = points.map((p, i) => ({
    idx: i,
    e1rm: p.e1rm,
    week: p.week_number,
    rpe: p.actual_rpe,
    programId: p.program_id,
  }));

  
  
  
  const currentProgramId = athlete.latest_program_id ?? null;
  const blockPoints = currentProgramId
    ? points.filter((p) => p.program_id === currentProgramId)
    : [];

  const currentE1rm = points.length > 0 ? points[points.length - 1].e1rm : null;
  const blockStartE1rm =
    blockPoints.length > 0 ? blockPoints[0].e1rm : null;
  const blockLatestE1rm =
    blockPoints.length > 0 ? blockPoints[blockPoints.length - 1].e1rm : null;
  const blockDelta =
    typeof blockStartE1rm === "number" && typeof blockLatestE1rm === "number"
      ? Math.round(blockLatestE1rm - blockStartE1rm)
      : null;

  const rpeValues = blockPoints
    .map((p) => p.actual_rpe)
    .filter((r): r is number => typeof r === "number");
  const rpeAvg =
    rpeValues.length > 0
      ? (rpeValues.reduce((s, v) => s + v, 0) / rpeValues.length).toFixed(1)
      : null;

  return (
    <div className="cloud-panel flex flex-col">
      <div className="cloud-panel-head">
        <div className="min-w-0">
          <h2 className="truncate">
            {athlete.name} · Squat
          </h2>
          <p>
            {points.length > 0
              ? `${points.length} sessions · e1RM`
              : "No e1RM data yet"}
          </p>
        </div>
        <div className="flex items-center" style={{ gap: "var(--cloud-s2)" }}>
          {athlete.latest_block_type && (
            <span className={getBlockBadgeClass(athlete.latest_block_type)}>
              <span className="cloud-badge-dot" />
              {athlete.latest_block_type}
            </span>
          )}
          <span className="cloud-badge cloud-badge-primary">Featured</span>
        </div>
      </div>
      <div className="cloud-chart-stats">
        <div>
          <div className="cloud-chart-stat-label">Current e1RM</div>
          <div className="cloud-chart-stat-value">
            {currentE1rm !== null && currentE1rm !== undefined
              ? Math.round(currentE1rm as number)
              : "—"}
            {currentE1rm !== null && currentE1rm !== undefined && (
              <span className="cloud-text-dim" style={{ fontSize: 12, fontWeight: 400 }}> lb</span>
            )}
          </div>
        </div>
        <div>
          <div className="cloud-chart-stat-label">Block delta</div>
          <div
            className="cloud-chart-stat-value"
            style={{
              color:
                blockDelta !== null
                  ? blockDelta >= 0
                    ? "var(--cloud-success-text)"
                    : "var(--cloud-danger-text)"
                  : undefined,
            }}
          >
            {blockDelta !== null ? `${blockDelta >= 0 ? "+" : ""}${blockDelta}` : "—"}
          </div>
        </div>
        {tracksRpe && (
          <div>
            <div className="cloud-chart-stat-label">RPE avg</div>
            <div className="cloud-chart-stat-value">{rpeAvg ?? "—"}</div>
          </div>
        )}
      </div>
      <div style={{ padding: "var(--cloud-s3) var(--cloud-s4) var(--cloud-s4)", height: 240 }}>
        {isLoading ? (
          <div className="h-full grid place-items-center cloud-text-muted" style={{ fontSize: 13 }}>
            Loading chart…
          </div>
        ) : chartData.length < 2 ? (
          <div className="h-full grid place-items-center cloud-text-muted" style={{ fontSize: 13 }}>
            Not enough data for a chart yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="featuredFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0c5cab" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0c5cab" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="rgba(255,255,255,0.04)"
                strokeDasharray="2 4"
                vertical={false}
              />
              <XAxis
                dataKey="idx"
                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                hide
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={28}
                domain={["dataMin - 10", "dataMax + 10"]}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--cloud-surface-raised)",
                  border: "1px solid var(--cloud-border-strong)",
                  borderRadius: "var(--cloud-r-sm)",
                  fontSize: 12,
                  padding: "8px 12px",
                }}
                cursor={{ stroke: "rgba(255,255,255,0.1)" }}
                labelFormatter={(idx) => {
                  const p = chartData[idx as number];
                  return p ? `Week ${p.week}` : "";
                }}
                formatter={(v) => [`${Math.round(Number(v))} lb`, "e1RM"]}
              />
              <Area
                type="monotone"
                dataKey="e1rm"
                stroke="#4a7fc4"
                strokeWidth={2}
                fill="url(#featuredFill)"
                activeDot={{ r: 4, fill: "#0c5cab", stroke: "#0f0f12", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}


function RecentPRsPanel() {
  const now = useNow();
  const { data: prs = [], isLoading } = useQuery({
    queryKey: ["recent-prs", 7],
    queryFn: () => apiClient.getRecentPRs(7, 10),
    staleTime: 30_000,
  });

  return (
    <div className="cloud-panel">
      <div className="cloud-panel-head">
        <div>
          <h2>Recent PRs</h2>
          <p>Last 7 days across the roster</p>
        </div>
        <span className="cloud-badge cloud-badge-success">
          <span className="cloud-badge-dot" />
          Live
        </span>
      </div>
      {isLoading ? (
        <div style={{ padding: "var(--cloud-s4)" }} className="cloud-text-muted">
          Loading…
        </div>
      ) : prs.length === 0 ? (
        <div
          className="flex items-center justify-center text-center"
          style={{ padding: "var(--cloud-s5) var(--cloud-s4)" }}
        >
          <span className="cloud-text-muted" style={{ fontSize: 13 }}>
            No PRs logged in the last 7 days.
          </span>
        </div>
      ) : (
        prs.map((pr, i) => (
          <Link
            key={`${pr.athlete_id}-${pr.recorded_at}-${i}`}
            href={`/athletes/${pr.athlete_id}`}
            className="cloud-feed-item"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="cloud-feed-icon">
              <ArrowUp className="w-4 h-4" strokeWidth={2} />
            </div>
            <div className="cloud-feed-body">
              <div className="cloud-feed-title">
                <strong>{pr.athlete_name}</strong> hit a {pr.lift} PR —{" "}
                <span className="cloud-feed-value">
                  {Math.round(pr.weight_lbs)} lb
                </span>
                {typeof pr.reps === "number" && pr.reps > 1 && (
                  <span className="cloud-text-muted"> @ {pr.reps} reps</span>
                )}
              </div>
              <div className="cloud-feed-meta">
                {formatRelative(pr.recorded_at, now)}
                {typeof pr.delta_lbs === "number" && pr.delta_lbs > 0 && (
                  <> · +{Math.round(pr.delta_lbs)} lb over prior best</>
                )}
              </div>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}


function UpcomingMeetsPanel({
  meets,
  athletes,
}: {
  meets: Types.MeetListResponse[];
  athletes: Types.AthleteListResponse[];
}) {
  const within90 = meets.filter((m) => {
    const d = daysUntil(m.meet_date);
    return d !== null && d <= 90;
  });

  return (
    <div className="cloud-panel">
      <div className="cloud-panel-head">
        <div>
          <h2>Upcoming meets</h2>
          <p>Next 90 days</p>
        </div>
        <Link href="/meets" className="cloud-btn cloud-btn-ghost cloud-btn-sm">
          View all
        </Link>
      </div>
      {within90.length === 0 ? (
        <div
          className="flex items-center justify-center text-center"
          style={{ padding: "var(--cloud-s5) var(--cloud-s4)" }}
        >
          <span className="cloud-text-muted" style={{ fontSize: 13 }}>
            No meets scheduled in the next 90 days.
          </span>
        </div>
      ) : (
        within90.map((meet) => {
          const days = daysUntil(meet.meet_date);
          const entered = athletes.filter((a) => a.next_meet_id === meet.id).length;
          const urgent = days !== null && days <= 30;
          const iconClass = urgent
            ? "cloud-feed-icon cloud-feed-icon-warning"
            : "cloud-feed-icon";
          return (
            <Link
              key={meet.id}
              href={`/meets/${meet.id}`}
              className="cloud-feed-item"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className={iconClass}>
                <CalendarIcon className="w-4 h-4" />
              </div>
              <div className="cloud-feed-body">
                <div className="cloud-feed-title">
                  <strong>{meet.name}</strong>
                </div>
                <div className="cloud-feed-meta">
                  {meet.meet_date &&
                    new Date(meet.meet_date + "T00:00:00").toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  {meet.location && ` · ${meet.location}`}
                  {entered > 0 && ` · ${entered} ${entered === 1 ? "athlete" : "athletes"} entered`}
                </div>
                <div className="cloud-tag-row">
                  {meet.federation && <span className="cloud-badge">{meet.federation}</span>}
                  {days !== null && (
                    <span
                      className={`cloud-badge ${urgent ? "cloud-badge-warning" : ""}`}
                    >
                      {urgent && <span className="cloud-badge-dot" />}
                      {days} days
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })
      )}
    </div>
  );
}
