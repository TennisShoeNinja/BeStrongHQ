"use client";

import { Fragment, useState, useEffect, useMemo, useRef, useCallback, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQueries, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/use-now";
import * as Types from "@/lib/types";
import {
  convertWeight,
  formatWeight,
  kgToLbs,
  resolveWeightUnit,
  setWeightUnit,
  unitLabel,
  useLocalWeightUnit,
  type WeightUnit,
} from "@/lib/units";
import {
  ageFromDob,
  combinedWeightClasses,
  customWeightClassesKey,
  normalizeDateForInput,
  parseCustomClasses,
  serializeCustomClasses,
  weightClassCapKg,
  type AthleteSex,
} from "@/lib/weight-classes";
import { useTheme } from "@/lib/theme-provider";
import { useAuth } from "@/lib/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import BlockReviewSummary from "@/components/BlockReviewSummary";
import PRDetailModal from "@/components/PRDetailModal";
import { ManageVariationsModal } from "@/components/manage-variations-modal";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  AlertCircle,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Merge,
  ArrowUpDown,
  Search,
  Info,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ExternalLink,
  MoreVertical,
  Archive,
  ArchiveRestore,
  ListPlus,
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  X,
  CalendarOff,
  UserCheck,
  UserX,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceDot,
  ReferenceLine,
} from "recharts";


type HighlightedExercise = {
  exercise_name: string;
  program_number: number;
  week_number: number;
  day_number: number;
  reps: number;
  weight_lbs: number;
  lift_category: string;
};


const DIVISIONS = [
  "Teen I",
  "Teen II",
  "Teen III",
  "Junior",
  "Open",
  "Master I",
  "Master II",
  "Master III",
  "Master IV",
];


function extractErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const maybe = err as { data?: { detail?: unknown }; message?: unknown };
    if (typeof maybe.data?.detail === "string") return maybe.data.detail;
    if (typeof maybe.message === "string") return maybe.message;
  }
  return fallback;
}


function formatDate(dateStr: string | undefined | null) {
  if (!dateStr) return "—";
  try {
    
    const cleanedDate = dateStr.trim();

    
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanedDate)) {
      const date = new Date(cleanedDate + "T00:00:00");
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString("en-US", {
          month: "2-digit",
          day: "2-digit",
          year: "numeric",
        });
      }
    }

    
    const date = new Date(cleanedDate);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      });
    }

    return "—";
  } catch {
    return "—";
  }
}


function formatMeetCountdown(meetDate: string | undefined | null): string | null {
  if (!meetDate) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meetDate.trim())) return null;
  const meet = new Date(meetDate.trim() + "T00:00:00");
  if (isNaN(meet.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((meet.getTime() - today.getTime()) / 86400000);
  if (days < 0) return null;
  return `${Math.floor(days / 7)}w ${days % 7}d`;
}


function subscribeToCompMaxesPref(cb: () => void): () => void {
  if (typeof window === "undefined") return () => { };
  
  
  
  window.addEventListener("bestrong:compMaxesPrefChanged", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("bestrong:compMaxesPrefChanged", cb);
    window.removeEventListener("storage", cb);
  };
}
function getCompMaxesPref(): boolean {
  if (typeof window === "undefined") return false;
  
  
  return window.localStorage.getItem("bestrong.showCompMaxes") === "true";
}
function getCompMaxesPrefServer(): boolean {
  return false;
}


function ProfileStatusPills({
  athlete,
  localProgramDue,
  setLocalProgramDue,
  localReminderDays,
  setLocalReminderDays,
  onInlineUpdate,
  onBumpDate,
  onOpenMeet,
}: {
  athlete: Types.AthleteResponse;
  localProgramDue: string;
  setLocalProgramDue: (v: string) => void;
  localReminderDays: number;
  setLocalReminderDays: (v: number) => void;
  onInlineUpdate: (
    field: keyof Types.AthleteUpdate,
    value: Types.AthleteUpdate[keyof Types.AthleteUpdate]
  ) => void;
  onBumpDate: (unit: "week" | "month") => void;
  onOpenMeet: (meetId: number) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const meetUpcoming = !!athlete.meet_date && athlete.meet_date >= today;
  const availabilityActive =
    !!athlete.availability_status &&
    athlete.availability_status !== "Available" &&
    athlete.availability_status.trim() !== "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {}
      <div
        className="flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg border"
        style={{
          backgroundColor: "var(--cloud-surface-raised)",
          borderColor: "var(--cloud-border)",
        }}
      >
        <Clock className="w-3.5 h-3.5 cloud-text-dim shrink-0" />
        <span className="text-[11px] cloud-text-dim uppercase tracking-wide">
          Due
        </span>
        <input
          type="date"
          value={localProgramDue}
          onChange={(e) => {
            setLocalProgramDue(e.target.value);
            if (e.target.value) onInlineUpdate("program_due", e.target.value);
          }}
          style={{
            backgroundColor: "rgba(255,255,255,0.03)",
            borderColor: "var(--cloud-border)",
            color: "var(--cloud-text)",
            colorScheme: "dark",
          }}
          className="border rounded px-2 py-0.5 text-xs"
        />
        <button
          onClick={() => onBumpDate("week")}
          title="Add 7 days"
          className="text-[11px] px-1.5 py-0.5 rounded border border-[color:var(--cloud-border)] cloud-text-muted hover:bg-[color:var(--cloud-surface-raised)]"
        >
          +1w
        </button>
        <button
          onClick={() => onBumpDate("month")}
          title="Add 1 month"
          className="text-[11px] px-1.5 py-0.5 rounded border border-[color:var(--cloud-border)] cloud-text-muted hover:bg-[color:var(--cloud-surface-raised)]"
        >
          +1m
        </button>
        <select
          value={localReminderDays}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            setLocalReminderDays(val);
            onInlineUpdate("reminder_days_before", val);
          }}
          title="Reminder lead time"
          style={{
            backgroundColor: "rgba(255,255,255,0.03)",
            borderColor: "var(--cloud-border)",
            colorScheme: "dark",
          }}
          className="border rounded px-1.5 py-0.5 text-[11px] cloud-text-muted cursor-pointer"
        >
          <option value={-1}>No reminder</option>
          <option value={0}>On day of</option>
          <option value={1}>1d before</option>
          <option value={2}>2d before</option>
          <option value={3}>3d before</option>
          <option value={5}>5d before</option>
          <option value={7}>1w before</option>
          <option value={14}>2w before</option>
        </select>
      </div>

      {}
      {availabilityActive && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-md"
          style={{
            background: "rgba(245, 158, 11, 0.1)",
            border: "1px solid rgba(245, 158, 11, 0.35)",
          }}
          title={
            athlete.out_from || athlete.out_through
              ? `${athlete.out_from || "?"} → ${athlete.out_through || "?"}`
              : undefined
          }
        >
          <span
            className="cloud-text-dim"
            style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}
          >
            Availability
          </span>
          <span className="font-medium" style={{ fontSize: 12, color: "#fcd34d" }}>
            {athlete.availability_status}
          </span>
        </div>
      )}

      {}
      {meetUpcoming && (
        <button
          type="button"
          onClick={() =>
            athlete.next_meet_id && onOpenMeet(athlete.next_meet_id)
          }
          disabled={!athlete.next_meet_id}
          className="flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg border hover:bg-[color:var(--cloud-surface-raised)] transition-colors"
          style={{
            backgroundColor: "var(--cloud-surface-raised)",
            borderColor: "var(--cloud-border)",
          }}
        >
          <span className="text-[11px] cloud-text-dim uppercase tracking-wide">
            Meet
          </span>
          <span className="cloud-text text-xs font-medium truncate max-w-[320px]">
            {athlete.next_meet_name || "Assigned meet"}
          </span>
          <span className="text-[11px] cloud-text-dim">
            {formatMeetCountdown(athlete.meet_date) ?? athlete.meet_date}
          </span>
        </button>
      )}
    </div>
  );
}


function DetailsModal({
  open,
  onOpenChange,
  athlete,
  onEditProfile,
  onOpenMeet,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  athlete: Types.AthleteResponse;
  onEditProfile: () => void;
  onOpenMeet: (meetId: number) => void;
}) {
  const age = ageFromDob(athlete.dob) ?? athlete.age ?? null;
  const sexLabel =
    athlete.sex === "M" ? "Men's" : athlete.sex === "F" ? "Women's" : null;

  const row = (label: string, value: ReactNode) => (
    <div
      className="grid grid-cols-[104px_1fr] gap-4 py-2 border-b last:border-0"
      style={{ borderColor: "var(--cloud-border)" }}
    >
      <div
        className="cloud-text-dim pt-0.5"
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div className="cloud-text" style={{ fontSize: 13 }}>
        {value ?? <span className="cloud-text-dim">—</span>}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
            Details
          </DialogTitle>
          <DialogDescription className="cloud-text-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
            Reference info for {athlete.name}. Tap &ldquo;Edit profile&rdquo;
            to make changes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-0">
          {row("Name", athlete.name)}
          {row(
            "Age",
            age != null ? (
              <span>
                {age}
                {athlete.dob ? (
                  <span className="cloud-text-dim ml-2">
                    (DOB {normalizeDateForInput(athlete.dob) || athlete.dob})
                  </span>
                ) : null}
              </span>
            ) : null
          )}
          {row("Sex", sexLabel)}
          {row(
            "Weight class",
            athlete.weight_class ? (
              <span>
                {sexLabel ? (
                  <span className="cloud-text-dim">{sexLabel} </span>
                ) : null}
                {athlete.weight_class}
              </span>
            ) : null
          )}
          {row("Division", athlete.division)}
          {row(
            "Email",
            athlete.email ? (
              <a href={`mailto:${athlete.email}`} className="text-orange-500 hover:text-orange-400 underline">
                {athlete.email}
              </a>
            ) : null
          )}
          {row(
            "Phone",
            athlete.phone ? (
              <a href={`tel:${athlete.phone}`} className="text-orange-500 hover:text-orange-400 underline">
                {athlete.phone}
              </a>
            ) : null
          )}
          {row(
            "Goal",
            athlete.goal ? (
              <span className="whitespace-pre-wrap">{athlete.goal}</span>
            ) : null
          )}
          {row(
            "Availability",
            athlete.out_from || athlete.out_through ? (
              <span>
                {athlete.out_from || "?"} &rarr; {athlete.out_through || "?"}
                {athlete.availability_status ? (
                  <span className="cloud-text-dim ml-2">
                    ({athlete.availability_status})
                  </span>
                ) : null}
              </span>
            ) : null
          )}
          {row(
            "Next meet",
            athlete.next_meet_id && athlete.next_meet_name ? (
              <button
                onClick={() => {
                  onOpenMeet(athlete.next_meet_id as number);
                  onOpenChange(false);
                }}
                className="text-orange-500 hover:text-orange-400 underline"
              >
                {athlete.next_meet_name}
                {athlete.meet_date ? (
                  <span className="cloud-text-dim ml-2">
                    · {athlete.meet_date}
                  </span>
                ) : null}
              </button>
            ) : null
          )}
        </div>

        <DialogFooter className="!mt-2 !-mx-4 !-mb-4 !p-4 !border-t !bg-transparent" style={{ borderColor: "var(--cloud-border)" }}>
          <button
            type="button"
            className="cloud-btn cloud-btn-ghost"
            onClick={() => onOpenChange(false)}
          >
            Close
          </button>
          <button
            type="button"
            className="cloud-btn cloud-btn-primary"
            onClick={() => {
              onOpenChange(false);
              onEditProfile();
            }}
          >
            Edit profile
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function UpdateMaxesDialog({
  open,
  onOpenChange,
  athlete,
  unit,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  athlete: Types.AthleteResponse;
  unit: WeightUnit;
  onSaved: () => void;
}) {
  type MaxField = "squat_max_lbs" | "bench_max_lbs" | "deadlift_max_lbs" | "total_lbs";
  const [draft, setDraft] = useState<Record<MaxField, string>>({
    squat_max_lbs: "",
    bench_max_lbs: "",
    deadlift_max_lbs: "",
    total_lbs: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    
    
    const toDisplay = (lbs: number | null | undefined): string => {
      if (lbs == null) return "";
      if (unit === "kg") {
        return String(Math.round(convertWeight(lbs, "kg") * 10) / 10);
      }
      return String(lbs);
    };
    setDraft({
      squat_max_lbs: toDisplay(athlete.squat_max_lbs),
      bench_max_lbs: toDisplay(athlete.bench_max_lbs),
      deadlift_max_lbs: toDisplay(athlete.deadlift_max_lbs),
      total_lbs: toDisplay(athlete.total_lbs),
    });
    setError(null);
  }, [open, athlete, unit]);

  const parseField = (raw: string): number | null | undefined => {
    const trimmed = raw.trim();
    if (trimmed === "") return null; 
    const parsed = parseFloat(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return undefined; 
    return unit === "kg" ? Math.round(parsed * 2.20462 * 10) / 10 : parsed;
  };

  const handleSave = async () => {
    setError(null);
    const payload: Partial<Types.AthleteUpdate> = {};
    const fields: Array<[MaxField, string]> = [
      ["squat_max_lbs", "Squat"],
      ["bench_max_lbs", "Bench"],
      ["deadlift_max_lbs", "Deadlift"],
      ["total_lbs", "Total"],
    ];
    for (const [field, label] of fields) {
      const parsed = parseField(draft[field]);
      if (parsed === undefined) {
        setError(`${label}: enter a positive number or leave blank.`);
        return;
      }
      const currentLbs = athlete[field] ?? null;
      if (parsed === null && currentLbs === null) continue;
      if (parsed !== null && currentLbs !== null && Math.abs(parsed - currentLbs) < 0.05) continue;
      payload[field] = parsed === null ? null : parsed;
    }
    if (Object.keys(payload).length === 0) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      await apiClient.updateAthlete(athlete.id, payload);
      queryClient.invalidateQueries({ queryKey: ["athlete", athlete.id] });
      queryClient.invalidateQueries({ queryKey: ["max-history", athlete.id] });
      queryClient.invalidateQueries({ queryKey: ["estimated-max", athlete.id] });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update maxes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
            Update maxes
          </DialogTitle>
          <DialogDescription className="cloud-text-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
            Manual override for the training maxes shown on the profile.
            Changes are logged to PR History with source &ldquo;manual&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["squat_max_lbs", "Squat"],
              ["bench_max_lbs", "Bench"],
              ["deadlift_max_lbs", "Deadlift"],
              ["total_lbs", "Total"],
            ] as const
          ).map(([field, label]) => (
            <div key={field}>
              <label
                className="cloud-text-dim block"
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontWeight: 500,
                  marginBottom: 6,
                }}
              >
                {label} <span style={{ opacity: 0.6 }}>({unit})</span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={draft[field]}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, [field]: e.target.value }))
                }
                className="cloud-input w-full"
                placeholder="—"
              />
            </div>
          ))}
        </div>

        {error && (
          <div
            className="flex items-start gap-2 rounded-md px-3 py-2"
            style={{
              background: "rgba(220, 38, 38, 0.08)",
              border: "1px solid rgba(220, 38, 38, 0.3)",
              color: "#fca5a5",
              fontSize: 12,
            }}
          >
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter className="!mt-2 !-mx-4 !-mb-4 !p-4 !border-t !bg-transparent" style={{ borderColor: "var(--cloud-border)" }}>
          <button
            type="button"
            className="cloud-btn cloud-btn-ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="cloud-btn cloud-btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save maxes"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function WeightClassSelect({
  sex,
  customRaw,
  value,
  onChange,
  onAddCustom,
}: {
  sex: AthleteSex;
  customRaw: string | null | undefined;
  value: string | null | undefined;
  onChange: (next: string) => void;
  onAddCustom: (value: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const options = combinedWeightClasses(sex, customRaw, value);

  const commitCustom = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setAdding(false);
      return;
    }
    onAddCustom(trimmed);
    setDraft("");
    setAdding(false);
  };

  if (adding) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitCustom();
            } else if (e.key === "Escape") {
              setAdding(false);
              setDraft("");
            }
          }}
          placeholder="e.g. 67.5 KG"
          style={{
            backgroundColor: "rgba(255,255,255,0.03)",
            borderColor: "var(--cloud-border)",
            color: "var(--cloud-text)",
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={commitCustom}
        >
          Add
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setAdding(false);
            setDraft("");
          }}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <select
      value={value || ""}
      onChange={(e) => {
        if (e.target.value === "__add__") {
          setAdding(true);
          return;
        }
        onChange(e.target.value);
      }}
      style={{
        backgroundColor: "rgba(255,255,255,0.03)",
        borderColor: "var(--cloud-border)",
        color: "var(--cloud-text)",
      }}
      className="border rounded px-3 py-2 text-sm w-full cursor-pointer"
    >
      <option value="">Select weight class</option>
      {options.map((wc) => (
        <option key={wc} value={wc}>
          {wc}
        </option>
      ))}
      <option value="__add__">+ Add custom…</option>
    </select>
  );
}


function EstimatedMaxBadge({
  est,
  unit,
  onJump,
}: {
  est: Types.EstimatedMaxForLift | undefined;
  unit: WeightUnit;
  onJump: (hit: HighlightedExercise) => void;
}) {
  if (!est || est.estimated == null) return null;
  
  
  const deltaLbs =
    est.declared != null ? est.estimated - est.declared : null;
  const deltaDisplay =
    deltaLbs != null ? Math.round(convertWeight(deltaLbs, unit)) : null;

  const setSummary =
    est.weight_lbs != null && est.reps != null
      ? `${formatWeight(est.weight_lbs, unit, { unitless: true })}×${est.reps}${est.actual_rpe != null ? ` @ RPE ${est.actual_rpe}` : ""
      }`
      : null;
  const programSummary =
    est.program_number != null && est.week_number != null && est.day_number != null
      ? `P${est.program_number} W${est.week_number}D${est.day_number}`
      : null;

  const canJump =
    est.exercise_name != null &&
    est.weight_lbs != null &&
    est.reps != null &&
    est.program_number != null &&
    est.week_number != null &&
    est.day_number != null;

  const handleClick = () => {
    if (!canJump) return;
    onJump({
      exercise_name: est.exercise_name as string,
      program_number: est.program_number as number,
      week_number: est.week_number as number,
      day_number: est.day_number as number,
      reps: est.reps as number,
      weight_lbs: est.weight_lbs as number,
      lift_category: est.lift,
    });
  };

  const title =
    setSummary && programSummary
      ? `Best e1RM from ${setSummary} ${unit} — ${est.exercise_name ?? ""} (${programSummary})${deltaDisplay != null && deltaDisplay > 0
        ? `. ${deltaDisplay} ${unit} above declared max.`
        : ""
      }`
      : undefined;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!canJump}
      title={title}
      className="w-full text-left mt-2 pt-2 border-t border-[color:var(--cloud-border)] group disabled:cursor-default"
    >
      <div className="flex items-baseline gap-1">
        <span className={`text-sm font-medium ${est.exceeds_declared ? "text-amber-500" : "cloud-text-dim"
          }`}>
          est. {formatWeight(est.estimated, unit)}
        </span>
        {est.exceeds_declared && deltaDisplay != null && deltaDisplay > 0 && (
          <span className="text-[11px] text-amber-500 font-semibold">
            +{deltaDisplay}
          </span>
        )}
      </div>
      {(setSummary || programSummary) && (
        <div className="text-[11px] cloud-text-dim truncate group-hover:cloud-text-muted">
          {setSummary}
          {setSummary && programSummary ? " · " : ""}
          {programSummary}
        </div>
      )}
      {est.exceeds_declared && (
        <div className="text-[11px] text-amber-500/80 mt-0.5">
          Consider bumping training max
        </div>
      )}
    </button>
  );
}


function CompTotalLine({
  byLift,
  unit,
}: {
  byLift: Record<string, Types.CompetitionMaxForLift>;
  unit: WeightUnit;
}) {
  const squat = byLift.squat?.weight_lbs ?? null;
  const bench = byLift.bench?.weight_lbs ?? null;
  const deadlift = byLift.deadlift?.weight_lbs ?? null;
  if (squat == null || bench == null || deadlift == null) {
    return (
      <div className="mt-2 pt-2 border-t border-[color:var(--cloud-border)] text-[11px] cloud-text-dim">
        Comp: <span className="italic">log all three lifts</span>
      </div>
    );
  }
  const total = squat + bench + deadlift;
  
  
  const meetKey = (c: Types.CompetitionMaxForLift) =>
    c.meet_id != null ? `id:${c.meet_id}` : `nd:${c.meet_name ?? ""}|${c.meet_date ?? ""}`;
  const sameMeet =
    meetKey(byLift.squat) === meetKey(byLift.bench) &&
    meetKey(byLift.bench) === meetKey(byLift.deadlift);
  const source = sameMeet ? byLift.squat : null;
  const meetLabel = source
    ? source.meet_name
      ? `${source.meet_name}${source.meet_date ? ` · ${source.meet_date}` : ""}`
      : source.meet_date ?? "—"
    : "Best across meets";
  return (
    <div
      className="mt-2 pt-2 border-t border-[color:var(--cloud-border)]"
      title={
        source && source.federation
          ? `${meetLabel} (${source.federation})`
          : meetLabel
      }
    >
      <div className="text-sm font-medium cloud-text-muted">
        Comp: <span className="cloud-text">{formatWeight(total, unit)}</span>
      </div>
      <div className="text-[11px] cloud-text-dim truncate">{meetLabel}</div>
    </div>
  );
}

function CompMaxLine({
  cm,
  unit,
}: {
  cm: Types.CompetitionMaxForLift | undefined;
  unit: WeightUnit;
}) {
  if (!cm) return null;
  if (cm.weight_lbs == null) {
    return (
      <div className="mt-2 pt-2 border-t border-[color:var(--cloud-border)] text-[11px] cloud-text-dim">
        Comp: <span className="italic">no results</span>
      </div>
    );
  }
  const meetLabel = cm.meet_name
    ? `${cm.meet_name}${cm.meet_date ? ` · ${cm.meet_date}` : ""}`
    : cm.meet_date ?? "—";
  return (
    <div
      className="mt-2 pt-2 border-t border-[color:var(--cloud-border)]"
      title={cm.federation ? `${meetLabel} (${cm.federation})` : meetLabel}
    >
      <div className="text-sm font-medium cloud-text-muted">
        Comp: <span className="cloud-text">{formatWeight(cm.weight_lbs, unit)}</span>
      </div>
      <div className="text-[11px] cloud-text-dim truncate">{meetLabel}</div>
    </div>
  );
}


function NewPRsBanner({
  athleteId,
  unit,
  currentProgramId,
  currentProgramStart,
  currentProgramEnd,
  athleteName,
}: {
  athleteId: number;
  unit: WeightUnit;
  currentProgramId: number | null;
  currentProgramStart: string | null;
  currentProgramEnd: string | null;
  athleteName?: string | null;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [selectedPR, setSelectedPR] = useState<Types.MaxHistoryEntry | null>(null);
  const { data: programs } = useQuery({
    queryKey: ["programs", athleteId],
    queryFn: () => apiClient.listPrograms(athleteId),
    enabled: !!currentProgramId && !dismissed,
  });
  const storageKey = currentProgramId
    ? `bestrong.prs.dismissed.${athleteId}.${currentProgramId}`
    : null;

  useEffect(() => {
    if (!storageKey) return;
    try {
      /* eslint-disable react-hooks/set-state-in-effect */
      setDismissed(window.localStorage.getItem(storageKey) === "1");
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      setDismissed(false);
    }
  }, [storageKey]);

  const { data: history = [] } = useQuery({
    queryKey: ["max-history", athleteId],
    queryFn: () => apiClient.getMaxHistory(athleteId),
    enabled: !!currentProgramId && !dismissed,
  });

  const blockPRsResult = useMemo(() => {
    const empty = {
      rows: [] as typeof history,
      newLanes: 0,
      newLiftsList: [] as Array<{ lift: string; exercise: string; reps: number[] }>,
    };
    if (!currentProgramStart) return empty;
    const start = (() => {
      const s = currentProgramStart.trim();
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00") : null;
      if (iso && !Number.isNaN(iso.getTime())) return iso;
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
      if (!m) return null;
      let y = m[3];
      if (y.length === 2) y = (parseInt(y, 10) >= 50 ? "19" : "20") + y;
      const d = new Date(`${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}T00:00:00`);
      return Number.isNaN(d.getTime()) ? null : d;
    })();
    if (!start) return empty;
    const end = (() => {
      if (!currentProgramEnd) return new Date(start.getTime() + 60 * 86400_000);
      const s = currentProgramEnd.trim();
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00") : null;
      if (iso && !Number.isNaN(iso.getTime())) return iso;
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
      if (!m) return new Date(start.getTime() + 60 * 86400_000);
      let y = m[3];
      if (y.length === 2) y = (parseInt(y, 10) >= 50 ? "19" : "20") + y;
      const d = new Date(`${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}T00:00:00`);
      return Number.isNaN(d.getTime()) ? new Date(start.getTime() + 60 * 86400_000) : d;
    })();
    const startMs = start.getTime() - 86400_000;
    const endMs = end.getTime() + 86400_000;

    
    
    
    
    
    const earliestByLane = new Map<string, number>();
    for (const h of history) {
      if (h.lift.toLowerCase() === "accessory") continue;
      if (h.lift.toLowerCase() === "total") continue;
      if (h.reps == null || h.exercise_name == null) continue;
      const key = `${h.lift}|${h.exercise_name}|${h.reps}`;
      const t = new Date(h.recorded_at).getTime();
      const cur = earliestByLane.get(key);
      if (cur == null || t < cur) earliestByLane.set(key, t);
    }
    const newLaneKeys = new Set<string>();
    for (const [key, earliest] of earliestByLane.entries()) {
      if (earliest >= startMs) newLaneKeys.add(key);
    }

    const inRange = history.filter((h) => {
      if (h.lift.toLowerCase() === "accessory") return false;
      const isTotal = h.lift.toLowerCase() === "total";
      
      
      
      if (!isTotal && (h.reps == null || h.exercise_name == null)) return false;
      
      
      
      
      if (h.old_value == null) return false;
      if (h.new_value <= h.old_value) return false;
      
      if (!isTotal) {
        const key = `${h.lift}|${h.exercise_name}|${h.reps}`;
        if (newLaneKeys.has(key)) return false;
      }
      const t = new Date(h.recorded_at).getTime();
      return t >= startMs && t <= endMs;
    });
    
    
    const best = new Map<string, typeof inRange[number]>();
    for (const h of inRange) {
      const key = h.lift === "total"
        ? "total"
        : `${h.lift}|${h.exercise_name}|${h.reps}`;
      const existing = best.get(key);
      if (!existing || h.new_value > existing.new_value) best.set(key, h);
    }
    const rows = Array.from(best.values()).sort(
      (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
    );

    
    
    
    const newLiftsMap = new Map<string, { lift: string; exercise: string; reps: number[] }>();
    for (const key of newLaneKeys) {
      const parts = key.split("|");
      if (parts.length < 3) continue;
      const [lift, exercise, repsStr] = parts;
      const reps = parseInt(repsStr, 10);
      if (Number.isNaN(reps)) continue;
      const eKey = `${lift}|${exercise}`;
      const existing = newLiftsMap.get(eKey);
      if (existing) {
        existing.reps.push(reps);
      } else {
        newLiftsMap.set(eKey, { lift, exercise, reps: [reps] });
      }
    }
    const newLiftsList = Array.from(newLiftsMap.values()).map((item) => ({
      ...item,
      reps: item.reps.slice().sort((a, b) => a - b),
    }));
    return { rows, newLanes: newLiftsList.length, newLiftsList };
  }, [history, currentProgramStart, currentProgramEnd]);

  const blockPRs = blockPRsResult.rows;
  const newLifts = blockPRsResult.newLanes;
  const newLiftsList = blockPRsResult.newLiftsList;
  const [showNewLifts, setShowNewLifts] = useState(false);

  if (dismissed || !currentProgramId) return null;
  
  if (blockPRs.length === 0 && newLifts === 0) return null;

  const shown = blockPRs.slice(0, 5);
  const extra = blockPRs.length - shown.length;

  return (
    <>
    <div
      className="mb-6 p-4 rounded-md border flex items-start gap-3"
      style={{
        background: "rgba(251, 191, 36, 0.1)",
        borderColor: "rgba(251, 191, 36, 0.35)",
      }}
    >
      <Trophy className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#fcd34d" }} />
      <div className="flex-1 min-w-0">
        <div className="cloud-text font-semibold" style={{ fontSize: 13 }}>
          {blockPRs.length === 0 ? (
            <button
              type="button"
              onClick={() => setShowNewLifts((v) => !v)}
              title="Click to see which exercises debuted this block."
              className="font-semibold underline decoration-dotted underline-offset-2 transition-colors"
              style={{ color: "#fcd34d" }}
            >
              {showNewLifts ? "− " : "+ "}{newLifts} new lift{newLifts === 1 ? "" : "s"} established this block
            </button>
          ) : (
            `${blockPRs.length} new PR${blockPRs.length === 1 ? "" : "s"} this block`
          )}
        </div>
        <div className="mt-1.5 space-y-0.5">
          {shown.map((pr) => {
            const repLabel = pr.reps != null ? `${pr.reps}RM` : pr.lift === "total" ? "Total" : "";
            const name = pr.exercise_name ?? pr.lift.charAt(0).toUpperCase() + pr.lift.slice(1);
            const weight = formatWeight(pr.new_value, unit, { decimals: 0 });
            const deltaLbs = pr.old_value != null ? pr.new_value - pr.old_value : null;
            const delta =
              deltaLbs != null
                ? ` (+${Math.round(convertWeight(deltaLbs, unit))} ${unit})`
                : "";
            return (
              <button
                key={pr.id}
                type="button"
                onClick={() => setSelectedPR(pr)}
                title="See full progression"
                className="cloud-text-muted block text-left w-full rounded px-1 -mx-1 py-0.5 transition-colors hover:bg-[rgba(251,191,36,0.1)]"
                style={{ fontSize: 12 }}
              >
                <span className="cloud-text font-medium">{name}</span>
                {repLabel && <span className="ml-1.5" style={{ color: "#fcd34d" }}>· {repLabel}</span>}
                <span className="ml-1.5">
                  {weight}
                  {pr.reps != null && pr.reps > 1 ? ` × ${pr.reps}` : ""}
                </span>
                {delta && <span className="ml-1" style={{ color: "#86efac", fontSize: 11 }}>{delta}</span>}
              </button>
            );
          })}
          {extra > 0 && (
            <div className="cloud-text-dim" style={{ fontSize: 11 }}>
              + {extra} more — see PR History below
            </div>
          )}
          {newLifts > 0 && blockPRs.length > 0 && (
            <button
              type="button"
              onClick={() => setShowNewLifts((v) => !v)}
              title="Click to see which exercises debuted this block."
              className="cloud-text-dim italic mt-1 underline decoration-dotted underline-offset-2 transition-colors text-left block hover:text-[#fcd34d]"
              style={{ fontSize: 11 }}
            >
              {showNewLifts ? "− " : "+ "}{newLifts} new lift{newLifts === 1 ? "" : "s"} established this block
            </button>
          )}
          {showNewLifts && newLifts > 0 && (
            <ul className="mt-1.5 ml-3 space-y-0.5 list-none">
              {newLiftsList.map((item) => {
                const liftTint: Record<string, string> = {
                  squat: "#fb923c",
                  bench: "#22d3ee",
                  deadlift: "#a78bfa",
                };
                return (
                  <li
                    key={`${item.lift}|${item.exercise}`}
                    className="cloud-text-muted flex items-center gap-1.5 flex-wrap"
                    style={{ fontSize: 11 }}
                  >
                    <span
                      className="font-semibold capitalize"
                      style={{ color: liftTint[item.lift] ?? "var(--cloud-text-dim)" }}
                    >
                      {item.lift}
                    </span>
                    <span className="cloud-text">{item.exercise}</span>
                    <span className="cloud-text-dim">
                      ({item.reps.map((r) => `${r}RM`).join(", ")})
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <button
        onClick={() => {
          if (!storageKey) return;
          try {
            window.localStorage.setItem(storageKey, "1");
          } catch {}
          setDismissed(true);
        }}
        className="shrink-0 font-medium transition-colors hover:text-[#fef3c7]"
        style={{ color: "#fcd34d", fontSize: 11 }}
        title="Dismiss"
      >
        Dismiss
      </button>
    </div>
    <PRDetailModal
      open={!!selectedPR}
      onClose={() => setSelectedPR(null)}
      pr={selectedPR}
      allHistory={history}
      athleteName={athleteName ?? null}
      unit={unit}
      programIndex={programs?.map((p) => ({
        id: p.id,
        program_number: p.program_number ?? null,
        program_name: p.program_name ?? null,
      }))}
      programSheetUrls={
        programs
          ? Object.fromEntries(programs.map((p) => [p.id, p.google_sheet_url ?? null]))
          : undefined
      }
    />
    </>
  );
}

// OPL link dialog — single entry point for the OpenPowerlifting integration.
// Coaches open it from the three-dot menu. Renders the search-and-pick flow
// when no profile is linked, or the linked-state metadata + refresh/unlink
// actions when one is. The actual meets land in meet_results on the server,
// so on success this dialog only invalidates the meet-results query for the
// athlete and the linked component reflects the new rows automatically.
function OplLinkDialog({
  open,
  onOpenChange,
  athleteId,
  athleteName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  athleteId: number;
  athleteName: string | null | undefined;
}) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchSubmitted, setSearchSubmitted] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const statusQuery = useQuery<Types.OplStatusResponse>({
    queryKey: ["opl", "status", athleteId],
    queryFn: () => apiClient.getOpenPowerliftingStatus(athleteId),
    enabled: open,
  });

  // Prefill the search field with the athlete's name when the dialog opens
  // for an unlinked athlete, and auto-submit so the candidate list shows up
  // without an extra click.
  const linkedSlug = statusQuery.data?.linked === true ? statusQuery.data.link?.slug : null;
  useEffect(() => {
    if (!open) return;
    if (linkedSlug) return;
    const seed = (athleteName ?? "").trim();
    if (!seed) return;
    setSearchTerm((prev) => (prev ? prev : seed));
    setSearchSubmitted((prev) => (prev ? prev : seed));
  }, [open, linkedSlug, athleteName]);

  const searchQuery = useQuery({
    queryKey: ["opl", "search", searchSubmitted],
    queryFn: () => apiClient.searchOpenPowerlifting(searchSubmitted),
    enabled: open && searchSubmitted.length >= 2,
  });

  const invalidateAthlete = () => {
    queryClient.invalidateQueries({ queryKey: ["opl", "status", athleteId] });
    queryClient.invalidateQueries({ queryKey: ["meet-results", athleteId] });
    queryClient.invalidateQueries({ queryKey: ["competition-maxes", athleteId] });
    queryClient.invalidateQueries({ queryKey: ["athlete", athleteId] });
  };

  const linkMutation = useMutation({
    mutationFn: ({ slug, displayName }: { slug: string; displayName?: string }) =>
      apiClient.linkOpenPowerlifting(athleteId, slug, displayName),
    onSuccess: () => {
      setActionError(null);
      invalidateAthlete();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to link profile.";
      setActionError(msg);
    },
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiClient.refreshOpenPowerlifting(athleteId),
    onSuccess: () => {
      setActionError(null);
      invalidateAthlete();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to refresh.";
      setActionError(msg);
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: () => apiClient.unlinkOpenPowerlifting(athleteId),
    onSuccess: () => {
      setActionError(null);
      setSearchTerm("");
      setSearchSubmitted("");
      invalidateAthlete();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to unlink.";
      setActionError(msg);
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setSearchSubmitted(searchTerm.trim());
  };

  const handlePick = (c: Types.OplCandidate) => {
    setActionError(null);
    linkMutation.mutate({ slug: c.slug, displayName: c.name });
  };

  const handleUnlink = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Remove the OpenPowerlifting link and clear imported meet rows?"
      )
    ) {
      return;
    }
    setActionError(null);
    unlinkMutation.mutate();
  };

  const status = statusQuery.data;
  const linked = status?.linked === true && status.link;
  const link = status?.link;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] max-w-lg">
        <DialogHeader>
          <DialogTitle style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
            OpenPowerlifting profile
          </DialogTitle>
          <DialogDescription className="cloud-text-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
            {linked
              ? "Linked. Refreshing pulls the latest meet history; unlinking removes the imported rows from this athlete's meet history."
              : "Search OpenPowerlifting by name, then pick the right lifter. Their meet history will appear under Meet History on this profile."}
          </DialogDescription>
        </DialogHeader>

        {actionError && (
          <div
            className="cloud-panel"
            style={{
              padding: 10,
              borderColor: "rgba(248, 113, 113, 0.3)",
              color: "#fca5a5",
              fontSize: 12,
            }}
          >
            {actionError}
          </div>
        )}

        {statusQuery.isLoading ? (
          <p className="cloud-text-muted" style={{ fontSize: 13 }}>Loading…</p>
        ) : linked && link ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="cloud-panel" style={{ padding: 14 }}>
              <div className="cloud-text" style={{ fontSize: 14, fontWeight: 600 }}>
                {link.display_name || athleteName || link.slug}
              </div>
              <a
                href={link.profile_url}
                target="_blank"
                rel="noopener noreferrer"
                className="cloud-text-muted"
                style={{
                  fontSize: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 4,
                }}
              >
                openpowerlifting.org/u/{link.slug}
                <ExternalLink style={{ width: 12, height: 12 }} />
              </a>
              <div className="cloud-text-dim" style={{ fontSize: 11, marginTop: 6 }}>
                Last synced:{" "}
                {link.last_synced_at
                  ? new Date(link.last_synced_at).toLocaleString()
                  : "Never"}
                {link.last_sync_error && (
                  <span style={{ color: "#f87171" }}> · {link.last_sync_error}</span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="cloud-btn cloud-btn-ghost"
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending || unlinkMutation.isPending}
              >
                <RefreshCw style={{ width: 14, height: 14, marginRight: 6 }} />
                {refreshMutation.isPending ? "Refreshing…" : "Refresh now"}
              </button>
              <button
                type="button"
                className="cloud-btn cloud-btn-ghost"
                onClick={handleUnlink}
                disabled={refreshMutation.isPending || unlinkMutation.isPending}
              >
                <X style={{ width: 14, height: 14, marginRight: 6 }} />
                {unlinkMutation.isPending ? "Unlinking…" : "Unlink"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <form
              onSubmit={handleSearch}
              style={{ display: "flex", gap: 8, alignItems: "center" }}
            >
              <input
                type="text"
                placeholder="e.g. Brandon Lilly"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="cloud-input"
                style={{ flex: 1 }}
              />
              <button
                type="submit"
                className="cloud-btn cloud-btn-primary"
                disabled={searchTerm.trim().length < 2 || linkMutation.isPending}
              >
                <Search style={{ width: 14, height: 14, marginRight: 6 }} />
                Search
              </button>
            </form>

            {searchQuery.isFetching && (
              <p className="cloud-text-muted" style={{ fontSize: 12 }}>Searching…</p>
            )}

            {searchQuery.data && !searchQuery.isFetching && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
                {searchQuery.data.candidates.length === 0 ? (
                  <p className="cloud-text-muted" style={{ fontSize: 12 }}>
                    No lifters matched &ldquo;{searchSubmitted}&rdquo;.
                  </p>
                ) : (
                  searchQuery.data.candidates.map((c) => {
                    const meta = [
                      c.federation,
                      c.state || c.country,
                      c.equipment,
                      c.weight_class_lbs ? `${c.weight_class_lbs} lbs` : null,
                      c.last_meet_date ? `last: ${c.last_meet_date}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <div
                        key={c.slug}
                        className="cloud-panel"
                        style={{
                          padding: 10,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div className="cloud-text" style={{ fontWeight: 600, fontSize: 13 }}>
                            {c.name}
                          </div>
                          <div
                            className="cloud-text-muted"
                            style={{
                              fontSize: 11,
                              marginTop: 2,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {meta || c.slug}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          {c.best_total_lbs != null && (
                            <span
                              className="cloud-text-muted"
                              style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
                            >
                              {Math.round(c.best_total_lbs)} lbs
                            </span>
                          )}
                          <button
                            type="button"
                            className="cloud-btn cloud-btn-primary"
                            style={{ padding: "4px 10px", fontSize: 12 }}
                            disabled={linkMutation.isPending}
                            onClick={() => handlePick(c)}
                          >
                            {linkMutation.isPending ? "Linking…" : "Link"}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            className="cloud-btn cloud-btn-ghost"
            onClick={() => onOpenChange(false)}
          >
            Close
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function ProgramSection({
  program,
  athleteId,
  unit,
  onHighlightExercise,
}: {
  program: Types.ProgramListResponse;
  athleteId: number;
  unit: WeightUnit;
  onHighlightExercise: (ex: HighlightedExercise) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [expandedSessions, setExpandedSessions] = useState<Set<number>>(
    new Set()
  );
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const { data: sessions = [] } = useQuery({
    queryKey: ["program-sessions", athleteId, program.id],
    queryFn: () => apiClient.listProgramSessions(athleteId, program.id),
    enabled: expanded,
  });

  
  const sessionsByWeek = useMemo(() => {
    const map = new Map<number, typeof sessions>();
    for (const s of sessions) {
      const w = s.week_number;
      if (!map.has(w)) map.set(w, []);
      map.get(w)!.push(s);
    }
    
    for (const [, list] of map) {
      list.sort((a, b) => a.day_number - b.day_number);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [sessions]);

  const toggleWeek = (weekNum: number) => {
    const newSet = new Set(expandedWeeks);
    if (newSet.has(weekNum)) {
      newSet.delete(weekNum);
    } else {
      newSet.add(weekNum);
    }
    setExpandedWeeks(newSet);
  };

  const updatePrimaryDaysMutation = useMutation({
    mutationFn: (data: {
      primary_squat_day: number | null;
      primary_bench_day: number | null;
      primary_deadlift_day: number | null;
    }) => apiClient.updateProgramPrimaryDays(program.id, data),
    onSuccess: () => {
      
      
      
      
      queryClient.invalidateQueries({ queryKey: ["athlete-programs", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["program-sessions", athleteId, program.id] });
    },
  });

  const toggleSession = (sessionId: number) => {
    const newSet = new Set(expandedSessions);
    if (newSet.has(sessionId)) {
      newSet.delete(sessionId);
    } else {
      newSet.add(sessionId);
    }
    setExpandedSessions(newSet);
  };

  
  const uniqueDays = Array.from(
    new Set(sessions.map((s) => s.day_number))
  ).sort((a, b) => a - b);

  
  const handlePrimaryDayToggle = (lift: "squat" | "bench" | "deadlift", dayNumber: number) => {
    const fieldName =
      lift === "squat"
        ? "primary_squat_day"
        : lift === "bench"
        ? "primary_bench_day"
        : "primary_deadlift_day";

    const currentValue = program[fieldName as keyof Types.ProgramListResponse] as number | null | undefined;
    const newValue = currentValue === dayNumber ? null : dayNumber;

    const updateData = {
      primary_squat_day: program.primary_squat_day || null,
      primary_bench_day: program.primary_bench_day || null,
      primary_deadlift_day: program.primary_deadlift_day || null,
    };

    updateData[fieldName as keyof typeof updateData] = newValue;
    updatePrimaryDaysMutation.mutate(updateData);
  };

  return (
    <div
      style={{
        border: "1px solid var(--cloud-border)",
        borderRadius: "var(--cloud-r-md)",
        background: "rgba(255,255,255,0.02)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between transition-colors hover:bg-white/[0.02]"
        style={{ padding: "var(--cloud-s3) var(--cloud-s4)" }}
      >
        <div className="flex-1 text-left">
          <div className="cloud-text font-medium" style={{ fontSize: 14 }}>
            {program.program_name || `Program #${program.program_number}`}
          </div>
          <div className="cloud-text-muted" style={{ fontSize: 12, marginTop: 2 }}>
            {formatDate(program.date_start)} to {formatDate(program.date_end)} •{" "}
            {program.session_count || 0} sessions
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 cloud-text-muted" />
        ) : (
          <ChevronRight className="w-4 h-4 cloud-text-muted" />
        )}
      </button>

      {expanded && (
        <div
          className="space-y-3"
          style={{
            borderTop: "1px solid var(--cloud-border)",
            padding: "var(--cloud-s3) var(--cloud-s4)",
            background: "rgba(0,0,0,0.2)",
          }}
        >
          {}
          {uniqueDays.length > 0 && (
            <div
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--cloud-border)",
                borderRadius: "var(--cloud-r-md)",
                padding: "var(--cloud-s3)",
              }}
            >
              <div
                className="cloud-text-dim"
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontWeight: 500,
                  marginBottom: 8,
                }}
              >
                Primary Days
              </div>
              <div className="space-y-2">
                {(["squat", "bench", "deadlift"] as const).map((lift) => (
                  <div key={lift} className="flex items-center gap-2">
                    <span className="cloud-text-muted capitalize" style={{ fontSize: 11, minWidth: 48 }}>{lift}:</span>
                    <div className="flex gap-1 flex-wrap">
                      {uniqueDays.map((dayNum) => {
                        const fieldName =
                          lift === "squat"
                            ? "primary_squat_day"
                            : lift === "bench"
                            ? "primary_bench_day"
                            : "primary_deadlift_day";
                        const isActive = program[fieldName as keyof Types.ProgramListResponse] === dayNum;
                        const activeClass = {
                          squat: "bg-orange-500 text-white",
                          bench: "bg-cyan-400 text-gray-900",
                          deadlift: "bg-violet-500 text-white",
                        }[lift];

                        return (
                          <button
                            key={dayNum}
                            onClick={() => handlePrimaryDayToggle(lift, dayNum)}
                            disabled={updatePrimaryDaysMutation.isPending}
                            className={`rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                              isActive ? activeClass : "cloud-text-muted hover:bg-white/[0.04]"
                            }`}
                            style={{
                              padding: "3px 8px",
                              ...(isActive
                                ? {}
                                : {
                                    background: "rgba(255,255,255,0.03)",
                                    border: "1px solid var(--cloud-border)",
                                  }),
                            }}
                          >
                            Day {dayNum}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {}
          {sessionsByWeek.length === 0 ? (
            <div className="cloud-text-muted italic" style={{ fontSize: 12 }}>No sessions</div>
          ) : (
            <div className="space-y-2">
              {sessionsByWeek.map(([weekNum, weekSessions]) => {
                const isWeekExpanded = expandedWeeks.has(weekNum);
                return (
                  <div
                    key={weekNum}
                    style={{
                      border: "1px solid var(--cloud-border)",
                      borderRadius: "var(--cloud-r-md)",
                      background: "rgba(255,255,255,0.02)",
                      overflow: "hidden",
                    }}
                  >
                    <button
                      onClick={() => toggleWeek(weekNum)}
                      className="w-full flex items-center justify-between transition-colors hover:bg-white/[0.02]"
                      style={{ padding: "var(--cloud-s2) var(--cloud-s3)" }}
                    >
                      <div className="flex-1 text-left">
                        <div className="cloud-text font-medium" style={{ fontSize: 13 }}>Week {weekNum}</div>
                        <div className="cloud-text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                          {weekSessions.length} day{weekSessions.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                      {isWeekExpanded ? (
                        <ChevronDown className="w-4 h-4 cloud-text-muted" />
                      ) : (
                        <ChevronRight className="w-4 h-4 cloud-text-muted" />
                      )}
                    </button>
                    {isWeekExpanded && (
                      <div
                        className="space-y-2"
                        style={{
                          borderTop: "1px solid var(--cloud-border)",
                          padding: "var(--cloud-s3)",
                          background: "rgba(0,0,0,0.15)",
                        }}
                      >
                        {weekSessions.map((session) => (
                          <SessionSection
                            key={session.id}
                            session={session}
                            athleteId={athleteId}
                            programId={program.id}
                            programNumber={program.program_number ?? 0}
                            unit={unit}
                            isExpanded={expandedSessions.has(session.id)}
                            onToggle={() => toggleSession(session.id)}
                            onHighlightExercise={onHighlightExercise}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function SessionSection({
  session,
  athleteId,
  programId,
  programNumber,
  unit,
  isExpanded,
  onToggle,
  onHighlightExercise,
}: {
  session: Types.SessionResponse;
  athleteId: number;
  programId: number;
  programNumber: number;
  unit: WeightUnit;
  isExpanded: boolean;
  onToggle: () => void;
  onHighlightExercise: (ex: HighlightedExercise) => void;
}) {
  const { data: exercises = [] } = useQuery({
    queryKey: ["session-exercises", athleteId, programId, session.id],
    queryFn: () => apiClient.getSessionExercises(athleteId, programId, session.id),
    enabled: isExpanded,
  });

  
  const ratingColors: Record<string, string> = {
    nutrition_rating: "bg-blue-400/10 border-blue-400/30 text-blue-300",
    stress_rating: "bg-red-400/10 border-red-400/30 text-red-300",
    sleep_rating: "bg-indigo-400/10 border-indigo-400/30 text-indigo-300",
    fatigue_rating: "bg-amber-400/10 border-amber-400/30 text-amber-300",
  };

  const ratingLabels: Record<string, string> = {
    nutrition_rating: "Nutrition",
    stress_rating: "Stress",
    sleep_rating: "Sleep",
    fatigue_rating: "Fatigue",
  };

  const ratings = [
    {
      key: "nutrition_rating",
      value: session.nutrition_rating,
    },
    {
      key: "stress_rating",
      value: session.stress_rating,
    },
    {
      key: "sleep_rating",
      value: session.sleep_rating,
    },
    {
      key: "fatigue_rating",
      value: session.fatigue_rating,
    },
  ].filter((r) => r.value);

  return (
    <div
      style={{
        border: "1px solid var(--cloud-border)",
        borderRadius: "var(--cloud-r-md)",
        background: "rgba(255,255,255,0.02)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between transition-colors hover:bg-white/[0.02]"
        style={{ padding: "var(--cloud-s2) var(--cloud-s3)" }}
      >
        <div className="flex-1 text-left">
          <div className="cloud-text font-medium" style={{ fontSize: 13 }}>
            Day {session.day_number}: {session.day_name}
          </div>
          <div className="cloud-text-muted" style={{ fontSize: 11, marginTop: 2 }}>
            {session.exercise_count || 0} exercises
          </div>
          {ratings.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {ratings.map((r) => (
                <Badge
                  key={r.key}
                  className={cn("text-xs", ratingColors[r.key])}
                  variant="outline"
                >
                  {ratingLabels[r.key]}: {r.value}
                </Badge>
              ))}
            </div>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 cloud-text-muted" />
        ) : (
          <ChevronRight className="w-4 h-4 cloud-text-muted" />
        )}
      </button>

      {isExpanded && (
        <div
          className="space-y-2"
          style={{
            borderTop: "1px solid var(--cloud-border)",
            padding: "var(--cloud-s3)",
            background: "rgba(0,0,0,0.15)",
          }}
        >
          {exercises.length === 0 ? (
            <div className="cloud-text-muted italic" style={{ fontSize: 11 }}>No exercises</div>
          ) : (
            exercises.map((exercise) => (
              <ExerciseRow
                key={exercise.id}
                exercise={exercise}
                programNumber={programNumber}
                weekNumber={session.week_number}
                dayNumber={session.day_number}
                unit={unit}
                onHighlightExercise={onHighlightExercise}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}


function ExerciseRow({
  exercise,
  programNumber,
  weekNumber,
  dayNumber,
  unit,
  onHighlightExercise,
}: {
  exercise: Types.ExerciseEntryResponse;
  programNumber: number;
  weekNumber: number;
  dayNumber: number;
  unit: WeightUnit;
  onHighlightExercise: (ex: HighlightedExercise) => void;
}) {
  
  const rawRpe = exercise.actual_rpe ?? exercise.target_rpe;
  const rpeDisplay = rawRpe
    ? `RPE ${String(rawRpe).replace(/\s*RPE\s*/gi, "").trim()}`
    : "";

  const weight = exercise.weight_lbs
    ? formatWeight(exercise.weight_lbs, unit)
    : "bodyweight";

  
  
  const mainLift =
    exercise.lift_category &&
    ["squat", "bench", "deadlift"].includes(exercise.lift_category.toLowerCase());
  const canHighlight =
    mainLift &&
    exercise.set_type === "top_set" &&
    exercise.weight_lbs !== null &&
    exercise.weight_lbs !== undefined &&
    exercise.reps !== null &&
    exercise.reps !== undefined;

  const handleClick = () => {
    if (!canHighlight) return;
    onHighlightExercise({
      exercise_name: exercise.exercise_name,
      program_number: programNumber,
      week_number: weekNumber,
      day_number: dayNumber,
      reps: exercise.reps as number,
      weight_lbs: exercise.weight_lbs as number,
      lift_category: (exercise.lift_category || "").toLowerCase(),
    });
  };

  return (
    <div
      onClick={handleClick}
      className={
        canHighlight ? "cursor-pointer hover:ring-1 hover:ring-orange-400/40 transition-all" : ""
      }
      style={{
        fontSize: 12,
        padding: "var(--cloud-s2) var(--cloud-s3)",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid var(--cloud-border)",
        borderRadius: "var(--cloud-r-sm)",
      }}
      title={canHighlight ? "Click to highlight this set on the progression chart" : ""}
    >
      <div className="cloud-text font-medium">{exercise.exercise_name}</div>
      <div className="cloud-text-muted">
        {exercise.sets}x
        {exercise.reps ? exercise.reps : "?"} @ {weight}
        {rpeDisplay && ` / ${rpeDisplay}`}
      </div>
      <div className="cloud-text-dim" style={{ fontSize: 11, marginTop: 2 }}>
        {exercise.set_type} • {exercise.lift_category}
      </div>
      {exercise.notes && (
        <div className="cloud-text-muted italic" style={{ fontSize: 11, marginTop: 4 }}>
          Note: {exercise.notes}
        </div>
      )}
    </div>
  );
}


function PrimaryDayDebugPanel({
  athleteId,
  athlete,
  showDebug,
  setShowDebug,
  primaryOnly,
  e1rmDataCount,
  repFilter,
  chartGranularity,
}: {
  athleteId: number;
  athlete: Types.AthleteResponse;
  showDebug: boolean;
  setShowDebug: (v: boolean) => void;
  primaryOnly: boolean;
  e1rmDataCount: number;
  repFilter: string;
  chartGranularity: "block" | "week";
}) {
  const queryClient = useQueryClient();
  const [resyncSuccess, setResyncSuccess] = useState(false);

  const { data: debugData, isLoading: debugLoading } = useQuery({
    queryKey: ["primary-day-debug", athleteId],
    queryFn: () => apiClient.getPrimaryDayDebug(athleteId),
    enabled: showDebug,
  });

  const [resyncError, setResyncError] = useState<string | null>(null);
  const [resyncAllSuccess, setResyncAllSuccess] = useState<string | null>(null);
  const [resyncAllError, setResyncAllError] = useState<string | null>(null);

  const resyncMutation = useMutation({
    mutationFn: () => apiClient.resyncProgram(debugData!.program!.id),
    onSuccess: () => {
      setResyncSuccess(true);
      setResyncError(null);
      setTimeout(() => setResyncSuccess(false), 3000);
      
      queryClient.invalidateQueries({ queryKey: ["primary-day-debug", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["e1rm"] });
      queryClient.invalidateQueries({ queryKey: ["volume-trends", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["athlete", athleteId] });
    },
    onError: (err: unknown) => {
      setResyncError(extractErrorMessage(err, "Resync failed"));
      setTimeout(() => setResyncError(null), 5000);
    },
  });

  const resyncAllMutation = useMutation({
    mutationFn: () => apiClient.resyncAllPrograms(athleteId),
    onSuccess: (data) => {
      setResyncAllSuccess(`Resynced ${data.resynced} program${data.resynced !== 1 ? "s" : ""}`);
      setResyncAllError(null);
      setTimeout(() => setResyncAllSuccess(null), 3000);
      
      queryClient.invalidateQueries({ queryKey: ["primary-day-debug", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["e1rm"] });
      queryClient.invalidateQueries({ queryKey: ["volume-trends", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["athlete", athleteId] });
    },
    onError: (err: unknown) => {
      setResyncAllError(extractErrorMessage(err, "Resync all failed"));
      setTimeout(() => setResyncAllError(null), 5000);
    },
  });

  const LIFT_COLOR_MAP: Record<string, string> = {
    squat: "text-orange-400",
    bench: "text-cyan-400",
    deadlift: "text-violet-400",
  };

  const LIFT_BG_MAP: Record<string, string> = {
    squat: "bg-orange-500/10 border-orange-500/20",
    bench: "bg-cyan-500/10 border-cyan-500/20",
    deadlift: "bg-violet-500/10 border-violet-500/20",
  };

  return (
    <div className="border border-[color:var(--cloud-border)] rounded-lg overflow-hidden">
      <button
        onClick={() => setShowDebug(!showDebug)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm cloud-text-muted hover:bg-[color:var(--cloud-surface-raised)] transition-colors"
      >
        <Info className="w-4 h-4" />
        <span>Primary Lift Day Configuration</span>
        {showDebug ? (
          <ChevronDown className="w-4 h-4 ml-auto" />
        ) : (
          <ChevronRight className="w-4 h-4 ml-auto" />
        )}
      </button>
      {showDebug && (
        <div className="border-t border-[color:var(--cloud-border)] bg-[color:var(--cloud-surface-raised)] px-4 py-3 space-y-4">
          {}
          <div className="flex items-center gap-6 text-sm flex-wrap">
            <div>
              <span className="cloud-text-dim">Primary Squat:</span>{" "}
              <span className={athlete.primary_squat_day ? "text-orange-400 font-medium" : "cloud-text-dim"}>
                {athlete.primary_squat_day ? `Day ${athlete.primary_squat_day}` : "Not set"}
              </span>
            </div>
            <div>
              <span className="cloud-text-dim">Primary Bench:</span>{" "}
              <span className={athlete.primary_bench_day ? "text-cyan-400 font-medium" : "cloud-text-dim"}>
                {athlete.primary_bench_day ? `Day ${athlete.primary_bench_day}` : "Not set"}
              </span>
            </div>
            <div>
              <span className="cloud-text-dim">Primary Deadlift:</span>{" "}
              <span className={athlete.primary_deadlift_day ? "text-violet-400 font-medium" : "cloud-text-dim"}>
                {athlete.primary_deadlift_day ? `Day ${athlete.primary_deadlift_day}` : "Not set"}
              </span>
            </div>
          </div>
          <div className="text-xs cloud-text-dim">
            {chartGranularity === "block" ? "Per block view" : "Per week view"}: showing heaviest weight per lift
            {primaryOnly ? " from primary days only" : " from all days"}
            {" "}({e1rmDataCount} total data point{e1rmDataCount !== 1 ? "s" : ""}).
            {repFilter !== "all" && ` Rep filter: ${repFilter}.`}
          </div>

          {}
          {debugLoading ? (
            <div className="text-xs cloud-text-dim py-2">Loading exercise data...</div>
          ) : debugData ? (
            <div className="space-y-3">
              {}
              {debugData.program && (
                <>
                  <div className="text-xs cloud-text-dim border-t border-[color:var(--cloud-border)] pt-3">
                    Sampling from: <span className="cloud-text-muted font-medium">{debugData.program.name}</span>
                    {" "}(Program #{debugData.program.number})
                    {debugData.available_days && Object.keys(debugData.available_days).length > 0 && (
                      <span>
                        {" "}: {Object.entries(debugData.available_days).map(([num, name]) => (
                          <span key={num} className="cloud-text-muted">
                            Day {num} = {name as string}
                            {Number(num) < Math.max(...Object.keys(debugData.available_days).map(Number)) ? ", " : ""}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>

                  {}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => resyncMutation.mutate()}
                      disabled={resyncMutation.isPending}
                      className="flex items-center gap-2 px-3 py-1.5 bg-[rgba(255,255,255,0.03)] hover:bg-[color:var(--cloud-surface-raised)] disabled:bg-[color:var(--cloud-surface-raised)] disabled:opacity-50 text-cyan-400 rounded text-xs font-medium transition-colors"
                    >
                      {resyncMutation.isPending ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Resyncing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3 h-3" />
                          Resync Latest Program
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => resyncAllMutation.mutate()}
                      disabled={resyncAllMutation.isPending}
                      className="flex items-center gap-2 px-3 py-1.5 bg-[rgba(255,255,255,0.03)] hover:bg-[color:var(--cloud-surface-raised)] disabled:bg-[color:var(--cloud-surface-raised)] disabled:opacity-50 text-orange-400 rounded text-xs font-medium transition-colors"
                    >
                      {resyncAllMutation.isPending ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Resyncing All...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3 h-3" />
                          Resync All Programs
                        </>
                      )}
                    </button>
                    {resyncSuccess && (
                      <span className="text-xs text-green-400">Program resynced successfully</span>
                    )}
                    {resyncError && (
                      <span className="text-xs text-red-400">{resyncError}</span>
                    )}
                    {resyncAllSuccess && (
                      <span className="text-xs text-green-400">{resyncAllSuccess}</span>
                    )}
                    {resyncAllError && (
                      <span className="text-xs text-red-400">{resyncAllError}</span>
                    )}
                  </div>
                </>
              )}

              {}
              {(["squat", "bench", "deadlift"] as const).map((lift) => {
                const liftData = debugData.days[lift];
                if (!liftData) return null;

                return (
                  <div
                    key={lift}
                    className={`border rounded-lg p-3 space-y-2 ${LIFT_BG_MAP[lift]}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold text-sm capitalize ${LIFT_COLOR_MAP[lift]}`}>
                        {lift}
                      </span>
                      <span className="text-xs cloud-text-muted">
                        {liftData.day_number !== null
                          ? `Day ${liftData.day_number}${liftData.day_name ? ` (${liftData.day_name})` : ""}`
                          : "Not configured"}
                      </span>
                      {liftData.week_sampled && (
                        <span className="text-xs cloud-text-dim">
                          Week {liftData.week_sampled} sample
                        </span>
                      )}
                      {liftData.status === "ok" ? (
                        <CheckCircle className="w-3.5 h-3.5 text-green-500 ml-auto" />
                      ) : liftData.status === "not_set" ? (
                        <span className="text-xs cloud-text-dim ml-auto">not configured</span>
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 ml-auto" />
                      )}
                    </div>

                    {}
                    {liftData.matching_exercises && liftData.matching_exercises.length > 0 ? (
                      <div className="space-y-1">
                        {liftData.matching_exercises.map((ex, i) => (
                          <div
                            key={i}
                            className={`flex items-center gap-3 text-xs rounded px-2 py-1.5 ${
                              ex.e1rm_eligible
                                ? "bg-green-500/10 cloud-text"
                                : "bg-[rgba(255,255,255,0.03)] cloud-text-muted"
                            }`}
                          >
                            <span className="font-medium min-w-[140px]">{ex.exercise_name}</span>
                            <span className="cloud-text-dim">{ex.set_type}</span>
                            <span className="cloud-text-dim">
                              {ex.sets}x{ex.reps ?? "?"} @ {ex.weight_lbs ?? "?"}lbs
                            </span>
                            {ex.actual_rpe !== null && (
                              <span className="cloud-text-dim">RPE {ex.actual_rpe}</span>
                            )}
                            {ex.e1rm_eligible ? (
                              <span className="flex items-center gap-1 text-green-400 ml-auto">
                                <CheckCircle className="w-3 h-3" />
                                E1RM: {ex.e1rm}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-yellow-500 ml-auto">
                                <XCircle className="w-3 h-3" />
                                {ex.issues.join(", ")}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : liftData.status !== "not_set" ? (
                      <div className="text-xs text-yellow-500/80 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        No matching {lift} exercises found on this day
                      </div>
                    ) : null}

                    {}
                    {liftData.other_exercises_on_day && liftData.other_exercises_on_day.length > 0 && (
                      <div className="text-xs cloud-text-dim pt-1">
                        Also on this day: {liftData.other_exercises_on_day.map((ex) => ex.exercise_name).join(", ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}


const LIFT_COLORS: Record<string, string> = {
  squat: "#f97316",   
  bench: "#22d3ee",   
  deadlift: "#a78bfa", 
};


const COMPARE_ACCENT_COLORS = ["#fbbf24", "#34d399", "#e879f9"]; 
const COMPARE_MAX_SERIES = 3;

type CompareSeries = {
  id: string;
  lift: "squat" | "bench" | "deadlift";
  reps: "all" | "singles" | "doubles" | "triples" | "1-3" | "1-5";
  primaryOnly: boolean;
};

const REP_LABEL: Record<CompareSeries["reps"], string> = {
  all: "All reps",
  singles: "Singles",
  doubles: "Doubles",
  triples: "Triples",
  "1-3": "1-3 reps",
  "1-5": "1-5 reps",
};

function repsToRange(reps: CompareSeries["reps"]): { minReps?: number; maxReps?: number } {
  switch (reps) {
    case "singles": return { minReps: 1, maxReps: 1 };
    case "doubles": return { minReps: 2, maxReps: 2 };
    case "triples": return { minReps: 3, maxReps: 3 };
    case "1-3": return { minReps: 1, maxReps: 3 };
    case "1-5": return { minReps: 1, maxReps: 5 };
    default: return {};
  }
}

function compareSeriesLabel(s: CompareSeries): string {
  const lift = s.lift.charAt(0).toUpperCase() + s.lift.slice(1);
  const reps = REP_LABEL[s.reps];
  const days = s.primaryOnly ? "Primary days" : "All days";
  return `${lift} · ${reps} · ${days}`;
}

function newSeriesId(): string {
  return Math.random().toString(36).slice(2, 9);
}


function VolumeResponseTag({ profile }: { profile: Types.VolumeResponseProfile }) {
  const score = profile.confidence.score;
  const profileCode = profile.profile;

  
  
  
  const confidenceStyle: CSSProperties =
    score >= 70
      ? {
          background: "rgba(16, 185, 129, 0.12)",
          border: "1px solid rgba(16, 185, 129, 0.35)",
          color: "#86efac",
        }
      : score >= 40
      ? {
          background: "rgba(245, 158, 11, 0.12)",
          border: "1px solid rgba(245, 158, 11, 0.35)",
          color: "#fcd34d",
        }
      : {
          background: "rgba(255,255,255,0.03)",
          border: "1px solid var(--cloud-border)",
          color: "var(--cloud-text-muted)",
        };

  
  const profileIcon: Record<string, string> = {
    rising: "↗",
    tapered: "↘",
    steady: "→",
    mixed: "~",
    insufficient_data: "?",
  };

  const liftColor = LIFT_COLORS[profile.lift_category.toLowerCase()] || "var(--cloud-text-dim)";

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded"
      style={{ fontSize: 12, ...confidenceStyle }}
      title={profile.confidence.explanation}
    >
      <span className="font-semibold capitalize" style={{ color: liftColor }}>
        {profile.lift_category}
      </span>
      <span style={{ color: "var(--cloud-text-muted)" }}>
        {profileIcon[profileCode] || ""} {profile.profile_label}
      </span>
      <span className="font-mono font-semibold ml-1">{score}%</span>
    </div>
  );
}


function DataQualityBanner({
  athleteId,
  data,
  isOpen,
  onToggle,
  unit,
}: {
  athleteId: number;
  data: Types.DataQualityResponse;
  isOpen: boolean;
  onToggle: () => void;
  unit: WeightUnit;
}) {
  const outlierCount = data.outliers.length;
  const excludedCount = data.excluded.length;
  const hasIssues = outlierCount > 0 || excludedCount > 0;

  const storageKey = `bestrong.dq.dismissed.${athleteId}.${data.plotted_top_sets}_${data.total_top_sets}_${outlierCount}_${excludedCount}`;
  
  
  
  const subscribe = useCallback((cb: () => void) => {
    if (typeof window === "undefined") return () => {};
    window.addEventListener("bestrong:dqDismissChanged", cb);
    window.addEventListener("storage", cb);
    return () => {
      window.removeEventListener("bestrong:dqDismissChanged", cb);
      window.removeEventListener("storage", cb);
    };
  }, []);
  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  }, [storageKey]);
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, () => false);

  if (dismissed) return null;

  
  
  
  
  const tone: CSSProperties = hasIssues
    ? {
        background: "rgba(245, 158, 11, 0.1)",
        border: "1px solid rgba(245, 158, 11, 0.35)",
        color: "#fcd34d",
      }
    : {
        background: "rgba(16, 185, 129, 0.08)",
        border: "1px solid rgba(16, 185, 129, 0.3)",
        color: "#86efac",
      };
  const accentSecondary = hasIssues ? "#fcd34d" : "#86efac";

  const onDismiss = () => {
    try {
      window.localStorage.setItem(storageKey, "1");
      window.dispatchEvent(new Event("bestrong:dqDismissChanged"));
    } catch {}
  };

  return (
    <div className="rounded-md" style={tone}>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 12 }}>
          <CheckCircle className="w-4 h-4" style={{ color: accentSecondary }} />
          <span className="font-medium">
            {data.plotted_top_sets} of {data.total_top_sets} top sets plotted
          </span>
          {outlierCount > 0 && (
            <span style={{ color: accentSecondary }}>
              · {outlierCount} outlier{outlierCount !== 1 ? "s" : ""}
            </span>
          )}
          {excludedCount > 0 && (
            <span style={{ color: accentSecondary }}>
              · {excludedCount} excluded
            </span>
          )}
          {!hasIssues && <span className="opacity-80">· no issues detected</span>}
        </div>
        <div className="flex items-center gap-1">
          {hasIssues && (
            <button
              onClick={onToggle}
              className="rounded px-3 py-1 font-medium transition-colors flex items-center gap-1"
              style={{
                fontSize: 11,
                border: "1px solid rgba(245, 158, 11, 0.4)",
                background: "transparent",
                color: "#fcd34d",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(245, 158, 11, 0.18)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {isOpen ? (
                <>
                  <ChevronDown className="w-3 h-3" /> Hide review
                </>
              ) : (
                <>
                  <ChevronRight className="w-3 h-3" /> Review
                </>
              )}
            </button>
          )}
          <button
            onClick={onDismiss}
            title="Dismiss"
            aria-label="Dismiss"
            className="rounded p-1 transition-colors"
            style={{ color: accentSecondary }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = hasIssues
                ? "rgba(245, 158, 11, 0.18)"
                : "rgba(16, 185, 129, 0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {isOpen && hasIssues && (
        <div
          className="px-4 py-3 space-y-3"
          style={{ borderTop: "1px solid rgba(245, 158, 11, 0.2)", fontSize: 12 }}
        >
          {outlierCount > 0 && (
            <DataQualityTable
              title={`Outliers (${outlierCount})`}
              issues={data.outliers}
              unit={unit}
            />
          )}
          {excludedCount > 0 && (
            <DataQualityTable
              title={`Excluded from chart (${excludedCount})`}
              issues={data.excluded}
              unit={unit}
            />
          )}
        </div>
      )}
    </div>
  );
}

function DataQualityTable({
  title,
  issues,
  unit,
}: {
  title: string;
  issues: Types.DataQualityIssue[];
  unit: WeightUnit;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider cloud-text-dim mb-1.5">
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="cloud-text-dim">
              <th className="py-1 pr-3 font-medium">Where</th>
              <th className="py-1 pr-3 font-medium">Lift</th>
              <th className="py-1 pr-3 font-medium">Set</th>
              <th className="py-1 pr-3 font-medium">Reason</th>
              <th className="py-1 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue, idx) => {
              const where = [
                issue.program_number != null ? `P${issue.program_number}` : null,
                issue.week_number != null ? `W${issue.week_number}` : null,
                issue.day_name ??
                  (issue.day_number != null ? `D${issue.day_number}` : null),
              ]
                .filter(Boolean)
                .join(" · ");
              const setDesc =
                issue.weight_lbs != null && issue.reps != null
                  ? `${formatWeight(issue.weight_lbs, unit, { unitless: true })} ${unit} × ${issue.reps}${
                      issue.actual_rpe != null ? ` @ ${issue.actual_rpe}` : ""
                    }`
                  : "—";
              return (
                <tr
                  key={`${issue.category}-${idx}`}
                  className="border-t border-[color:var(--cloud-border)]"
                >
                  <td className="py-1 pr-3 whitespace-nowrap">{where || "—"}</td>
                  <td className="py-1 pr-3 capitalize">
                    {issue.lift_category ?? "—"}
                    {issue.exercise_name && (
                      <span className="cloud-text-dim ml-1">
                        ({issue.exercise_name})
                      </span>
                    )}
                  </td>
                  <td className="py-1 pr-3 whitespace-nowrap">{setDesc}</td>
                  <td className="py-1 pr-3">{issue.reason}</td>
                  <td className="py-1">
                    {issue.google_sheet_url ? (
                      <a
                        href={issue.google_sheet_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                        style={{ color: "#93c5fd" }}
                      >
                        Open ↗
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function ProgressionCharts({
  athleteId,
  athlete,
  highlightedExercise,
  unit,
  onClearHighlight,
  compMaxes,
}: {
  athleteId: number;
  athlete: Types.AthleteResponse;
  highlightedExercise: HighlightedExercise | null;
  unit: WeightUnit;
  onClearHighlight: () => void;
  compMaxes: Types.CompetitionMaxForLift[];
}) {
  const { resolvedMode } = useTheme();
  const { instanceSettings } = useAuth();
  const tracksRpe = instanceSettings.tracks_rpe;
  const [primaryOnly, setPrimaryOnly] = useState(false);
  const [chartMode, setChartMode] = useState<"e1rm" | "volume">("e1rm");
  const [chartGranularity, setChartGranularity] = useState<"block" | "week">("block");
  const [visibleLifts, setVisibleLifts] = useState<Set<string>>(
    new Set(["squat", "bench", "deadlift"])
  );
  
  
  
  
  
  const [selectedExercises, setSelectedExercises] = useState<Record<string, Set<string>>>({});
  
  const [showManageVariations, setShowManageVariations] = useState(false);

  
  
  
  
  
  const [selectedBlocks, setSelectedBlocks] = useState<Set<number>>(new Set());

  const toggleLift = (lift: string) => {
    setVisibleLifts((prev) => {
      const next = new Set(prev);
      if (next.has(lift)) {
        
        if (next.size > 1) next.delete(lift);
      } else {
        next.add(lift);
      }
      return next;
    });
  };

  
  
  const chartColors = {
    grid: resolvedMode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
    axis: resolvedMode === 'dark' ? 'rgba(250,250,250,0.5)' : '#6b7280',
    
    
    
    tooltipBg: resolvedMode === 'dark' ? '#09090b' : '#ffffff',
    tooltipBorder: resolvedMode === 'dark' ? 'rgba(255,255,255,0.18)' : '#e2e8f0',
    tooltipText: resolvedMode === 'dark' ? '#fafafa' : '#000000',
    tooltipShadow: resolvedMode === 'dark'
      ? '0 10px 24px -8px rgba(0,0,0,0.7), 0 4px 12px -4px rgba(0,0,0,0.5)'
      : '0 4px 12px rgba(0,0,0,0.1)',
  };
  const [repFilter, setRepFilter] = useState<string>("1-3");
  const [showDebug, setShowDebug] = useState(false);
  const [showPeakTable, setShowPeakTable] = useState(false);
  
  
  const [overlayPeaks, setOverlayPeaks] = useState<boolean>(false);

  
  
  
  
  
  
  const [compareMode, setCompareMode] = useState(false);
  const [compareSeries, setCompareSeries] = useState<CompareSeries[]>([]);
  
  const [seriesEditorTarget, setSeriesEditorTarget] = useState<string | null>(null);
  const [seriesEditorDraft, setSeriesEditorDraft] = useState<CompareSeries | null>(null);

  
  
  
  
  
  
  
  
  
  
  
  
  
  const [tooltipVisible, setTooltipVisible] = useState(false);
  
  
  
  
  const [tooltipPayload, setTooltipPayload] = useState<
    ReadonlyArray<{ payload: Record<string, unknown> }> | null
  >(null);
  
  
  
  
  
  const [pinnedTooltip, setPinnedTooltip] = useState<{
    x: number;
    y: number;
    payload: ReadonlyArray<{ payload: Record<string, unknown> }>;
  } | null>(null);
  const tooltipCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTooltipClose = useCallback(() => {
    if (tooltipCloseTimerRef.current) {
      clearTimeout(tooltipCloseTimerRef.current);
      tooltipCloseTimerRef.current = null;
    }
  }, []);
  const scheduleTooltipClose = useCallback((ms: number = 300) => {
    if (tooltipCloseTimerRef.current) {
      clearTimeout(tooltipCloseTimerRef.current);
    }
    tooltipCloseTimerRef.current = setTimeout(() => {
      setTooltipVisible(false);
      tooltipCloseTimerRef.current = null;
    }, ms);
  }, []);
  const scheduleTooltipCloseFromChart = useCallback(
    () => scheduleTooltipClose(1500),
    [scheduleTooltipClose],
  );
  const scheduleTooltipCloseFromTooltip = useCallback(
    () => scheduleTooltipClose(300),
    [scheduleTooltipClose],
  );
  useEffect(() => {
    return () => {
      if (tooltipCloseTimerRef.current) clearTimeout(tooltipCloseTimerRef.current);
    };
  }, []);

  
  const chartsContainerRef = useRef<HTMLDivElement | null>(null);
  
  const peakChartRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!pinnedTooltip) return;
    const handler = (e: MouseEvent) => {
      const node = peakChartRef.current;
      if (!node) return;
      if (!node.contains(e.target as Node)) {
        setPinnedTooltip(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pinnedTooltip]);

  const hasPrimaryDays = Boolean(
    athlete.primary_squat_day || athlete.primary_bench_day || athlete.primary_deadlift_day
  );

  
  
  
  
  const compMaxByLift = useMemo(() => {
    const m: Record<string, Types.CompetitionMaxForLift> = {};
    for (const c of compMaxes) m[c.lift.toLowerCase()] = c;
    return m;
  }, [compMaxes]);

  
  
  
  
  
  
  
  
  
  
  
  const [preHighlightSnapshot, setPreHighlightSnapshot] = useState<{
    chartMode: "e1rm" | "volume";
    chartGranularity: "block" | "week";
    primaryOnly: boolean;
    repFilter: string;
    visibleLifts: Set<string>;
  } | null>(null);
  const [prevHighlight, setPrevHighlight] = useState<HighlightedExercise | null>(
    highlightedExercise,
  );
  if (highlightedExercise !== prevHighlight) {
    const arriving = Boolean(highlightedExercise);
    const leaving = Boolean(prevHighlight && !highlightedExercise);
    setPrevHighlight(highlightedExercise);
    if (arriving && highlightedExercise) {
      
      if (!preHighlightSnapshot) {
        setPreHighlightSnapshot({
          chartMode,
          chartGranularity,
          primaryOnly,
          repFilter,
          visibleLifts: new Set(visibleLifts),
        });
      }
      
      setChartMode("e1rm");
      setChartGranularity("week");
      
      setPrimaryOnly(false);
      
      if (highlightedExercise.reps === 1) setRepFilter("singles");
      else if (highlightedExercise.reps === 2) setRepFilter("doubles");
      else if (highlightedExercise.reps === 3) setRepFilter("triples");
      else setRepFilter("all");
      
      setVisibleLifts((prev) => {
        if (prev.has(highlightedExercise.lift_category)) return prev;
        const next = new Set(prev);
        next.add(highlightedExercise.lift_category);
        return next;
      });
    } else if (leaving && preHighlightSnapshot) {
      setChartMode(preHighlightSnapshot.chartMode);
      setChartGranularity(preHighlightSnapshot.chartGranularity);
      setPrimaryOnly(preHighlightSnapshot.primaryOnly);
      setRepFilter(preHighlightSnapshot.repFilter);
      setVisibleLifts(preHighlightSnapshot.visibleLifts);
      setPreHighlightSnapshot(null);
    }
  }
  
  
  useEffect(() => {
    if (!highlightedExercise) return;
    const handle = requestAnimationFrame(() => {
      chartsContainerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => cancelAnimationFrame(handle);
  }, [highlightedExercise]);

  
  const repRange = useMemo(() => {
    switch (repFilter) {
      case "singles": return { minReps: 1, maxReps: 1 };
      case "doubles": return { minReps: 2, maxReps: 2 };
      case "triples": return { minReps: 3, maxReps: 3 };
      case "1-3": return { minReps: 1, maxReps: 3 };
      case "1-5": return { minReps: 1, maxReps: 5 };
      default: return {};
    }
  }, [repFilter]);

  
  const usePrimaryFilter = hasPrimaryDays && primaryOnly;
  const { data: e1rmData = [], isLoading: e1rmLoading } = useQuery({
    queryKey: ["e1rm", athleteId, repFilter, usePrimaryFilter],
    queryFn: () =>
      apiClient.getE1RMTrends(athleteId, {
        primaryOnly: usePrimaryFilter,
        ...repRange,
      }),
    enabled: chartMode === "e1rm" && !compareMode,
  });

  
  
  
  
  const compareSeriesQueries = useQueries({
    queries: (compareMode ? compareSeries : []).map((s) => {
      const range = repsToRange(s.reps);
      return {
        queryKey: [
          "e1rm-compare",
          athleteId,
          s.lift,
          s.reps,
          s.primaryOnly && hasPrimaryDays,
        ],
        queryFn: () =>
          apiClient.getE1RMTrends(athleteId, {
            liftCategory: s.lift,
            primaryOnly: s.primaryOnly && hasPrimaryDays,
            ...range,
          }),
        enabled: chartMode === "e1rm" && compareMode,
      };
    }),
  });
  const compareLoading = compareSeriesQueries.some((q) => q.isLoading);

  
  
  
  
  const { data: dataQuality } = useQuery({
    queryKey: ["data-quality", athleteId],
    queryFn: () => apiClient.getDataQuality(athleteId),
    enabled: chartMode === "e1rm",
  });
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  
  
  
  
  const [outlierExplainer, setOutlierExplainer] = useState<{
    lift: string;
    exerciseName: string;
    weightLbs: number;
    reps: number;
    rpe: number | null;
    e1rm: number;
    programNumber: number | null;
    weekNumber: number;
    dayNumber: number | null;
    dayName: string | null;
    sheetUrl: string | null;
    reason: string;
    averageLbs: number;
    references: Types.OutlierReferencePoint[];
  } | null>(null);

  
  const { data: volumeData = [], isLoading: volumeLoading } = useQuery({
    queryKey: ["volume-trends", athleteId],
    queryFn: () => apiClient.getVolumeTrends(athleteId),
    enabled: chartMode === "volume",
  });

  
  
  
  
  
  
  const availableExercises = useMemo(() => {
    
    const groups: Record<string, Record<string, Record<string, number>>> = {};
    for (const dp of e1rmData) {
      const cat = dp.lift_category.toLowerCase();
      const canon = dp.canonical_exercise_name || dp.exercise_name.toLowerCase();
      if (!groups[cat]) groups[cat] = {};
      if (!groups[cat][canon]) groups[cat][canon] = {};
      groups[cat][canon][dp.exercise_name] =
        (groups[cat][canon][dp.exercise_name] ?? 0) + 1;
    }
    const out: Record<string, { canonical: string; displayName: string }[]> = {};
    for (const [cat, byCanon] of Object.entries(groups)) {
      const entries = Object.entries(byCanon).map(([canonical, rawCounts]) => {
        
        
        const rawNames = Object.keys(rawCounts);
        const displayName = rawNames.reduce((best, n) =>
          rawCounts[n] > rawCounts[best] ? n : best,
        );
        return { canonical, displayName };
      });
      entries.sort((a, b) => a.displayName.localeCompare(b.displayName));
      out[cat] = entries;
    }
    return out;
  }, [e1rmData]);

  
  
  
  
  const canonicalOf = useMemo(() => {
    const map: Record<string, string> = {};
    for (const dp of e1rmData) {
      if (!map[dp.exercise_name]) {
        map[dp.exercise_name] = dp.canonical_exercise_name || dp.exercise_name.toLowerCase();
      }
    }
    return map;
  }, [e1rmData]);

  
  
  
  
  
  const rawNamesByLift = useMemo(() => {
    const sets: Record<string, Set<string>> = {};
    for (const dp of e1rmData) {
      const cat = dp.lift_category.toLowerCase();
      if (!sets[cat]) sets[cat] = new Set();
      sets[cat].add(dp.exercise_name);
    }
    const out: Record<string, string[]> = {};
    for (const [cat, names] of Object.entries(sets)) {
      out[cat] = Array.from(names).sort();
    }
    return out;
  }, [e1rmData]);

  
  
  
  
  
  
  
  
  
  
  
  
  
  const effectiveSelectedExercises = useMemo(() => {
    const out: Record<string, Set<string>> = {};
    for (const [cat, entries] of Object.entries(availableExercises)) {
      const canonicals = entries.map((e) => e.canonical);
      const stored = selectedExercises[cat];
      if (stored === undefined) {
        if (cat === "squat" || cat === "deadlift") {
          const compEntry = entries.find((e) =>
            e.canonical.startsWith("competition "),
          );
          out[cat] = compEntry ? new Set([compEntry.canonical]) : new Set(canonicals);
        } else {
          out[cat] = new Set(canonicals);
        }
      } else {
        const valid = new Set<string>();
        for (const n of stored) if (canonicals.includes(n)) valid.add(n);
        out[cat] = valid;
      }
    }
    return out;
  }, [availableExercises, selectedExercises]);

  
  
  
  
  
  
  const passesVariationFilter = useCallback(
    (exerciseName: string, liftCategory: string) => {
      const cat = liftCategory.toLowerCase();
      if (cat === "bench") return true;
      const selected = effectiveSelectedExercises[cat];
      if (!selected) return true;
      const canon = canonicalOf[exerciseName] ?? exerciseName.toLowerCase();
      return selected.has(canon);
    },
    [effectiveSelectedExercises, canonicalOf],
  );

  
  
  
  
  const toggleExercise = useCallback(
    (lift: string, canonical: string) => {
      setSelectedExercises((prev) => {
        const stored = prev[lift];
        const base =
          stored ?? new Set((availableExercises[lift] ?? []).map((e) => e.canonical));
        const next = new Set(base);
        if (next.has(canonical)) next.delete(canonical);
        else next.add(canonical);
        return { ...prev, [lift]: next };
      });
    },
    [availableExercises],
  );

  
  
  
  
  
  
  const availableBlocks = useMemo(() => {
    const set = new Set<number>();
    for (const dp of e1rmData) {
      if (!visibleLifts.has(dp.lift_category.toLowerCase())) continue;
      if (!passesVariationFilter(dp.exercise_name, dp.lift_category)) continue;
      if (dp.program_number != null) set.add(dp.program_number);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [e1rmData, visibleLifts, passesVariationFilter]);

  
  
  
  const { data: programList = [] } = useQuery({
    queryKey: ["athlete-programs", athleteId],
    queryFn: () => apiClient.listPrograms(athleteId),
  });
  const programNameByNumber = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of programList) {
      if (p.program_number != null && p.program_name) {
        map.set(p.program_number, p.program_name);
      }
    }
    return map;
  }, [programList]);
  const blockLabel = (n: number) => {
    const name = programNameByNumber.get(n);
    return name ? `P${n} · ${name}` : `P${n}`;
  };

  
  
  
  
  
  
  
  const effectiveSelectedBlocks = useMemo(() => {
    if (selectedBlocks.size === 0) return selectedBlocks;
    const valid = new Set(availableBlocks);
    const next = new Set<number>();
    for (const b of selectedBlocks) if (valid.has(b)) next.add(b);
    return next;
  }, [selectedBlocks, availableBlocks]);

  
  
  
  
  
  
  
  
  
  
  const e1rmChartData = useMemo(() => {
    if (!e1rmData.length) return [];

    
    
    
    
    
    
    type BucketRow = Record<
      string,
      string | number | null | undefined | Types.OutlierReferencePoint[]
    >;
    const bucketMap = new Map<string, BucketRow>();

    for (const dp of e1rmData) {
      const liftKey = dp.lift_category.toLowerCase();
      if (!visibleLifts.has(liftKey)) continue;
      if (!passesVariationFilter(dp.exercise_name, dp.lift_category)) continue;
      const pNum = dp.program_number ?? 0;
      if (effectiveSelectedBlocks.size > 0 && !effectiveSelectedBlocks.has(pNum)) continue;
      const wNum = dp.week_number ?? 0;
      const key = chartGranularity === "week" ? `${pNum}-${wNum}` : `${pNum}`;
      const label = chartGranularity === "week" ? `P${pNum}W${wNum}` : `P${pNum}`;

      if (!bucketMap.has(key)) {
        bucketMap.set(key, {
          label,
          program_number: pNum,
          week_number: wNum,
          program_name: dp.program_name,
          sortKey: chartGranularity === "week" ? pNum * 100 + wNum : pNum,
        });
      }
      const bucket = bucketMap.get(key)!;
      
      
      
      const weight = Math.round(convertWeight(dp.weight_lbs, unit));
      const current = bucket[liftKey];
      if (typeof current !== "number" || weight > current) {
        bucket[liftKey] = weight;
        bucket[`${liftKey}_reps`] = dp.reps;
        
        
        
        bucket[`${liftKey}_exercise`] = dp.exercise_name;
        bucket[`${liftKey}_rpe`] = dp.actual_rpe ?? null;
        bucket[`${liftKey}_e1rm`] = dp.e1rm ?? null;
        bucket[`${liftKey}_day_name`] = dp.day_name ?? null;
        bucket[`${liftKey}_day_number`] = dp.day_number;
        bucket[`${liftKey}_program_name`] = dp.program_name ?? null;
        bucket[`${liftKey}_program_number`] = dp.program_number ?? null;
        bucket[`${liftKey}_week_number`] = dp.week_number;
        bucket[`${liftKey}_sheet_url`] = dp.google_sheet_url ?? null;
        bucket[`${liftKey}_is_outlier`] = dp.is_outlier ? 1 : 0;
        bucket[`${liftKey}_outlier_reason`] = dp.outlier_reason ?? null;
        
        
        
        bucket[`${liftKey}_outlier_average_lbs`] = dp.outlier_average ?? null;
        bucket[`${liftKey}_outlier_refs`] = dp.outlier_reference_points ?? [];
        bucket[`${liftKey}_weight_lbs`] = dp.weight_lbs;
        bucket[`${liftKey}_e1rm_lbs`] = dp.e1rm ?? null;
      }
    }

    return Array.from(bucketMap.values()).sort((a, b) => {
      const aKey = typeof a.sortKey === "number" ? a.sortKey : 0;
      const bKey = typeof b.sortKey === "number" ? b.sortKey : 0;
      return aKey - bKey;
    });
  }, [e1rmData, chartGranularity, visibleLifts, effectiveSelectedBlocks, passesVariationFilter, unit]);

  
  
  
  
  
  const compareChartData = useMemo(() => {
    if (!compareMode || compareSeries.length === 0) return [];
    type BucketRow = Record<string, string | number | null | undefined>;
    const bucketMap = new Map<string, BucketRow>();

    compareSeries.forEach((series, idx) => {
      const q = compareSeriesQueries[idx];
      const data = q?.data ?? [];
      for (const dp of data) {
        const pNum = dp.program_number ?? 0;
        if (effectiveSelectedBlocks.size > 0 && !effectiveSelectedBlocks.has(pNum)) continue;
        const wNum = dp.week_number ?? 0;
        const key = chartGranularity === "week" ? `${pNum}-${wNum}` : `${pNum}`;
        const label = chartGranularity === "week" ? `P${pNum}W${wNum}` : `P${pNum}`;
        if (!bucketMap.has(key)) {
          bucketMap.set(key, {
            label,
            program_number: pNum,
            week_number: wNum,
            program_name: dp.program_name,
            sortKey: chartGranularity === "week" ? pNum * 100 + wNum : pNum,
          });
        }
        const bucket = bucketMap.get(key)!;
        const weight = Math.round(convertWeight(dp.weight_lbs, unit));
        const seriesKey = `series_${series.id}`;
        const current = bucket[seriesKey];
        if (typeof current !== "number" || weight > current) {
          bucket[seriesKey] = weight;
          bucket[`${series.id}_reps`] = dp.reps;
          bucket[`${series.id}_rpe`] = dp.actual_rpe ?? null;
          bucket[`${series.id}_exercise`] = dp.exercise_name;
          bucket[`${series.id}_e1rm`] = dp.e1rm ?? null;
          bucket[`${series.id}_day_name`] = dp.day_name ?? null;
          bucket[`${series.id}_day_number`] = dp.day_number;
          bucket[`${series.id}_week_number`] = dp.week_number;
        }
      }
    });

    return Array.from(bucketMap.values()).sort((a, b) => {
      const aKey = typeof a.sortKey === "number" ? a.sortKey : 0;
      const bKey = typeof b.sortKey === "number" ? b.sortKey : 0;
      return aKey - bKey;
    });
  }, [
    compareMode,
    compareSeries,
    compareSeriesQueries,
    chartGranularity,
    effectiveSelectedBlocks,
    unit,
  ]);

  
  
  
  
  const highlightMarker = useMemo(() => {
    if (!highlightedExercise || !e1rmChartData.length) return null;
    const { program_number, week_number, lift_category, weight_lbs } = highlightedExercise;
    const targetLabel =
      chartGranularity === "week"
        ? `P${program_number}W${week_number}`
        : `P${program_number}`;
    const bucket = e1rmChartData.find((b) => b.label === targetLabel);
    if (!bucket) return null;
    const rawY = bucket[lift_category];
    const y =
      typeof rawY === "number"
        ? rawY
        : Math.round(convertWeight(weight_lbs, unit));
    return { label: targetLabel, y };
  }, [highlightedExercise, e1rmChartData, chartGranularity, unit]);

  
  
  
  
  
  const e1rmPeakRows = useMemo(() => {
    if (!e1rmData.length) return [];

    
    const peakMap = new Map<string, Types.E1RMDataPoint>();

    for (const dp of e1rmData) {
      if (!visibleLifts.has(dp.lift_category.toLowerCase())) continue;
      if (!passesVariationFilter(dp.exercise_name, dp.lift_category)) continue;
      const pNum = dp.program_number ?? 0;
      if (effectiveSelectedBlocks.size > 0 && !effectiveSelectedBlocks.has(pNum)) continue;
      const key = `${pNum}-${dp.lift_category.toLowerCase()}`;
      const existing = peakMap.get(key);
      if (!existing || dp.weight_lbs > existing.weight_lbs) {
        peakMap.set(key, dp);
      }
    }

    return Array.from(peakMap.values()).sort((a, b) => {
      const progDiff = (b.program_number ?? 0) - (a.program_number ?? 0);
      if (progDiff !== 0) return progDiff;
      const liftOrder: Record<string, number> = { squat: 0, bench: 1, deadlift: 2 };
      return (liftOrder[a.lift_category.toLowerCase()] ?? 9) - (liftOrder[b.lift_category.toLowerCase()] ?? 9);
    });
  }, [e1rmData, visibleLifts, effectiveSelectedBlocks, passesVariationFilter]);

  
  const liftCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const dp of e1rmData) {
      cats.add(dp.lift_category.toLowerCase());
    }
    
    const order = ["squat", "bench", "deadlift"];
    return order.filter((c) => cats.has(c));
  }, [e1rmData]);

  
  const volumeChartData = useMemo(() => {
    if (!volumeData.length) return [];
    
    
    const conv = (n: number | null | undefined) =>
      n == null ? null : Math.round(convertWeight(n, unit));
    return volumeData.map((v) => ({
      label: `P${v.program_number} W${v.week_number}`,
      squat: conv(v.squat_volume),
      bench: conv(v.bench_volume),
      deadlift: conv(v.deadlift_volume),
      total: conv(v.total_volume),
    }));
  }, [volumeData, unit]);

  
  
  
  
  const { data: volumeResponseData, isLoading: volumeResponseLoading } = useQuery({
    queryKey: ["volume-response", athleteId],
    queryFn: () => apiClient.getVolumeResponse(athleteId, { topN: 5, trailingWeeks: 6 }),
    enabled: chartMode === "volume",
  });

  
  
  
  
  
  const peakMarkers = useMemo(() => {
    const byKey = new Map<
      string,
      { rank: number; peak: Types.VolumeResponsePeak; color: string }
    >();
    const flat: Array<{
      label: string;
      lift: string;
      color: string;
      peak: Types.VolumeResponsePeak;
      rank: number;
    }> = [];
    if (!overlayPeaks || !volumeResponseData || !volumeChartData.length) {
      return { byKey, flat };
    }
    const labelSet = new Set(volumeChartData.map((v) => v.label));
    for (const profile of volumeResponseData.profiles) {
      const lift = profile.lift_category.toLowerCase();
      if (!visibleLifts.has(lift)) continue;
      profile.peaks.forEach((peak, idx) => {
        const label = `P${peak.program_number} W${peak.week_number}`;
        if (!labelSet.has(label)) return;
        const color = LIFT_COLORS[lift] || "#fbbf24";
        const rank = idx + 1;
        byKey.set(`${lift}|${label}`, { rank, peak, color });
        flat.push({ label, lift, color, peak, rank });
      });
    }
    return { byKey, flat };
    
    
    
  }, [overlayPeaks, volumeResponseData, volumeChartData, visibleLifts]);

  
  
  
  
  const makePeakDotRenderer = useCallback(
    (lift: string, liftColor: string) => {
      function PeakDotRenderer(props: {
        cx?: number;
        cy?: number;
        index?: number;
        payload?: { label?: string };
      }) {
        const { cx, cy, payload, index } = props;
        if (cx == null || cy == null || !payload || !payload.label) {
          return <g key={`dot-${lift}-${index ?? Math.random()}`} />;
        }
        const marker = peakMarkers.byKey.get(`${lift}|${payload.label}`);
        if (!marker) {
          return (
            <circle
              key={`dot-${lift}-${payload.label}`}
              cx={cx}
              cy={cy}
              r={3}
              fill={liftColor}
              stroke="none"
            />
          );
        }
        const p = marker.peak;
        const rpePart = p.actual_rpe != null ? ` @ RPE ${p.actual_rpe}` : "";
        const blockPart = p.program_number != null ? ` (P${p.program_number} W${p.week_number} D${p.day_number})` : ` (W${p.week_number} D${p.day_number})`;
        const hoverText = `#${marker.rank} peak · ${p.exercise_name} · ${p.reps}×${Math.round(p.weight_lbs)} lbs${rpePart} · e1RM ${Math.round(p.e1rm)} lbs${blockPart}`;
        return (
          <g key={`peak-${lift}-${payload.label}`}>
            <title>{hoverText}</title>
            <circle
              cx={cx}
              cy={cy}
              r={9}
              fill={marker.color}
              stroke="#ffffff"
              strokeWidth={2}
            />
            <text
              x={cx}
              y={cy - 14}
              textAnchor="middle"
              fill={marker.color}
              fontSize={11}
              fontWeight={700}
            >
              #{marker.rank}
            </text>
          </g>
        );
      }
      return PeakDotRenderer;
    },
    [peakMarkers],
  );

  
  
  
  
  
  const makeOutlierDotRenderer = useCallback(
    (lift: string, liftColor: string) => {
      function OutlierDotRenderer(props: {
        cx?: number;
        cy?: number;
        index?: number;
        payload?: Record<string, string | number | null | undefined>;
      }) {
        const { cx, cy, payload, index } = props;
        if (cx == null || cy == null || !payload) {
          return <g key={`dot-${lift}-${index ?? Math.random()}`} />;
        }
        const key = `${payload.label ?? index}`;
        const isOutlier = payload[`${lift}_is_outlier`] === 1;
        const reason = payload[`${lift}_outlier_reason`];
        const handleClick = (e: React.MouseEvent<SVGGElement>) => {
          e.stopPropagation();
          cancelTooltipClose();
          setTooltipVisible(false);
          setPinnedTooltip({
            x: cx,
            y: cy,
            payload: [{ payload: payload as Record<string, unknown> }],
          });
        };
        const hitArea = (
          <circle
            cx={cx}
            cy={cy}
            r={12}
            fill="transparent"
            style={{ pointerEvents: "all", cursor: "pointer" }}
          />
        );
        if (!isOutlier) {
          return (
            <g key={`dot-${lift}-${key}`} onClick={handleClick}>
              <circle cx={cx} cy={cy} r={4} fill={liftColor} stroke="none" />
              {hitArea}
            </g>
          );
        }
        return (
          <g key={`outlier-${lift}-${key}`} onClick={handleClick}>
            {typeof reason === "string" && <title>{`⚠ ${reason}`}</title>}
            <circle
              cx={cx}
              cy={cy}
              r={9}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="2 2"
            />
            <circle cx={cx} cy={cy} r={4} fill={liftColor} stroke="none" />
            {hitArea}
          </g>
        );
      }
      return OutlierDotRenderer;
    },
    [cancelTooltipClose],
  );

  const isLoading =
    chartMode === "e1rm"
      ? compareMode
        ? compareLoading
        : e1rmLoading
      : volumeLoading;
  const hasData =
    chartMode === "e1rm"
      ? compareMode
        ? compareChartData.length > 0
        : e1rmChartData.length > 0
      : volumeChartData.length > 0;

  return (
    <div ref={chartsContainerRef} className="space-y-6 scroll-mt-20">
      {}
      {chartMode === "e1rm" && !hasPrimaryDays && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          <div className="text-red-300">
            <span className="font-semibold">Primary days are not set.</span>{" "}
            Open the three-dot menu on this athlete and choose &ldquo;Primary Days&rdquo; to configure default primary days for squat, bench, and deadlift.
          </div>
        </div>
      )}

      {}
      {chartMode === "e1rm" && dataQuality && dataQuality.total_top_sets > 0 && (
        <DataQualityBanner
          athleteId={athleteId}
          data={dataQuality}
          isOpen={isReviewOpen}
          onToggle={() => setIsReviewOpen((v) => !v)}
          unit={unit}
        />
      )}

      {}
      {highlightedExercise && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-amber-200">
            <span className="inline-block w-3 h-3 rounded-full bg-amber-400 ring-2 ring-amber-400/40 flex-shrink-0" />
            <div>
              <span className="font-semibold">Highlighting:</span>{" "}
              {highlightedExercise.exercise_name}{" "}
              <span className="text-amber-300/80">
                {highlightedExercise.reps}×{formatWeight(highlightedExercise.weight_lbs, unit)}
              </span>{" "}
              <span className="text-amber-300/60">
                (P{highlightedExercise.program_number} W
                {highlightedExercise.week_number} D
                {highlightedExercise.day_number})
              </span>
            </div>
          </div>
          <button
            onClick={onClearHighlight}
            className="rounded px-3 py-1 text-xs font-medium text-amber-200 border border-amber-500/40 hover:bg-amber-500/20 transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-2">
          <button
            onClick={() => setChartMode("e1rm")}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              chartMode === "e1rm"
                ? "bg-orange-600 text-white"
                : "bg-[rgba(255,255,255,0.03)] cloud-text-muted hover:bg-[color:var(--cloud-surface-raised)]"
            }`}
          >
            Peak Lifts
          </button>
          <button
            onClick={() => setChartMode("volume")}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              chartMode === "volume"
                ? "bg-orange-600 text-white"
                : "bg-[rgba(255,255,255,0.03)] cloud-text-muted hover:bg-[color:var(--cloud-surface-raised)]"
            }`}
          >
            Volume Over Time
          </button>
        </div>

        {chartMode === "e1rm" && (
          <div className="cloud-tabs" role="tablist" aria-label="Chart granularity">
            <button
              type="button"
              role="tab"
              aria-selected={chartGranularity === "block"}
              onClick={() => setChartGranularity("block")}
              className="cloud-tab"
            >
              Per Block
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={chartGranularity === "week"}
              onClick={() => setChartGranularity("week")}
              className="cloud-tab"
            >
              Per Week
            </button>
          </div>
        )}

        {chartMode === "e1rm" && hasPrimaryDays && (
          <button
            onClick={() => setPrimaryOnly(!primaryOnly)}
            disabled={compareMode}
            title={compareMode ? "Set per series while Compare is on" : undefined}
            className={`px-3 py-2 rounded text-sm font-medium transition-colors border ${
              primaryOnly && !compareMode
                ? "bg-orange-600/20 text-orange-400 border-orange-500/30"
                : "cloud-text-muted border-transparent hover:bg-[color:var(--cloud-surface-raised)]"
            } ${compareMode ? "opacity-40 cursor-not-allowed hover:bg-transparent" : ""}`}
          >
            Primary Only
          </button>
        )}

        {chartMode === "e1rm" && (
          <select
            value={repFilter}
            onChange={(e) => setRepFilter(e.target.value)}
            disabled={compareMode}
            title={compareMode ? "Set per series while Compare is on" : undefined}
            style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'var(--cloud-border)', color: 'var(--cloud-text)', colorScheme: 'dark' }}
            className={`border rounded px-3 py-2 text-sm cursor-pointer ${
              compareMode ? "opacity-40 cursor-not-allowed" : ""
            }`}
          >
            <option value="all">All reps</option>
            <option value="singles">Singles (1 rep)</option>
            <option value="doubles">Doubles (2 reps)</option>
            <option value="triples">Triples (3 reps)</option>
            <option value="1-3">1-3 reps</option>
            <option value="1-5">1-5 reps</option>
          </select>
        )}

        {chartMode === "e1rm" && (
          <button
            onClick={() => {
              setCompareMode((on) => {
                const next = !on;
                if (next && compareSeries.length === 0) {
                  
                  
                  setCompareSeries([
                    {
                      id: newSeriesId(),
                      lift: "squat",
                      reps: "triples",
                      primaryOnly: hasPrimaryDays,
                    },
                  ]);
                }
                return next;
              });
            }}
            style={
              compareMode
                ? undefined
                : {
                    backgroundColor: "rgba(255,255,255,0.03)",
                    borderColor: "var(--cloud-border)",
                    color: "var(--cloud-text)",
                  }
            }
            className={`px-3 py-2 rounded text-sm font-medium transition-colors border ${
              compareMode
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : "hover:bg-[color:var(--cloud-surface-raised)]"
            }`}
            title="Overlay 2-3 rep/day/lift series on one chart"
          >
            {compareMode ? "Compare: On" : "Compare"}
          </button>
        )}

        {}
        {chartMode === "e1rm" && availableBlocks.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              style={{
                backgroundColor: 'rgba(255,255,255,0.03)',
                borderColor: 'var(--cloud-border)',
                color: 'var(--cloud-text)',
              }}
              className="border rounded px-3 py-2 text-sm cursor-pointer flex items-center gap-2"
            >
              {selectedBlocks.size === 0
                ? "All blocks"
                : selectedBlocks.size === 1
                ? blockLabel([...selectedBlocks][0])
                : `${selectedBlocks.size} blocks`}
              <ChevronDown className="w-4 h-4 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="cloud-panel-raised max-h-72 overflow-y-auto min-w-[320px] max-w-[480px]"
            >
              <DropdownMenuItem
                onClick={() => setSelectedBlocks(new Set())}
                className="text-xs cloud-text-dim"
              >
                Clear (show all)
              </DropdownMenuItem>
              {availableBlocks.map((b) => (
                <DropdownMenuCheckboxItem
                  key={b}
                  checked={selectedBlocks.has(b)}
                  onCheckedChange={(checked) => {
                    setSelectedBlocks((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(b);
                      else next.delete(b);
                      return next;
                    });
                  }}
                  className="text-sm cloud-text-primary"
                  title={blockLabel(b)}
                >
                  <span className="flex-1 truncate">{blockLabel(b)}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {}
        {(() => {
          const disabledForCompare = compareMode && chartMode === "e1rm";
          const liftList = ["squat", "bench", "deadlift"] as const;

          
          
          
          const variationsFiltered = liftList.some((lift) => {
            if (!visibleLifts.has(lift)) return false;
            const avail = availableExercises[lift] ?? [];
            if (avail.length <= 1) return false;
            const effective = effectiveSelectedExercises[lift] ?? new Set<string>();
            return effective.size !== avail.length;
          });

          
          
          
          const isCompetitionDefault = (() => {
            for (const lift of liftList) {
              if (lift === "bench") continue;
              const avail = availableExercises[lift] ?? [];
              if (avail.length <= 1) continue;
              const effective = effectiveSelectedExercises[lift] ?? new Set<string>();
              if (effective.size !== 1) return false;
              const only = [...effective][0];
              if (!only?.startsWith("competition ")) return false;
            }
            return true;
          })();

          let label: string;
          if (visibleLifts.size < liftList.length) {
            label = `${visibleLifts.size} of ${liftList.length} lifts`;
          } else if (isCompetitionDefault && variationsFiltered) {
            label = "Competition lifts";
          } else if (variationsFiltered) {
            label = "All lifts · filtered";
          } else {
            label = "All lifts";
          }

          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={disabledForCompare}
                title={
                  disabledForCompare ? "Set per series while Compare is on" : undefined
                }
                style={{
                  backgroundColor: "rgba(255,255,255,0.03)",
                  borderColor: "var(--cloud-border)",
                  color: "var(--cloud-text)",
                }}
                className={`border rounded px-3 py-2 text-sm cursor-pointer flex items-center gap-2 ${
                  disabledForCompare ? "opacity-40 cursor-not-allowed" : ""
                }`}
              >
                {label}
                <ChevronDown className="w-4 h-4 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="cloud-panel-raised min-w-[240px] max-h-[70vh] overflow-y-auto"
              >
                {liftList.map((lift) => {
                  const isOn = visibleLifts.has(lift);
                  const isLastOne = isOn && visibleLifts.size === 1;
                  const variations = availableExercises[lift] ?? [];
                  const showVariations = isOn && variations.length > 1;
                  const effective =
                    effectiveSelectedExercises[lift] ?? new Set<string>();
                  return (
                    <div key={lift}>
                      <DropdownMenuCheckboxItem
                        checked={isOn}
                        disabled={isLastOne}
                        onCheckedChange={() => toggleLift(lift)}
                        className="text-sm cloud-text-primary capitalize font-medium"
                        title={
                          isLastOne ? "At least one lift must be visible" : undefined
                        }
                      >
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full mr-2 flex-shrink-0"
                          style={{ backgroundColor: LIFT_COLORS[lift] }}
                        />
                        {lift}
                      </DropdownMenuCheckboxItem>
                      {showVariations &&
                        variations.map(({ canonical, displayName }) => (
                          <DropdownMenuCheckboxItem
                            key={`${lift}-${canonical}`}
                            checked={effective.has(canonical)}
                            onCheckedChange={() => toggleExercise(lift, canonical)}
                            className="text-xs cloud-text-muted pl-8"
                          >
                            {displayName}
                          </DropdownMenuCheckboxItem>
                        ))}
                    </div>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })()}

        {}
        {chartMode === "e1rm" && (
          <button
            onClick={() => setShowManageVariations(true)}
            style={{
              backgroundColor: "rgba(255,255,255,0.03)",
              borderColor: "var(--cloud-border)",
              color: "var(--cloud-text-muted)",
            }}
            className="border rounded px-3 py-2 text-sm cursor-pointer hover:cloud-text hover:bg-[color:var(--cloud-surface-raised)] transition-colors"
            title="Merge equivalent exercise names across the program"
          >
            Manage Variations
          </button>
        )}
      </div>

      <ManageVariationsModal
        open={showManageVariations}
        onClose={() => setShowManageVariations(false)}
        candidatesByLift={rawNamesByLift}
      />

      <div className="flex flex-wrap gap-3 mb-3 items-center">
        {}

        {chartMode === "volume" && (
          <button
            onClick={() => setOverlayPeaks(!overlayPeaks)}
            className={`px-3 py-2 rounded text-sm font-medium transition-colors border ${
              overlayPeaks
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : "cloud-text-muted border-transparent hover:bg-[color:var(--cloud-surface-raised)]"
            }`}
            title="Overlay the top 5 peak e1rm moments on the volume chart"
          >
            {overlayPeaks ? "Overlay Peaks: On" : "Overlay Peaks: Off"}
          </button>
        )}

        {(() => {
          
          
          
          const isFiltered =
            repFilter !== "1-3" ||
            primaryOnly ||
            selectedBlocks.size > 0 ||
            visibleLifts.size < 3 ||
            Object.keys(selectedExercises).length > 0;
          if (!isFiltered) return null;
          return (
            <button
              onClick={() => {
                setRepFilter("1-3");
                setPrimaryOnly(false);
                setSelectedBlocks(new Set());
                setVisibleLifts(new Set(["squat", "bench", "deadlift"]));
                setSelectedExercises({});
              }}
              className="px-3 py-2 rounded text-sm cloud-text-dim hover:cloud-text hover:bg-[color:var(--cloud-surface-raised)] transition-colors"
              title="Reset rep filter, Primary Only, block selector, lifts, and variations"
            >
              Reset filters
            </button>
          );
        })()}
      </div>

      {}
      {chartMode === "e1rm" && hasPrimaryDays && (
        <PrimaryDayDebugPanel
          athleteId={athleteId}
          athlete={athlete}
          showDebug={showDebug}
          setShowDebug={setShowDebug}
          primaryOnly={usePrimaryFilter}
          e1rmDataCount={e1rmData.length}
          repFilter={repFilter}
          chartGranularity={chartGranularity}
        />
      )}

      {}
      {chartMode === "e1rm" && compareMode && (
        <div className="rounded-lg border border-[color:var(--cloud-border)] bg-[color:var(--cloud-surface-raised)] p-4 space-y-2">
          <div className="text-xs cloud-text-dim uppercase tracking-wider">
            Comparing {compareSeries.length} of {COMPARE_MAX_SERIES} series
          </div>
          <div className="space-y-1.5">
            {compareSeries.map((s, idx) => {
              const color = COMPARE_ACCENT_COLORS[idx] ?? "#9ca3af";
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-[color:var(--cloud-surface-raised)] transition-colors"
                >
                  <span
                    className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="flex-1 text-sm cloud-text">{compareSeriesLabel(s)}</span>
                  <button
                    onClick={() => {
                      setSeriesEditorTarget(s.id);
                      setSeriesEditorDraft({ ...s });
                    }}
                    className="text-xs cloud-text-dim hover:cloud-text underline-offset-2 hover:underline"
                  >
                    edit
                  </button>
                  <button
                    onClick={() =>
                      setCompareSeries((prev) => prev.filter((x) => x.id !== s.id))
                    }
                    disabled={compareSeries.length === 1}
                    title={
                      compareSeries.length === 1
                        ? "At least one series must remain"
                        : "Remove this series"
                    }
                    className="w-6 h-6 rounded text-sm cloud-text-dim hover:cloud-text hover:bg-[color:var(--cloud-surface-raised)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
          {compareSeries.length < COMPARE_MAX_SERIES && (
            <button
              onClick={() => {
                setSeriesEditorTarget("new");
                setSeriesEditorDraft({
                  id: newSeriesId(),
                  lift: "squat",
                  reps: "triples",
                  primaryOnly: hasPrimaryDays,
                });
              }}
              className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
            >
              + Add series{" "}
              <span className="cloud-text-dim">
                ({COMPARE_MAX_SERIES - compareSeries.length} slot
                {COMPARE_MAX_SERIES - compareSeries.length === 1 ? "" : "s"} left)
              </span>
            </button>
          )}
        </div>
      )}

      {}
      <Dialog
        open={seriesEditorTarget !== null}
        onOpenChange={(v) => {
          if (!v) {
            setSeriesEditorTarget(null);
            setSeriesEditorDraft(null);
          }
        }}
      >
        <DialogContent className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
              {seriesEditorTarget === "new" ? "Add series" : "Edit series"}
            </DialogTitle>
            <DialogDescription className="cloud-text-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
              Pick a lift, rep scheme, and whether to restrict to primary days.
            </DialogDescription>
          </DialogHeader>
          {seriesEditorDraft && (
            <div className="space-y-4">
              <div>
                <div
                  className="cloud-text-dim"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  Lift
                </div>
                <div
                  className="inline-flex rounded-md overflow-hidden w-full"
                  style={{ border: "1px solid var(--cloud-border)" }}
                >
                  {(["squat", "bench", "deadlift"] as const).map((l, i) => {
                    const active = seriesEditorDraft.lift === l;
                    return (
                      <Fragment key={l}>
                        {i > 0 && (
                          <div style={{ width: 1, background: "var(--cloud-border)" }} />
                        )}
                        <button
                          onClick={() =>
                            setSeriesEditorDraft((d) => (d ? { ...d, lift: l } : d))
                          }
                          className="flex-1 capitalize transition-colors"
                          style={{
                            padding: "7px 0",
                            fontSize: 13,
                            fontWeight: active ? 500 : 400,
                            background: active ? "rgba(245, 158, 11, 0.18)" : "transparent",
                            color: active ? "#fcd34d" : "var(--cloud-text-muted)",
                          }}
                        >
                          {l}
                        </button>
                      </Fragment>
                    );
                  })}
                </div>
              </div>
              <div>
                <div
                  className="cloud-text-dim"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  Reps
                </div>
                <select
                  value={seriesEditorDraft.reps}
                  onChange={(e) =>
                    setSeriesEditorDraft((d) =>
                      d ? { ...d, reps: e.target.value as CompareSeries["reps"] } : d,
                    )
                  }
                  className="cloud-input w-full cursor-pointer"
                  style={{ colorScheme: "dark" }}
                >
                  <option value="all">All reps</option>
                  <option value="singles">Singles (1 rep)</option>
                  <option value="doubles">Doubles (2 reps)</option>
                  <option value="triples">Triples (3 reps)</option>
                  <option value="1-3">1–3 reps</option>
                  <option value="1-5">1–5 reps</option>
                </select>
              </div>
              {hasPrimaryDays && (
                <div>
                  <div
                    className="cloud-text-dim"
                    style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontWeight: 500,
                      marginBottom: 6,
                    }}
                  >
                    Days
                  </div>
                  <div
                    className="inline-flex rounded-md overflow-hidden w-full"
                    style={{ border: "1px solid var(--cloud-border)" }}
                  >
                    {[
                      { val: true, label: "Primary only" },
                      { val: false, label: "All days" },
                    ].map((opt, i) => {
                      const active = seriesEditorDraft.primaryOnly === opt.val;
                      return (
                        <Fragment key={String(opt.val)}>
                          {i > 0 && (
                            <div style={{ width: 1, background: "var(--cloud-border)" }} />
                          )}
                          <button
                            onClick={() =>
                              setSeriesEditorDraft((d) =>
                                d ? { ...d, primaryOnly: opt.val } : d,
                              )
                            }
                            className="flex-1 transition-colors"
                            style={{
                              padding: "7px 0",
                              fontSize: 13,
                              fontWeight: active ? 500 : 400,
                              background: active ? "rgba(245, 158, 11, 0.18)" : "transparent",
                              color: active ? "#fcd34d" : "var(--cloud-text-muted)",
                            }}
                          >
                            {opt.label}
                          </button>
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter
            className="!mt-2 !-mx-4 !-mb-4 !p-4 !border-t !bg-transparent"
            style={{ borderColor: "var(--cloud-border)" }}
          >
            <button
              type="button"
              className="cloud-btn cloud-btn-ghost"
              onClick={() => {
                setSeriesEditorTarget(null);
                setSeriesEditorDraft(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cloud-btn cloud-btn-primary"
              onClick={() => {
                if (!seriesEditorDraft) return;
                if (seriesEditorTarget === "new") {
                  setCompareSeries((prev) =>
                    prev.length < COMPARE_MAX_SERIES
                      ? [...prev, seriesEditorDraft]
                      : prev,
                  );
                } else {
                  setCompareSeries((prev) =>
                    prev.map((s) =>
                      s.id === seriesEditorTarget ? seriesEditorDraft : s,
                    ),
                  );
                }
                setSeriesEditorTarget(null);
                setSeriesEditorDraft(null);
              }}
            >
              {seriesEditorTarget === "new" ? "Add series" : "Save"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {}
      {isLoading ? (
        <div className="text-center py-12 cloud-text-muted">Loading chart data...</div>
      ) : !hasData ? (
        <div className="text-center py-12 cloud-text-muted space-y-2">
          <p className="font-medium">
            {chartMode === "e1rm"
              ? compareMode
                ? "No data matches the current series."
                : "No lift data matches the current filters."
              : "No volume data available."}
          </p>
          {chartMode === "e1rm" && !compareMode && (
            <p className="text-sm cloud-text-dim">
              Try{" "}
              {repFilter !== "all" && (
                <>
                  widening rep range (you&rsquo;re on&nbsp;
                  <span className="cloud-text">{repFilter}</span>
                  ),
                </>
              )}
              {primaryOnly && <> turning off Primary&nbsp;Only,</>}
              {selectedBlocks.size > 0 && <> clearing the block filter,</>}
              {visibleLifts.size < 3 && <> enabling more lifts,</>}
              {repFilter === "all" &&
                !primaryOnly &&
                selectedBlocks.size === 0 &&
                visibleLifts.size === 3 &&
                " importing a program — no top sets with weight are on file yet."}
            </p>
          )}
          {chartMode === "e1rm" && compareMode && (
            <p className="text-sm cloud-text-dim">
              Try widening a series&apos; rep range or turning off Primary&nbsp;Only on it.
            </p>
          )}
        </div>
      ) : chartMode === "e1rm" ? (
        <Card className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] p-6">
          <h3 className="text-lg font-semibold mb-1">
            {compareMode
              ? "Compare Series"
              : chartGranularity === "block"
              ? "Peak Weight Per Block"
              : "Peak Weight Per Week"}
          </h3>
          <p className="text-sm cloud-text-muted mb-6">
            {compareMode
              ? "Heaviest weight per bucket for each custom series"
              : chartGranularity === "block"
              ? "Heaviest weight lifted per lift each training block"
              : "Heaviest weight lifted per lift each week"}
            {!compareMode && usePrimaryFilter && " (primary days only)"}
          </p>
          <div ref={peakChartRef}>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart
              data={compareMode ? compareChartData : e1rmChartData}
              onMouseMove={(state) => {
                
                
                if (pinnedTooltip) return;
                
                
                
                
                
                const s = state as
                  | {
                      isTooltipActive?: boolean;
                      activeIndex?: number | string;
                    }
                  | undefined;
                if (!s?.isTooltipActive) return;
                cancelTooltipClose();
                setTooltipVisible(true);
                const idx =
                  typeof s.activeIndex === "number"
                    ? s.activeIndex
                    : typeof s.activeIndex === "string"
                    ? Number(s.activeIndex)
                    : NaN;
                const data = compareMode ? compareChartData : e1rmChartData;
                if (Number.isFinite(idx) && idx >= 0 && idx < data.length) {
                  setTooltipPayload([
                    { payload: data[idx] as Record<string, unknown> },
                  ]);
                }
              }}
              onMouseLeave={() => {
                if (pinnedTooltip) return;
                scheduleTooltipCloseFromChart();
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis
                dataKey="label"
                tick={{ fill: chartColors.axis, fontSize: 12 }}
                stroke="rgba(75, 85, 99, 0.3)"
              />
              <YAxis
                tick={{ fill: chartColors.axis, fontSize: 12 }}
                stroke="rgba(75, 85, 99, 0.3)"
                domain={["auto", "auto"]}
                label={{
                  value: `Weight (${unit})`,
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: chartColors.axis, fontSize: 12 },
                }}
              />
              <Tooltip
                active={tooltipVisible || pinnedTooltip !== null}
                cursor={
                  pinnedTooltip
                    ? false
                    : { stroke: chartColors.axis, strokeOpacity: 0.3 }
                }
                wrapperStyle={{ pointerEvents: "auto" }}
                position={pinnedTooltip ? { x: pinnedTooltip.x, y: pinnedTooltip.y } : undefined}
                content={({ payload }) => {
                  
                  
                  
                  const effective = pinnedTooltip
                    ? pinnedTooltip.payload
                    : payload && payload.length > 0
                      ? (payload as ReadonlyArray<{ payload: Record<string, unknown> }>)
                      : tooltipPayload;
                  if (!effective || effective.length === 0) return null;
                  const row = (effective[0]?.payload ?? {}) as Record<
                    string,
                    string | number | null | undefined | Types.OutlierReferencePoint[]
                  >;
                  if (compareMode) {
                    return (
                      <div
                        onMouseEnter={cancelTooltipClose}
                        onMouseLeave={scheduleTooltipCloseFromTooltip}
                        style={{
                          backgroundColor: chartColors.tooltipBg,
                          border: `1px solid ${chartColors.tooltipBorder}`,
                          color: chartColors.tooltipText,
                          boxShadow: chartColors.tooltipShadow,
                        }}
                        className="rounded-md px-3 py-2 text-xs max-w-xs"
                      >
                        <div className="font-semibold mb-1">
                          {typeof row.label === "string" || typeof row.label === "number"
                            ? row.label
                            : ""}
                          {typeof row.program_name === "string"
                            ? ` · ${row.program_name}`
                            : ""}
                        </div>
                        {compareSeries.map((s, idx) => {
                          const weight = row[`series_${s.id}`];
                          if (typeof weight !== "number") return null;
                          const reps = row[`${s.id}_reps`] as number | undefined;
                          const rpe = row[`${s.id}_rpe`] as number | null | undefined;
                          const exercise = row[`${s.id}_exercise`] as string | undefined;
                          const color = COMPARE_ACCENT_COLORS[idx] ?? "#9ca3af";
                          const setLine =
                            rpe != null
                              ? `${weight} ${unit} × ${reps ?? "?"} @ RPE ${rpe}`
                              : `${weight} ${unit} × ${reps ?? "?"}`;
                          return (
                            <div key={s.id} className="mb-1.5 last:mb-0">
                              <div className="font-medium" style={{ color }}>
                                {compareSeriesLabel(s)}
                              </div>
                              <div>{setLine}</div>
                              {exercise && (
                                <div className="opacity-80">{exercise}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                  return (
                    <div
                      onMouseEnter={cancelTooltipClose}
                      onMouseLeave={scheduleTooltipCloseFromTooltip}
                      style={{
                        backgroundColor: chartColors.tooltipBg,
                        border: `1px solid ${chartColors.tooltipBorder}`,
                        color: chartColors.tooltipText,
                        boxShadow: chartColors.tooltipShadow,
                      }}
                      className="rounded-md px-3 py-2 text-xs max-w-xs"
                    >
                      <div className="font-semibold mb-1">
                        {typeof row.label === "string" || typeof row.label === "number"
                          ? row.label
                          : ""}
                        {typeof row.program_name === "string"
                          ? ` · ${row.program_name}`
                          : ""}
                      </div>
                      {liftCategories
                        .filter((cat) => visibleLifts.has(cat))
                        .filter((cat) => typeof row[cat] === "number")
                        .map((cat) => {
                          const weight = row[cat] as number;
                          const reps = row[`${cat}_reps`] as number | undefined;
                          const rpe = row[`${cat}_rpe`] as number | null | undefined;
                          const e1rm = row[`${cat}_e1rm`] as number | null | undefined;
                          const exercise = row[`${cat}_exercise`] as string | undefined;
                          const dayName = row[`${cat}_day_name`] as string | null | undefined;
                          const dayNumber = row[`${cat}_day_number`] as number | undefined;
                          const weekNumber = row[`${cat}_week_number`] as number | undefined;
                          const sheetUrl = row[`${cat}_sheet_url`] as string | null | undefined;
                          const isOutlier = row[`${cat}_is_outlier`] === 1;
                          const outlierReason = row[`${cat}_outlier_reason`] as
                            | string
                            | null
                            | undefined;
                          const color = LIFT_COLORS[cat] || "#6b7280";
                          const setLine =
                            rpe != null
                              ? `${weight} ${unit} × ${reps ?? "?"} @ RPE ${rpe}`
                              : `${weight} ${unit} × ${reps ?? "?"}`;
                          const e1rmLbs =
                            typeof e1rm === "number"
                              ? Math.round(convertWeight(e1rm, unit))
                              : null;
                          const dayBit = dayName
                            ? dayName
                            : dayNumber != null
                            ? `Day ${dayNumber}`
                            : "";
                          const locBit = weekNumber != null ? `W${weekNumber}` : "";
                          return (
                            <div key={cat} className="mb-1.5 last:mb-0">
                              <div
                                className="font-medium capitalize"
                                style={{ color }}
                              >
                                {cat}
                              </div>
                              <div>{setLine}</div>
                              {e1rmLbs !== null && (
                                <div className="opacity-80">
                                  e1RM {e1rmLbs} {unit} (RPE table)
                                </div>
                              )}
                              {exercise && <div className="opacity-80">{exercise}</div>}
                              {(dayBit || locBit) && (
                                <div className="opacity-60">
                                  {[locBit, dayBit].filter(Boolean).join(" · ")}
                                </div>
                              )}
                              {isOutlier && outlierReason && (
                                <div className="mt-1 text-amber-400 font-medium flex items-center gap-1">
                                  <span>⚠ {outlierReason}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const averageLbs = row[`${cat}_outlier_average_lbs`] as
                                        | number
                                        | null
                                        | undefined;
                                      const refs = (row[`${cat}_outlier_refs`] as
                                        | Types.OutlierReferencePoint[]
                                        | undefined) ?? [];
                                      const weightLbs = row[`${cat}_weight_lbs`] as number | undefined;
                                      const e1rmLbsRaw = row[`${cat}_e1rm_lbs`] as
                                        | number
                                        | null
                                        | undefined;
                                      const programNumber = row[`${cat}_program_number`] as
                                        | number
                                        | null
                                        | undefined;
                                      if (
                                        typeof averageLbs !== "number" ||
                                        typeof weightLbs !== "number" ||
                                        typeof e1rmLbsRaw !== "number"
                                      ) {
                                        return;
                                      }
                                      setOutlierExplainer({
                                        lift: cat,
                                        exerciseName: exercise ?? "",
                                        weightLbs,
                                        reps: reps ?? 0,
                                        rpe: rpe ?? null,
                                        e1rm: e1rmLbsRaw,
                                        programNumber: programNumber ?? null,
                                        weekNumber: weekNumber ?? 0,
                                        dayNumber: dayNumber ?? null,
                                        dayName: dayName ?? null,
                                        sheetUrl: sheetUrl ?? null,
                                        reason: outlierReason,
                                        averageLbs,
                                        references: refs,
                                      });
                                    }}
                                    aria-label="Explain this outlier"
                                    className="rounded-full border border-amber-400 w-4 h-4 inline-flex items-center justify-center text-amber-400 hover:bg-amber-400 hover:text-black transition-colors text-[10px] font-bold leading-none cursor-pointer"
                                  >
                                    ?
                                  </button>
                                </div>
                              )}
                              {sheetUrl && (
                                <a
                                  href={sheetUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-0.5 inline-block text-cyan-400 hover:underline"
                                >
                                  Open source sheet ↗
                                </a>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  );
                }}
              />
              <Legend
                wrapperStyle={{ color: "#d1d5db" }}
              />
              {}
              {(compareMode
                ? Array.from(new Set(compareSeries.map((s) => s.lift)))
                : liftCategories.filter((cat) => visibleLifts.has(cat))
              ).map((cat) => {
                const cm = compMaxByLift[cat];
                if (!cm || cm.weight_lbs == null) return null;
                const y = Math.round(convertWeight(cm.weight_lbs, unit));
                const color = LIFT_COLORS[cat] || "#6b7280";
                return (
                  <ReferenceLine
                    key={`compmax-${cat}`}
                    y={y}
                    stroke={color}
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                    label={{
                      value: `Comp ${cat}: ${y}`,
                      position: "insideTopRight",
                      fill: color,
                      fontSize: 10,
                    }}
                  />
                );
              })}
              {compareMode
                ? compareSeries.map((s, idx) => {
                    const color = COMPARE_ACCENT_COLORS[idx] ?? "#9ca3af";
                    const seriesId = s.id;
                    function CompareDot(props: {
                      cx?: number;
                      cy?: number;
                      index?: number;
                      payload?: Record<string, string | number | null | undefined>;
                    }) {
                      const { cx, cy, payload, index } = props;
                      if (cx == null || cy == null || !payload) {
                        return <g key={`cdot-${seriesId}-${index ?? Math.random()}`} />;
                      }
                      const handleClick = (e: React.MouseEvent<SVGGElement>) => {
                        e.stopPropagation();
                        cancelTooltipClose();
                        setTooltipVisible(false);
                        setPinnedTooltip({
                          x: cx,
                          y: cy,
                          payload: [{ payload: payload as Record<string, unknown> }],
                        });
                      };
                      return (
                        <g key={`cdot-${seriesId}-${payload.label ?? index}`} onClick={handleClick}>
                          <circle cx={cx} cy={cy} r={4} fill={color} stroke="none" />
                          <circle
                            cx={cx}
                            cy={cy}
                            r={12}
                            fill="transparent"
                            style={{ pointerEvents: "all", cursor: "pointer" }}
                          />
                        </g>
                      );
                    }
                    return (
                      <Line
                        key={s.id}
                        type="monotone"
                        dataKey={`series_${s.id}`}
                        name={compareSeriesLabel(s)}
                        stroke={color}
                        strokeWidth={2}
                        dot={CompareDot}
                        connectNulls={false}
                      />
                    );
                  })
                : liftCategories
                    .filter((cat) => visibleLifts.has(cat))
                    .map((cat) => (
                      <Line
                        key={cat}
                        type="monotone"
                        dataKey={cat}
                        name={cat.charAt(0).toUpperCase() + cat.slice(1)}
                        stroke={LIFT_COLORS[cat] || "#6b7280"}
                        strokeWidth={2}
                        dot={makeOutlierDotRenderer(cat, LIFT_COLORS[cat] || "#6b7280")}
                        connectNulls={false}
                      />
                    ))}
              {!compareMode && highlightMarker && (
                <ReferenceDot
                  x={highlightMarker.label}
                  y={highlightMarker.y}
                  r={9}
                  fill="#fbbf24"
                  stroke="#fbbf24"
                  strokeWidth={3}
                  ifOverflow="extendDomain"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
          </div>
        </Card>
      ) : (
        <Card className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] p-6">
          <h3 className="text-lg font-semibold mb-1">Weekly Training Volume</h3>
          <p className="text-sm cloud-text-muted mb-4">
            Total volume (sets x reps x weight) per lift category by week
          </p>

          {}
          {volumeResponseData && volumeResponseData.profiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {volumeResponseData.profiles.map((p) => (
                <VolumeResponseTag key={p.lift_category} profile={p} />
              ))}
            </div>
          )}
          {volumeResponseLoading && (
            <div className="text-xs cloud-text-dim mb-4">Analyzing peaks...</div>
          )}

          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={volumeChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis
                dataKey="label"
                tick={{ fill: chartColors.axis, fontSize: 12 }}
                stroke="rgba(75, 85, 99, 0.3)"
              />
              <YAxis
                tick={{ fill: chartColors.axis, fontSize: 12 }}
                stroke="rgba(75, 85, 99, 0.3)"
                domain={["auto", "auto"]}
                label={{
                  value: `Volume (${unit})`,
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: chartColors.axis, fontSize: 12 },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: chartColors.tooltipBg,
                  border: `1px solid ${chartColors.tooltipBorder}`,
                  borderRadius: '6px',
                  color: chartColors.tooltipText,
                  boxShadow: chartColors.tooltipShadow,
                }}
                labelStyle={{ color: chartColors.tooltipText }}
                formatter={(value) =>
                  value != null ? Number(value).toLocaleString() + ` ${unit}` : "—"
                }
              />
              <Legend wrapperStyle={{ color: "#d1d5db" }} />
              {visibleLifts.has("squat") && (
                <Line
                  type="monotone"
                  dataKey="squat"
                  name="Squat"
                  stroke={LIFT_COLORS.squat}
                  strokeWidth={2}
                  dot={
                    overlayPeaks
                      ? makePeakDotRenderer("squat", LIFT_COLORS.squat)
                      : { r: 3 }
                  }
                  connectNulls
                />
              )}
              {visibleLifts.has("bench") && (
                <Line
                  type="monotone"
                  dataKey="bench"
                  name="Bench"
                  stroke={LIFT_COLORS.bench}
                  strokeWidth={2}
                  dot={
                    overlayPeaks
                      ? makePeakDotRenderer("bench", LIFT_COLORS.bench)
                      : { r: 3 }
                  }
                  connectNulls
                />
              )}
              {visibleLifts.has("deadlift") && (
                <Line
                  type="monotone"
                  dataKey="deadlift"
                  name="Deadlift"
                  stroke={LIFT_COLORS.deadlift}
                  strokeWidth={2}
                  dot={
                    overlayPeaks
                      ? makePeakDotRenderer("deadlift", LIFT_COLORS.deadlift)
                      : { r: 3 }
                  }
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>

          {}
          {overlayPeaks && volumeResponseData && (
            <div className="mt-4 border-t border-[color:var(--cloud-border)] pt-3 space-y-4">
              <div className="text-xs cloud-text-dim">
                Peak moments (numbered on chart):
              </div>
              {volumeResponseData.profiles
                .filter((p) =>
                  visibleLifts.has(p.lift_category.toLowerCase()),
                )
                .map((profile) => {
                  const lift = profile.lift_category.toLowerCase();
                  const color = LIFT_COLORS[lift] || "#fbbf24";
                  return (
                    <div key={lift} className="text-xs">
                      <div
                        className="font-semibold capitalize mb-1"
                        style={{ color }}
                      >
                        {lift}
                      </div>
                      {profile.peaks.length === 0 ? (
                        <div className="cloud-text-dim italic pl-3">
                          No peak candidates found. Total top sets at ≤ 3
                          reps: {profile.total_peak_candidates}.{" "}
                          {profile.total_peak_candidates === 0
                            ? `Your ${lift} top sets might all be at 4+ reps, which are excluded from peak detection to avoid noise. If you want peaks from higher-rep top sets, we can relax the rep cap for this lift.`
                            : "Peaks were found but none had enough trailing volume history to classify."}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 pl-3">
                          {profile.peaks.map((peak, idx) => {
                            const rank = idx + 1;
                            const label = `P${peak.program_number} W${peak.week_number}`;
                            return (
                              <div
                                key={`${lift}-${idx}`}
                                className="flex items-start gap-2"
                              >
                                <span
                                  className="inline-block w-2 h-2 rounded-full mt-1 flex-shrink-0"
                                  style={{ backgroundColor: color }}
                                />
                                <span
                                  className="font-semibold flex-shrink-0"
                                  style={{ color }}
                                >
                                  #{rank}
                                </span>
                                <span className="cloud-text-muted flex-shrink-0">
                                  {formatWeight(peak.weight_lbs, unit, { unitless: true })}×{peak.reps}
                                  {peak.actual_rpe
                                    ? ` @${peak.actual_rpe}`
                                    : ""}
                                  {" "}= {formatWeight(peak.e1rm, unit, { unitless: true })}
                                  {peak.e1rm_method === "actual"
                                    ? ""
                                    : " est."}
                                  {" "}{unit}
                                </span>
                                <span className="cloud-text-dim">
                                  ({label}
                                  {peak.trailing_slope === "insufficient" &&
                                  peak.trailing_reason
                                    ? `, ${peak.trailing_reason}`
                                    : `, ${peak.trailing_slope}`}
                                  )
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </Card>
      )}

      {/* E1RM peak data table — collapsible. Hidden in Compare mode; the
          single global `e1rmData` fetch is off there, so this table would
          render empty or stale. */}
      {chartMode === "e1rm" && !compareMode && e1rmPeakRows.length > 0 && (
        <Card className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] overflow-hidden">
          <button
            onClick={() => setShowPeakTable(!showPeakTable)}
            className="w-full flex items-center justify-between p-4 hover:bg-[rgba(255,255,255,0.03)] transition-colors"
          >
            <h3 className="text-md font-semibold">Peak Weight Per Block</h3>
            <ChevronDown
              className={`w-5 h-5 cloud-text-muted transition-transform ${showPeakTable ? "rotate-180" : ""}`}
            />
          </button>
          {showPeakTable && (
            <div className="px-6 pb-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="cloud-text-muted border-b border-[color:var(--cloud-border)]">
                      <th className="text-left py-2 px-3">Block</th>
                      <th className="text-left py-2 px-3">Exercise</th>
                      <th className="text-right py-2 px-3">Week</th>
                      <th className="text-right py-2 px-3">Weight</th>
                      <th className="text-right py-2 px-3">Reps</th>
                      {tracksRpe && (
                        <th className="text-right py-2 px-3">RPE</th>
                      )}
                      <th className="text-right py-2 px-3">Peak Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e1rmPeakRows.map((dp, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-[color:var(--cloud-border)] hover:bg-[rgba(255,255,255,0.03)]"
                      >
                        <td className="py-2 px-3 cloud-text-muted">
                          {dp.program_name || `Program ${dp.program_number}`}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className="font-medium"
                            style={{ color: LIFT_COLORS[dp.lift_category.toLowerCase()] || "#d1d5db" }}
                          >
                            {dp.exercise_name}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right cloud-text-muted">
                          W{dp.week_number}
                        </td>
                        <td className="py-2 px-3 text-right cloud-text-muted">
                          {formatWeight(dp.weight_lbs, unit)}
                        </td>
                        <td className="py-2 px-3 text-right cloud-text-muted">
                          {dp.reps}
                        </td>
                        {tracksRpe && (
                          <td className="py-2 px-3 text-right cloud-text-muted">
                            {dp.actual_rpe ?? "—"}
                          </td>
                        )}
                        <td className="py-2 px-3 text-right font-bold text-orange-400">
                          {formatWeight(dp.weight_lbs, unit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}

      {}
      <Dialog
        open={outlierExplainer !== null}
        onOpenChange={(open) => {
          if (!open) setOutlierExplainer(null);
        }}
      >
        <DialogContent className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] max-w-2xl">
          {outlierExplainer && (() => {
            const x = outlierExplainer;
            const currentWeight = Math.round(convertWeight(x.weightLbs, unit));
            const currentE1rm = Math.round(convertWeight(x.e1rm, unit));
            const averageDisplay = Math.round(convertWeight(x.averageLbs, unit));
            const deltaLbs = x.e1rm - x.averageLbs;
            const deltaDisplay = Math.round(convertWeight(Math.abs(deltaLbs), unit));
            const pct =
              x.averageLbs > 0 ? Math.round((deltaLbs / x.averageLbs) * 100) : 0;
            const direction = deltaLbs >= 0 ? "above" : "below";
            const liftColor = LIFT_COLORS[x.lift] || "#d1d5db";
            return (
              <>
                <DialogHeader>
                  <DialogTitle style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
                    Where this flag comes from
                  </DialogTitle>
                  <DialogDescription className="cloud-text-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
                    The dot was flagged because its e1RM sits more than ±40%
                    from the recent average of this lift&apos;s prior points.
                    Every number below is one click from its source cell —
                    spot-check any of them if the average looks off.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  <div
                    className="rounded-md px-3 py-2.5"
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid var(--cloud-border)",
                    }}
                  >
                    <div className="flex items-baseline justify-between">
                      <div
                        className="capitalize"
                        style={{ color: liftColor, fontSize: 14, fontWeight: 500 }}
                      >
                        {x.lift}
                        {x.exerciseName ? (
                          <span className="cloud-text-muted" style={{ fontWeight: 400 }}>
                            {" "}· {x.exerciseName}
                          </span>
                        ) : null}
                      </div>
                      <div className="cloud-text-dim" style={{ fontSize: 11 }}>
                        {x.programNumber != null ? `P${x.programNumber} · ` : ""}
                        W{x.weekNumber}
                        {x.dayName
                          ? ` · ${x.dayName}`
                          : x.dayNumber != null
                          ? ` · Day ${x.dayNumber}`
                          : ""}
                      </div>
                    </div>
                    <div className="cloud-text mt-1" style={{ fontSize: 13 }}>
                      {currentWeight} {unit} × {x.reps}
                      {x.rpe != null ? ` @ RPE ${x.rpe}` : ""}
                    </div>
                    <div className="cloud-text-muted" style={{ fontSize: 12 }}>
                      e1RM {currentE1rm} {unit}
                    </div>
                    {x.sheetUrl && (
                      <a
                        href={x.sheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block hover:underline"
                        style={{ color: "var(--cloud-primary)", fontSize: 11 }}
                      >
                        Open source sheet ↗
                      </a>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Recent average", value: `${averageDisplay} ${unit}`, muted: true },
                      { label: "This point", value: `${currentE1rm} ${unit}`, muted: false },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-md px-3 py-2"
                        style={{
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid var(--cloud-border)",
                        }}
                      >
                        <div
                          className="cloud-text-dim"
                          style={{
                            fontSize: 10,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            fontWeight: 500,
                          }}
                        >
                          {stat.label}
                        </div>
                        <div
                          className={stat.muted ? "cloud-text-muted" : "cloud-text"}
                          style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}
                        >
                          {stat.value}
                        </div>
                      </div>
                    ))}
                    <div
                      className="rounded-md px-3 py-2"
                      style={{
                        background: "rgba(245, 158, 11, 0.06)",
                        border: "1px solid rgba(245, 158, 11, 0.3)",
                      }}
                    >
                      <div
                        className="cloud-text-dim"
                        style={{
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          fontWeight: 500,
                        }}
                      >
                        Delta
                      </div>
                      <div
                        style={{ fontSize: 16, fontWeight: 600, marginTop: 2, color: "#fcd34d" }}
                      >
                        {deltaLbs >= 0 ? "+" : "−"}
                        {deltaDisplay} {unit}
                        <span style={{ fontSize: 12, opacity: 0.8, marginLeft: 4 }}>
                          ({pct > 0 ? "+" : ""}
                          {pct}%)
                        </span>
                      </div>
                      <div className="cloud-text-dim" style={{ fontSize: 11, marginTop: 1 }}>
                        {direction}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div
                      className="cloud-text-dim"
                      style={{
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        fontWeight: 500,
                        marginBottom: 6,
                      }}
                    >
                      {x.references.length} prior{" "}
                      {x.references.length === 1 ? "point" : "points"} used for the average
                    </div>
                    <div
                      className="rounded-md overflow-hidden"
                      style={{ border: "1px solid var(--cloud-border)" }}
                    >
                      <table className="w-full" style={{ fontSize: 12 }}>
                        <thead style={{ background: "rgba(255,255,255,0.03)" }}>
                          <tr
                            className="cloud-text-dim"
                            style={{
                              fontSize: 10,
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              fontWeight: 500,
                            }}
                          >
                            <th className="text-left py-2 px-3">Where</th>
                            <th className="text-left py-2 px-3">Set</th>
                            <th className="text-right py-2 px-3">e1RM</th>
                            <th className="text-right py-2 px-3">Sheet</th>
                          </tr>
                        </thead>
                        <tbody>
                          {x.references.map((ref, i) => {
                            const refE1rm = Math.round(
                              convertWeight(ref.e1rm, unit),
                            );
                            const refWeight = Math.round(
                              convertWeight(ref.weight_lbs, unit),
                            );
                            const whereBits = [
                              ref.program_number != null
                                ? `P${ref.program_number}`
                                : null,
                              `W${ref.week_number}`,
                              ref.day_name
                                ? ref.day_name
                                : ref.day_number != null
                                ? `Day ${ref.day_number}`
                                : null,
                            ].filter(Boolean);
                            return (
                              <tr
                                key={i}
                                style={{ borderTop: "1px solid var(--cloud-border)" }}
                              >
                                <td className="py-2 px-3">
                                  <div className="cloud-text">{whereBits.join(" · ")}</div>
                                  <div className="cloud-text-dim" style={{ fontSize: 11 }}>
                                    {ref.exercise_name}
                                  </div>
                                </td>
                                <td className="py-2 px-3 cloud-text-muted">
                                  {refWeight} {unit} × {ref.reps}
                                  {ref.actual_rpe != null
                                    ? ` @ ${ref.actual_rpe}`
                                    : ""}
                                </td>
                                <td className="py-2 px-3 text-right cloud-text">
                                  {refE1rm} {unit}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  {ref.google_sheet_url ? (
                                    <a
                                      href={ref.google_sheet_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="hover:underline"
                                      style={{ color: "var(--cloud-primary)" }}
                                    >
                                      Open ↗
                                    </a>
                                  ) : (
                                    <span className="cloud-text-dim">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}


type MeetGroup = {
  key: string;
  meet_id: number | null;
  meet_name: string | null;
  meet_date: string | null;
  federation: string | null;
  weight_class: string | null;
  division: string | null;
  rows: Types.MeetResultEntry[];
};


function groupMeetResults(rows: Types.MeetResultEntry[]): MeetGroup[] {
  const groups: Map<string, MeetGroup> = new Map();
  for (const r of rows) {
    const key =
      r.meet_id != null
        ? `id:${r.meet_id}`
        : `nd:${r.meet_name ?? ""}|${r.meet_date ?? ""}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        meet_id: r.meet_id,
        meet_name: r.meet_name,
        meet_date: r.meet_date,
        federation: r.federation,
        weight_class: r.weight_class,
        division: r.division,
        rows: [],
      };
      groups.set(key, g);
    }
    g.rows.push(r);
  }
  
  return Array.from(groups.values()).sort((a, b) => {
    const ad = a.meet_date ?? "";
    const bd = b.meet_date ?? "";
    if (ad && bd) return bd.localeCompare(ad);
    if (ad) return -1;
    if (bd) return 1;
    return 0;
  });
}

// Render an OPL "YYYY-MM-DD" date as "Mon D, YYYY" without a TZ shift.
// Avoids `new Date("2026-03-26")` which Safari/Chrome interpret as UTC
// midnight and then locale-format back into the prior calendar day.
function formatMeetDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const parts = d.split("-");
  if (parts.length !== 3) return d;
  const [y, m, day] = parts.map(Number);
  if (!y || !m || !day) return d;
  const dt = new Date(y, m - 1, day);
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Render a meet placing with a medal for podium finishes. Non-podium
// numeric places fall back to the bare ordinal (4th, 5th...). Non-numeric
// values from OPL like "DQ", "G" (guest), "DD" (didn't deadlift) or blank
// return null so the caller can decide whether to render the chip at all.
function formatPlace(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    // Surface meaningful non-numeric tags rather than swallowing them, so
    // a DQ doesn't silently disappear from the meet history.
    const upper = trimmed.toUpperCase();
    if (upper === "DQ" || upper === "G" || upper === "DD") return upper;
    return null;
  }
  const ordinal = (() => {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
    switch (n % 10) {
      case 1: return `${n}st`;
      case 2: return `${n}nd`;
      case 3: return `${n}rd`;
      default: return `${n}th`;
    }
  })();
  if (n === 1) return `🥇 ${ordinal}`;
  if (n === 2) return `🥈 ${ordinal}`;
  if (n === 3) return `🥉 ${ordinal}`;
  return ordinal;
}

function MeetHistoryCard({
  athleteId,
  athlete,
  unit,
}: {
  athleteId: number;
  athlete: Types.AthleteResponse;
  unit: WeightUnit;
}) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["meet-results", athleteId],
    queryFn: () => apiClient.listMeetResults(athleteId),
    enabled: !!athlete,
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const groups = useMemo(() => groupMeetResults(rows), [rows]);

  const { resolvedMode } = useTheme();
  const chartGrid = resolvedMode === "dark" ? "rgba(255,255,255,0.06)" : "#e2e8f0";
  const chartText = resolvedMode === "dark" ? "rgba(250,250,250,0.5)" : "#64748b";
  const chartTooltipBg = resolvedMode === "dark" ? "#09090b" : "#ffffff";
  const chartTooltipBorder = resolvedMode === "dark" ? "rgba(255,255,255,0.18)" : "#e2e8f0";
  const chartLine = "#22d3ee";

  const [scorePrimary, setScorePrimary] = useState<"gl" | "dots">("gl");

  const totalsChartData = useMemo(() => {
    const points: Array<{
      ts: number;
      total: number;
      dots: number | null;
      gl: number | null;
      meet: string;
    }> = [];
    for (const g of groups) {
      if (!g.meet_date) continue;
      const parts = g.meet_date.split("-");
      if (parts.length !== 3) continue;
      const [y, m, d] = parts.map(Number);
      if (!y || !m || !d) continue;
      const ts = new Date(y, m - 1, d).getTime();
      if (!Number.isFinite(ts)) continue;

      const bestByLift: Record<string, number> = {};
      let dots: number | null = null;
      let gl: number | null = null;
      for (const r of g.rows) {
        if (!r.made) continue;
        const cur = bestByLift[r.lift];
        if (cur == null || r.weight_lbs > cur) bestByLift[r.lift] = r.weight_lbs;
        if (dots == null && r.dots_score != null) dots = r.dots_score;
        if (gl == null && r.gl_points != null) gl = r.gl_points;
      }
      const totalLbs =
        (bestByLift.squat ?? 0) +
        (bestByLift.bench ?? 0) +
        (bestByLift.deadlift ?? 0);
      if (totalLbs <= 0) continue;

      points.push({
        ts,
        total: Number(convertWeight(totalLbs, unit).toFixed(1)),
        dots: dots != null ? Number(dots.toFixed(2)) : null,
        gl: gl != null ? Number(gl.toFixed(2)) : null,
        meet: g.meet_name ?? "Meet",
      });
    }
    return points.sort((a, b) => a.ts - b.ts);
  }, [groups, unit]);

  const bestDots = useMemo(() => {
    let max = 0;
    for (const p of totalsChartData) {
      if (p.dots != null && p.dots > max) max = p.dots;
    }
    return max > 0 ? max : null;
  }, [totalsChartData]);

  const bestGl = useMemo(() => {
    let max = 0;
    for (const p of totalsChartData) {
      if (p.gl != null && p.gl > max) max = p.gl;
    }
    return max > 0 ? max : null;
  }, [totalsChartData]);

  const bestTotalDisplay = useMemo(() => {
    let max = 0;
    for (const p of totalsChartData) {
      if (p.total > max) max = p.total;
    }
    return max > 0 ? max : null;
  }, [totalsChartData]);

  // Per-group total in lbs, indexed the same as `groups` (which is sorted
  // newest-first). Used by the meet-history rows to compute a delta vs.
  // the prior chronological meet (groups[idx + 1] is the previous one).
  const groupTotalsLbs = useMemo(() => {
    return groups.map((g) => {
      const best: Record<string, number> = {};
      for (const r of g.rows) {
        if (!r.made) continue;
        const cur = best[r.lift];
        if (cur == null || r.weight_lbs > cur) best[r.lift] = r.weight_lbs;
      }
      return (best.squat ?? 0) + (best.bench ?? 0) + (best.deadlift ?? 0);
    });
  }, [groups]);

  // Default to GL primary when both exist; if only one is available, force
  // it as the primary so the user can't toggle to a missing value.
  const effectivePrimary: "gl" | "dots" =
    bestGl == null ? "dots" : bestDots == null ? "gl" : scorePrimary;
  const canToggleScore = bestGl != null && bestDots != null;

  if (isLoading) {
    return (
      <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
        <div className="cloud-panel-head">
          <h2>Meet History</h2>
        </div>
        <div className="cloud-text-muted" style={{ padding: "var(--cloud-s4)", fontSize: 13 }}>
          Loading meet history...
        </div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
        <div className="cloud-panel-head">
          <h2>Meet History</h2>
        </div>
        <p className="cloud-text-muted" style={{ padding: "var(--cloud-s4)", fontSize: 13 }}>
          No meet history yet. Use the three-dot menu above to link this athlete&apos;s
          OpenPowerlifting profile and their meet history will populate here.
        </p>
      </div>
    );
  }

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
      <div className="cloud-panel-head">
        <h2>Meet History</h2>
        <span className="cloud-text-muted" style={{ fontSize: 12 }}>
          {groups.length} meet{groups.length === 1 ? "" : "s"}
        </span>
      </div>
      {totalsChartData.length >= 2 && (
        <div style={{ padding: "var(--cloud-s4) var(--cloud-s4) 0" }}>
          <div className="flex items-start justify-between mb-2 gap-3 flex-wrap">
            <div
              className="cloud-text-dim"
              style={{
                fontSize: 10,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                fontWeight: 500,
              }}
            >
              Total progression
            </div>
            {bestTotalDisplay != null && (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  <span
                    className="cloud-text-dim"
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      fontWeight: 500,
                    }}
                  >
                    Best Total
                  </span>
                  <span
                    className="cloud-text font-semibold"
                    style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}
                  >
                    {Math.round(bestTotalDisplay)} {unit}
                  </span>
                </div>
                {(bestDots != null || bestGl != null) && (
                  <button
                    type="button"
                    onClick={() =>
                      canToggleScore &&
                      setScorePrimary((p) => (p === "gl" ? "dots" : "gl"))
                    }
                    disabled={!canToggleScore}
                    className="flex items-center gap-2 transition-colors"
                    style={{
                      cursor: canToggleScore ? "pointer" : "default",
                      background: "transparent",
                      border: "none",
                      padding: 0,
                    }}
                    title={canToggleScore ? "Swap primary score" : undefined}
                  >
                    <span
                      className="cloud-text-dim"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        fontWeight: 500,
                      }}
                    >
                      Best {effectivePrimary === "gl" ? "IPF GL" : "DOTS"}
                    </span>
                    <span
                      className="cloud-text font-semibold"
                      style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}
                    >
                      {(effectivePrimary === "gl" ? bestGl : bestDots)?.toFixed(2)}
                    </span>
                    {((effectivePrimary === "gl" && bestDots != null) ||
                      (effectivePrimary === "dots" && bestGl != null)) && (
                      <>
                        <span className="cloud-text-dim" style={{ fontSize: 11 }}>/</span>
                        <span
                          className="cloud-text-dim"
                          style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
                        >
                          {(effectivePrimary === "gl" ? bestDots : bestGl)?.toFixed(2)}{" "}
                          {effectivePrimary === "gl" ? "DOTS" : "IPF GL"}
                        </span>
                      </>
                    )}
                    {canToggleScore && (
                      <span className="cloud-text-dim" style={{ fontSize: 12 }} aria-hidden>
                        ⇄
                      </span>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height={224}>
              <LineChart data={totalsChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                <XAxis
                  dataKey="ts"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tick={{ fontSize: 11, fill: chartText }}
                  tickLine={false}
                  tickFormatter={(ts: number) =>
                    new Date(ts).toLocaleDateString("en-US", {
                      month: "short",
                      year: "2-digit",
                    })
                  }
                />
                <YAxis
                  tick={{ fontSize: 11, fill: chartText }}
                  tickLine={false}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => `${Math.round(v)}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartTooltipBg,
                    border: `1px solid ${chartTooltipBorder}`,
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelFormatter={(label, payload) => {
                    const ts = Number(label);
                    const dateStr = Number.isFinite(ts)
                      ? new Date(ts).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "";
                    const meet =
                      payload && payload[0]
                        ? (payload[0].payload as { meet?: string }).meet
                        : null;
                    return meet ? `${meet} · ${dateStr}` : dateStr;
                  }}
                  formatter={(value, _name, item) => {
                    const v = Number(value);
                    const point = item?.payload as
                      | { dots?: number | null; gl?: number | null }
                      | undefined;
                    const score =
                      effectivePrimary === "gl" ? point?.gl : point?.dots;
                    const scoreLabel =
                      effectivePrimary === "gl" ? "IPF GL" : "DOTS";
                    const suffix =
                      score != null
                        ? ` · ${scoreLabel} ${score.toFixed(2)}`
                        : "";
                    return [`${Math.round(v)} ${unit}${suffix}`, "Total"];
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke={chartLine}
                  strokeWidth={2}
                  dot={{ r: 3, fill: chartLine }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div className="space-y-3" style={{ padding: "var(--cloud-s4)" }}>
        {groups.map((g, idx) => {
          // Delta vs. the prior chronological meet. groups is desc by date,
          // so the earlier meet is at idx + 1. Skip the very first meet
          // (oldest, idx === groups.length - 1) since there's nothing to
          // compare to. Convert to display unit so the +/- respects the
          // lbs/kg toggle at the top of the page.
          const priorTotalLbs =
            idx < groups.length - 1 ? groupTotalsLbs[idx + 1] : null;
          const currentTotalLbs = groupTotalsLbs[idx];
          const deltaLbs =
            priorTotalLbs != null && priorTotalLbs > 0 && currentTotalLbs > 0
              ? currentTotalLbs - priorTotalLbs
              : null;
          const deltaDisplay =
            deltaLbs != null
              ? Math.round(convertWeight(Math.abs(deltaLbs), unit))
              : null;
          const deltaSign = deltaLbs != null && deltaLbs >= 0 ? "+" : "−";
          const deltaColor =
            deltaLbs == null || deltaLbs === 0
              ? null
              : deltaLbs > 0
                ? "#86efac"
                : "var(--cloud-text-dim)";

          const bestByLift: Record<string, Types.MeetResultEntry | undefined> = {};
          for (const r of g.rows) {
            if (!r.made) continue;
            const cur = bestByLift[r.lift];
            if (!cur || r.weight_lbs > cur.weight_lbs) bestByLift[r.lift] = r;
          }
          const total =
            (bestByLift.squat?.weight_lbs ?? 0) +
            (bestByLift.bench?.weight_lbs ?? 0) +
            (bestByLift.deadlift?.weight_lbs ?? 0);
          const lifts = ["squat", "bench", "deadlift"] as const;
          const isOpen = expanded.has(g.key);
          let groupDots: number | null = null;
          let groupGl: number | null = null;
          for (const r of g.rows) {
            if (groupDots == null && r.dots_score != null) groupDots = r.dots_score;
            if (groupGl == null && r.gl_points != null) groupGl = r.gl_points;
            if (groupDots != null && groupGl != null) break;
          }
          // Distinct (division, place) pairs for this meet, restricted to
          // entries where OPL recorded an actual place. The "no-place" rows
          // are usually shadow division entries that OPL emits for meets
          // like High School Nationals (e.g., a Teen II age-bracket row
          // alongside the real Varsity placement) — they're noise, not
          // rankings, so we drop them.
          const placements: Array<{ division: string | null; place: string }> = [];
          const seenPlacement = new Set<string>();
          for (const r of g.rows) {
            if (!r.place || !String(r.place).trim()) continue;
            const div = r.division ?? null;
            const pl = String(r.place).trim();
            const key = `${div}|${pl}`;
            if (seenPlacement.has(key)) continue;
            seenPlacement.add(key);
            placements.push({ division: div, place: pl });
          }
          // Federation/weight class can vary across the per-division rows
          // OPL emits for one meet (the placed entry usually has them set
          // while the shadow age-bracket entry leaves them blank). Prefer
          // any non-null value across the group rather than whichever row
          // groupMeetResults happened to see first.
          const groupFederation =
            g.federation ?? g.rows.find((r) => r.federation)?.federation ?? null;
          const groupWeightClass =
            g.weight_class ?? g.rows.find((r) => r.weight_class)?.weight_class ?? null;
          const attemptMap: Record<string, Record<number, Types.MeetResultEntry>> = {
            squat: {},
            bench: {},
            deadlift: {},
          };
          for (const r of g.rows) {
            if (r.lift in attemptMap) {
              attemptMap[r.lift][r.attempt_number] = r;
            }
          }

          const liftTint: Record<string, string> = {
            squat: "#fb923c",
            bench: "#22d3ee",
            deadlift: "#a78bfa",
          };
          return (
            <div
              key={g.key}
              className="rounded-md"
              style={{
                border: "1px solid var(--cloud-border)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <button
                type="button"
                onClick={() => toggleExpanded(g.key)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-[rgba(255,255,255,0.03)] transition-colors rounded-t-md"
              >
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 cloud-text-dim shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 cloud-text-dim shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div
                    className="cloud-text font-medium flex flex-wrap items-baseline gap-x-3 gap-y-0.5"
                    style={{ fontSize: 13 }}
                  >
                    <span className="truncate">{g.meet_name ?? "Unnamed meet"}</span>
                    {placements.map((p, i) => {
                      const placeLabel = formatPlace(p.place);
                      if (!placeLabel) return null;
                      return (
                        <span
                          key={`${p.division}-${p.place}-${i}`}
                          className="inline-flex items-center gap-1 cloud-text"
                          style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}
                        >
                          <span>{placeLabel}</span>
                          {p.division && (
                            <span className="cloud-text font-normal">{p.division}</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                  <div className="cloud-text-dim truncate" style={{ fontSize: 11 }}>
                    {[
                      groupFederation,
                      groupWeightClass,
                      g.meet_date ? formatMeetDate(g.meet_date) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="cloud-text font-semibold flex items-baseline justify-end gap-1.5" style={{ fontSize: 13 }}>
                    {deltaDisplay != null && deltaColor != null && deltaDisplay > 0 && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: deltaColor,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {deltaSign}
                        {deltaDisplay} {unit}
                      </span>
                    )}
                    <span>{total > 0 ? formatWeight(total, unit) : "—"}</span>
                  </div>
                  <div
                    className="cloud-text-dim"
                    style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}
                  >
                    Total
                  </div>
                  {(groupDots != null || groupGl != null) && (
                    <div
                      className="cloud-text-dim"
                      style={{
                        fontSize: 10,
                        marginTop: 2,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {groupDots != null && <>DOTS {groupDots.toFixed(2)}</>}
                      {groupDots != null && groupGl != null && " · "}
                      {groupGl != null && <>GL {groupGl.toFixed(2)}</>}
                    </div>
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-[color:var(--cloud-border)] p-3">
                  <div
                    className="grid grid-cols-[80px_repeat(3,minmax(0,1fr))_80px] gap-2 items-center mb-1.5 cloud-text-dim"
                    style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}
                  >
                    <div />
                    <div className="text-center">A1</div>
                    <div className="text-center">A2</div>
                    <div className="text-center">A3</div>
                    <div className="text-right">Best</div>
                  </div>
                  {lifts.map((lift) => {
                    const best = bestByLift[lift];
                    return (
                      <div
                        key={lift}
                        className="grid grid-cols-[80px_repeat(3,minmax(0,1fr))_80px] gap-2 items-center py-1.5"
                      >
                        <div
                          className="capitalize font-medium"
                          style={{ fontSize: 12, color: liftTint[lift] }}
                        >
                          {lift}
                        </div>
                        {[1, 2, 3].map((n) => {
                          const r = attemptMap[lift][n];
                          if (!r) {
                            return (
                              <div
                                key={n}
                                className="text-center cloud-text-dim"
                                style={{ fontSize: 13 }}
                              >
                                —
                              </div>
                            );
                          }
                          const isBest = best && r.id === best.id;
                          
                          
                          
                          
                          
                          const cellStyle: CSSProperties = r.made
                            ? isBest
                              ? {
                                  background: "rgba(34, 197, 94, 0.15)",
                                  color: "#86efac",
                                  border: "1px solid rgba(34, 197, 94, 0.3)",
                                  fontWeight: 600,
                                }
                              : { color: "#86efac" }
                            : { color: "#fca5a5", textDecoration: "line-through" };
                          return (
                            <div
                              key={n}
                              className="text-center rounded px-1 py-0.5"
                              style={{ fontSize: 13, ...cellStyle }}
                            >
                              {formatWeight(r.weight_lbs, unit, { unitless: true })}
                              <span className="cloud-text-dim ml-0.5" style={{ fontSize: 10 }}>
                                {unit}
                              </span>
                            </div>
                          );
                        })}
                        <div className="text-right cloud-text font-medium" style={{ fontSize: 13 }}>
                          {best ? formatWeight(best.weight_lbs, unit, { unitless: true }) : "—"}
                        </div>
                      </div>
                    );
                  })}

                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PRHistoryTimeline({
  athleteId,
  unit,
  athleteName,
}: {
  athleteId: number;
  unit: WeightUnit;
  athleteName?: string | null;
}) {
  const [liftFilter, setLiftFilter] = useState<string>("all");
  const [selectedPR, setSelectedPR] = useState<Types.MaxHistoryEntry | null>(null);
  const { data: programs } = useQuery({
    queryKey: ["programs", athleteId],
    queryFn: () => apiClient.listPrograms(athleteId),
  });
  
  
  
  const [repFilter, setRepFilter] = useState<string>("all");
  
  
  const [exerciseFilter, setExerciseFilter] = useState<string>("all");
  
  
  
  
  const [showAllEvents, setShowAllEvents] = useState(false);
  const { data: history = [], isLoading } = useQuery({
    queryKey: ["max-history", athleteId],
    queryFn: () => apiClient.getMaxHistory(athleteId),
  });
  
  
  
  const { data: aliasGroups = [] } = useQuery({
    queryKey: ["exercise-aliases"],
    queryFn: () => apiClient.listExerciseAliases(),
  });
  const displayNameFor = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of aliasGroups) {
      for (const alias of group.aliases) {
        map.set(alias.alias_name.toLowerCase(), group.primary_name);
      }
    }
    return (name: string | null | undefined): string => {
      if (!name) return "";
      return map.get(name.toLowerCase()) ?? name;
    };
  }, [aliasGroups]);

  if (isLoading) {
    return (
      <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
        <div className="cloud-panel-head">
          <h2>PR History</h2>
        </div>
        <div className="cloud-text-muted" style={{ padding: "var(--cloud-s4)", fontSize: 13 }}>
          Loading PR history...
        </div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
        <div className="cloud-panel-head">
          <h2>PR History</h2>
        </div>
        <p className="cloud-text-muted" style={{ padding: "var(--cloud-s4)", fontSize: 13 }}>
          No max changes recorded yet. History will be tracked automatically when maxes are updated.
        </p>
      </div>
    );
  }

  
  const prsOnly = history.filter((h) => {
    if (h.old_value == null) return true; 
    return h.new_value > h.old_value;
  });
  
  
  
  
  
  const collapsed = (() => {
    if (showAllEvents) return prsOnly;
    const seen = new Set<string>();
    const result: typeof prsOnly = [];
    for (const h of prsOnly) {
      const key = h.lift === "total"
        ? "total"
        : `${h.lift}|${h.exercise_name ?? ""}|${h.reps ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(h);
    }
    return result;
  })();
  
  
  const filtered = collapsed.filter((h) => {
    if (liftFilter !== "all" && h.lift !== liftFilter) return false;
    if (repFilter !== "all") {
      if (repFilter === "total") {
        if (h.lift !== "total") return false;
      } else if (String(h.reps ?? "") !== repFilter) {
        return false;
      }
    }
    if (exerciseFilter !== "all" && displayNameFor(h.exercise_name) !== exerciseFilter) return false;
    return true;
  });
  const lifts = ["all", "squat", "bench", "deadlift", "total"];

  
  
  const availableReps: number[] = Array.from(
    new Set(
      collapsed
        .filter((h) => h.reps != null && (liftFilter === "all" || h.lift === liftFilter))
        .map((h) => h.reps as number)
    )
  ).sort((a, b) => a - b);
  const availableExercises: string[] = Array.from(
    new Set(
      collapsed
        .filter(
          (h) =>
            h.exercise_name &&
            (liftFilter === "all" || h.lift === liftFilter) &&
            (repFilter === "all" || String(h.reps ?? "") === repFilter)
        )
        .map((h) => displayNameFor(h.exercise_name))
    )
  ).sort();

  
  
  
  const liftColor: Record<string, string> = {
    squat: "text-orange-400 border-orange-400/30 bg-orange-400/10",
    bench: "text-cyan-400 border-cyan-400/30 bg-cyan-400/10",
    deadlift: "text-violet-400 border-violet-400/30 bg-violet-400/10",
    total: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  };

  return (
    <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
      <div className="cloud-panel-head" style={{ flexWrap: "wrap", gap: "var(--cloud-s3)" }}>
        <div className="flex items-center" style={{ gap: "var(--cloud-s2)" }}>
          <h2>PR History</h2>
          <div className="relative group">
            <Info className="w-3.5 h-3.5 cloud-text-muted cursor-help" />
            <div
              className="absolute bottom-full left-0 mb-2 w-72 p-3 rounded-md cloud-panel-raised cloud-text-muted z-10 hidden group-hover:block pointer-events-none"
              style={{
                fontSize: 12,
                lineHeight: 1.45,
                boxShadow: "0 20px 40px -16px rgba(0,0,0,0.6), 0 8px 16px -4px rgba(0,0,0,0.4)",
              }}
            >
              <p className="cloud-text font-medium mb-1.5" style={{ fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                How PR History is calculated
              </p>
              <p className="mb-1.5">
                <span className="cloud-text font-medium">Rep PRs:</span> tracked per (exercise, rep count) for reps 1–10 on squat / bench / deadlift variations. 350 × 3 records as a 3RM, 405 × 1 as a 1RM — separate lanes so progress on close-grip bench doesn&apos;t get mashed into competition bench.
              </p>
              <p>
                <span className="cloud-text font-medium">Total:</span> Training total — best top set of any rep count across all three primary lifts per session, summed together.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center flex-wrap" style={{ gap: "var(--cloud-s2)" }}>
          <div className="cloud-tabs" role="tablist" aria-label="Lift filter">
            {lifts.map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={liftFilter === l}
                onClick={() => setLiftFilter(l)}
                className="cloud-tab"
              >
                {l === "all" ? "All" : l.charAt(0).toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
          <select
            value={repFilter}
            onChange={(e) => {
              setRepFilter(e.target.value);
              setExerciseFilter("all");
            }}
            className="cloud-btn cloud-btn-ghost"
            style={{ colorScheme: "dark", padding: "4px var(--cloud-s2)", fontSize: 12 }}
            title="Filter by rep count"
          >
            <option value="all">All reps</option>
            {availableReps.map((r) => (
              <option key={r} value={String(r)}>
                {r}RM
              </option>
            ))}
            {collapsed.some((h) => h.lift === "total") && (
              <option value="total">Training total</option>
            )}
          </select>
          {availableExercises.length > 1 && (
            <select
              value={exerciseFilter}
              onChange={(e) => setExerciseFilter(e.target.value)}
              className="cloud-btn cloud-btn-ghost max-w-[180px]"
              style={{ colorScheme: "dark", padding: "4px var(--cloud-s2)", fontSize: 12 }}
              title="Filter by exercise variation"
            >
              <option value="all">All variations</option>
              {availableExercises.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setShowAllEvents((v) => !v)}
            className="cloud-btn cloud-btn-ghost"
            style={{
              padding: "4px var(--cloud-s2)",
              fontSize: 12,
              color: showAllEvents ? "var(--cloud-primary-text)" : undefined,
              borderColor: showAllEvents ? "rgba(12, 92, 171, 0.35)" : undefined,
              background: showAllEvents ? "rgba(12, 92, 171, 0.18)" : undefined,
            }}
            title={
              showAllEvents
                ? "Showing every PR event — each time the prior best was beaten."
                : "Showing the current best per (lift, exercise, reps). Click to see full progression history."
            }
          >
            {showAllEvents ? "All events" : "Current best"}
          </button>
        </div>
      </div>

      <div className="cloud-thin-scroll" style={{ maxHeight: 320, overflowY: "auto", padding: "var(--cloud-s3) var(--cloud-s4) var(--cloud-s4)" }}>
        {filtered.map((entry) => {
          
          
          
          const diffLbs =
            entry.old_value != null ? entry.new_value - entry.old_value : null;
          const diffDisplay =
            diffLbs != null ? Math.round(convertWeight(diffLbs, unit)) : null;
          const isIncrease = diffDisplay !== null && diffDisplay > 0;
          const dateStr = new Date(entry.recorded_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          const colorClass =
            liftColor[entry.lift] ||
            "cloud-text-muted border-[color:var(--cloud-border)] bg-[rgba(255,255,255,0.03)]";

          
          
          
          const repLabel =
            entry.reps != null
              ? `${entry.reps}RM`
              : entry.lift === "total"
              ? "Total"
              : null;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSelectedPR(entry)}
              title="See full progression"
              className="w-full text-left flex items-center gap-3 px-2 -mx-2 py-2 rounded border-b border-[color:var(--cloud-border)] last:border-0 hover:bg-[rgba(255,255,255,0.03)] transition-colors"
            >
              <span
                className={`font-medium px-2 py-0.5 rounded border ${colorClass}`}
                style={{ fontSize: 11, letterSpacing: "0.02em" }}
              >
                {entry.lift.charAt(0).toUpperCase() + entry.lift.slice(1)}
              </span>
              {repLabel && (
                <span
                  className="font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  style={{ fontSize: 10, letterSpacing: "0.04em" }}
                >
                  {repLabel}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  {entry.old_value != null && (
                    <span className="cloud-text-dim" style={{ fontSize: 13 }}>
                      {formatWeight(entry.old_value, unit)}
                    </span>
                  )}
                  {entry.old_value != null && (
                    <span className="cloud-text-dim" style={{ fontSize: 12 }}>&rarr;</span>
                  )}
                  <span className="cloud-text font-medium" style={{ fontSize: 13 }}>
                    {formatWeight(entry.new_value, unit)}
                  </span>
                  {entry.reps != null && entry.reps > 1 && (
                    <span className="cloud-text-dim" style={{ fontSize: 12 }}>
                      × {entry.reps}
                    </span>
                  )}
                  {diffDisplay !== null && (
                    <span
                      className="font-medium"
                      style={{
                        fontSize: 12,
                        color: isIncrease ? "#86efac" : "#fca5a5",
                      }}
                    >
                      ({isIncrease ? "+" : ""}{diffDisplay} {unit})
                    </span>
                  )}
                </div>
                {}
                {entry.exercise_name ? (
                  <p className="cloud-text-dim truncate" style={{ fontSize: 12 }} title={entry.exercise_name}>
                    {entry.exercise_name}
                    {entry.note && (
                      <span className="opacity-75"> · {entry.note}</span>
                    )}
                  </p>
                ) : (
                  entry.note && (
                    <p className="cloud-text-dim truncate" style={{ fontSize: 12 }}>
                      {entry.note}
                    </p>
                  )
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="cloud-text-dim" style={{ fontSize: 12 }}>{dateStr}</p>
                <p className="cloud-text-dim" style={{ fontSize: 11 }}>{entry.source}</p>
              </div>
            </button>
          );
        })}
      </div>
      <PRDetailModal
        open={!!selectedPR}
        onClose={() => setSelectedPR(null)}
        pr={selectedPR}
        allHistory={history}
        athleteName={athleteName ?? null}
        unit={unit}
        programIndex={programs?.map((p) => ({
          id: p.id,
          program_number: p.program_number ?? null,
          program_name: p.program_name ?? null,
        }))}
        programSheetUrls={
          programs
            ? Object.fromEntries(programs.map((p) => [p.id, p.google_sheet_url ?? null]))
            : undefined
        }
      />
    </div>
  );
}


function RPEComplianceCard({ athleteId }: { athleteId: number }) {
  const { data: rpeData, isLoading } = useQuery({
    queryKey: ["rpe-compliance", athleteId],
    queryFn: () => apiClient.getRPECompliance(athleteId),
  });

  
  
  if (rpeData && rpeData.enabled === false) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
        <div className="cloud-panel-head">
          <h2>RPE Compliance</h2>
        </div>
        <div className="cloud-text-muted" style={{ padding: "var(--cloud-s4)", fontSize: 13 }}>
          Loading RPE compliance data...
        </div>
      </div>
    );
  }

  if (!rpeData || rpeData.total_prescribed === 0) {
    return (
      <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
        <div className="cloud-panel-head">
          <h2>RPE Compliance</h2>
        </div>
        <div className="cloud-text-muted" style={{ padding: "var(--cloud-s4)", fontSize: 13 }}>
          No RPE targets have been prescribed yet.
        </div>
      </div>
    );
  }

  if (rpeData.total_entries === 0) {
    return (
      <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
        <div className="cloud-panel-head">
          <h2>RPE Compliance</h2>
        </div>
        <div style={{ padding: "var(--cloud-s4)" }}>
          <div className="cloud-text-muted" style={{ fontSize: 13, marginBottom: 4 }}>
            {rpeData.total_prescribed} RPE targets prescribed — athlete hasn&apos;t logged actual RPEs yet.
          </div>
          <div className="cloud-text-dim" style={{ fontSize: 12 }}>
            Compliance stats will appear once actual RPEs are recorded.
          </div>
        </div>
      </div>
    );
  }

  
  
  
  const getColorByDiff = (diff: number): string => {
    const absDiff = Math.abs(diff);
    if (absDiff < 0.25) return "#86efac"; 
    if (absDiff < 0.5) return "#93c5fd";  
    if (absDiff < 1.0) return "#fcd34d";  
    return "#fca5a5";                     
  };

  const getStatusByDiff = (diff: number) => {
    const absDiff = Math.abs(diff);
    if (diff > 0) {
      if (absDiff < 0.5) return "slight overshoot";
      if (absDiff < 1.0) return "moderate overshoot";
      return "significant overshoot";
    } else if (diff < 0) {
      if (absDiff < 0.5) return "slight undershoot";
      if (absDiff < 1.0) return "moderate undershoot";
      return "significant undershoot";
    }
    return "on target";
  };

  
  const getConfidenceLabel = (fillRate: number): { label: string; color: string } => {
    if (fillRate >= 70) return { label: "High confidence", color: "#86efac" };
    if (fillRate >= 40) return { label: "Medium confidence", color: "#fcd34d" };
    return { label: "Low confidence", color: "#fca5a5" };
  };

  const confidence = getConfidenceLabel(rpeData.fill_rate_pct);

  const liftOrder = ["squat", "bench", "deadlift"];
  const sortedByLift = [...rpeData.by_lift].sort((a, b) => {
    const aIdx = liftOrder.indexOf(a.lift_category.toLowerCase());
    const bIdx = liftOrder.indexOf(b.lift_category.toLowerCase());
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  return (
    <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
      <div className="cloud-panel-head">
        <h2>RPE Compliance</h2>
      </div>

      <div className="space-y-6" style={{ padding: "var(--cloud-s4)" }}>
        {}
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid var(--cloud-border)",
            borderRadius: "var(--cloud-r-md)",
            padding: "var(--cloud-s4)",
          }}
        >
          <div className="flex items-baseline justify-between mb-2">
            <span
              className="cloud-text-dim"
              style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}
            >
              Average RPE Difference
            </span>
            <span
              className="font-semibold"
              style={{
                fontSize: 24,
                letterSpacing: "-0.02em",
                color: getColorByDiff(rpeData.avg_rpe_diff),
              }}
            >
              {rpeData.avg_rpe_diff > 0 ? "+" : ""}{rpeData.avg_rpe_diff.toFixed(2)}
            </span>
          </div>
          <p className="cloud-text-muted" style={{ fontSize: 12, marginBottom: 4 }}>
            {rpeData.total_entries} of {rpeData.total_prescribed} prescribed sets logged ({rpeData.fill_rate_pct}% fill rate)
          </p>
          <p className="cloud-text-muted" style={{ fontSize: 12 }}>
            {rpeData.on_target_count} on target, {rpeData.overshoot_count} overshoot, {rpeData.undershoot_count} undershoot
          </p>
          <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
            <div className="cloud-text-muted" style={{ fontSize: 12 }}>
              Tends to {getStatusByDiff(rpeData.avg_rpe_diff)} prescribed RPE targets.
            </div>
            <div className="font-medium" style={{ fontSize: 11, color: confidence.color }}>
              {confidence.label}
            </div>
          </div>
        </div>

        {}
        {sortedByLift.length > 0 && (
          <div className="space-y-2">
            <h3
              className="cloud-text-dim"
              style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}
            >
              By Lift
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {sortedByLift.map((lift) => {
                const liftLower = lift.lift_category.toLowerCase();
                const liftColor = LIFT_COLORS[liftLower] || "var(--cloud-text-dim)";
                const liftConf = getConfidenceLabel(lift.fill_rate_pct);
                return (
                  <div
                    key={lift.lift_category}
                    className="flex items-center justify-between"
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid var(--cloud-border)",
                      borderRadius: "var(--cloud-r-sm)",
                      padding: "var(--cloud-s3)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-2.5 h-2.5 rounded-sm"
                        style={{ backgroundColor: liftColor }}
                      />
                      <div>
                        <div
                          className="font-medium capitalize"
                          style={{ fontSize: 13, color: liftColor }}
                        >
                          {lift.lift_category}
                        </div>
                        <div className="cloud-text-muted" style={{ fontSize: 11 }}>
                          {lift.total_entries}/{lift.total_prescribed} filled &middot; {lift.fill_rate_pct}%
                          <span className="ml-2" style={{ color: liftConf.color }}>{liftConf.label}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className="font-semibold"
                        style={{ fontSize: 14, color: getColorByDiff(lift.avg_rpe_diff) }}
                      >
                        {lift.avg_rpe_diff > 0 ? "+" : ""}{lift.avg_rpe_diff.toFixed(2)}
                      </div>
                      <div className="cloud-text-muted" style={{ fontSize: 11 }}>
                        {getStatusByDiff(lift.avg_rpe_diff)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


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


function WeightChangeStat({
  label,
  valueLbs,
  unit,
}: {
  label: string;
  valueLbs: number;
  unit: WeightUnit;
}) {
  const Icon = valueLbs > 0 ? TrendingUp : valueLbs < 0 ? TrendingDown : Minus;
  const sign = valueLbs > 0 ? "+" : valueLbs < 0 ? "−" : "";
  return (
    <div>
      <div
        className="cloud-text-dim mb-0.5"
        style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}
      >
        {label}
      </div>
      <div className="flex items-center gap-1 cloud-text font-semibold" style={{ fontSize: 18, letterSpacing: "-0.01em" }}>
        <Icon className="w-4 h-4" />
        <span>
          {sign}
          {formatWeight(Math.abs(valueLbs), unit, { decimals: 1 })}
        </span>
      </div>
    </div>
  );
}


function BodyMetricsCard({
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
                    domain={["dataMin - 2", "dataMax + 2"]}
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
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      label={{
                        value: `Class Cap ${round1(capDisplay)}`,
                        position: "insideBottomRight",
                        fill: "#fcd34d",
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


export default function AthleteDetailPage() {
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const { features } = useAuth();
  const athleteId = parseInt(params.id as string, 10);
  const portalAvailable = features.includes("portal");

  
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSettingAvailability, setIsSettingAvailability] = useState(false);
  const [availabilityForm, setAvailabilityForm] = useState<{ out_from: string; out_through: string }>({ out_from: "", out_through: "" });
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Types.AthleteUpdate>({});

  
  
  const [localProgramDue, setLocalProgramDue] = useState<string>("");
  const [localReminderDays, setLocalReminderDays] = useState<number>(0);

  
  const [programSearch, setProgramSearch] = useState("");
  const [programSortNewest, setProgramSortNewest] = useState(true);

  
  const { data: settingsData } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiClient.getSettings(),
    staleTime: 60000,
  });
  
  
  
  
  const saveCustomWeightClasses = useMutation({
    mutationFn: (payload: Record<string, string>) => apiClient.updateSettings(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
  const addCustomWeightClass = useCallback(
    (sex: AthleteSex, rawValue: string) => {
      const value = rawValue.trim();
      if (!value) return;
      const key = customWeightClassesKey(sex);
      const existing = parseCustomClasses(settingsData?.[key]);
      if (existing.includes(value)) return;
      const next = serializeCustomClasses([...existing, value]);
      saveCustomWeightClasses.mutate({ [key]: next });
    },
    [settingsData, saveCustomWeightClasses]
  );

  // Weight-unit preference: browser override > global default_unit setting > lbs.
  const localUnit = useLocalWeightUnit();
  const unit: WeightUnit = resolveWeightUnit(localUnit, settingsData?.default_unit);

  
  const [showPrimaryDaysDialog, setShowPrimaryDaysDialog] = useState(false);

  
  
  const [isUpdatingMaxes, setIsUpdatingMaxes] = useState(false);
  const [isShowingDetails, setIsShowingDetails] = useState(false);

  
  const [highlightedExercise, setHighlightedExercise] = useState<HighlightedExercise | null>(null);

  
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [selectedMergeTarget, setSelectedMergeTarget] = useState<Types.AthleteListResponse | null>(null);
  const [mergePreview, setMergePreview] = useState<Types.MergePreview | null>(null);
  const [mergeNameChoice, setMergeNameChoice] = useState<string>("");
  const [mergeStep, setMergeStep] = useState<"search" | "preview">("search");

  
  const {
    data: athlete,
    isLoading: athleteLoading,
    error: athleteError,
  } = useQuery({
    queryKey: ["athlete", athleteId],
    queryFn: () => apiClient.getAthlete(athleteId),
  });

  
  const {
    data: programs = [],
    isLoading: programsLoading,
  } = useQuery({
    queryKey: ["athlete-programs", athleteId],
    queryFn: () => apiClient.listPrograms(athleteId),
    enabled: !!athlete,
  });

  
  
  
  
  
  const { data: wellnessForMenu } = useQuery({
    queryKey: ["wellness", athleteId],
    queryFn: () => apiClient.getAthleteWellness(athleteId),
    enabled: !!athlete && !athlete.body_metrics_hidden,
  });
  const recentWellnessEntryCount = (() => {
    if (!wellnessForMenu) return 0;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    return wellnessForMenu.data.filter(
      (d) =>
        (d.date || "") >= cutoffStr &&
        (d.bodyweight_lbs !== null || d.actual_calories !== null)
    ).length;
  })();

  // Single OPL link/manage dialog. The legacy "Log Meet Results" modal
  // (LogMeetResultsDialog further up in the file) is no longer rendered;
  // OpenPowerlifting is now the canonical source for meet history.
  const [isOplDialogOpen, setIsOplDialogOpen] = useState(false);
  
  
  
  const showCompMaxes = useSyncExternalStore(
    subscribeToCompMaxesPref,
    getCompMaxesPref,
    getCompMaxesPrefServer
  );
  const toggleCompMaxes = useCallback(() => {
    if (typeof window === "undefined") return;
    const next = !showCompMaxes;
    window.localStorage.setItem("bestrong.showCompMaxes", String(next));
    window.dispatchEvent(new Event("bestrong:compMaxesPrefChanged"));
  }, [showCompMaxes]);

  const { data: compMaxes = [] } = useQuery({
    queryKey: ["competition-maxes", athleteId],
    queryFn: () => apiClient.getCompetitionMaxes(athleteId),
    enabled: !!athlete,
  });
  const compMaxByLift = useMemo(() => {
    const m: Record<string, Types.CompetitionMaxForLift> = {};
    for (const c of compMaxes) m[c.lift] = c;
    return m;
  }, [compMaxes]);

  
  
  
  
  const { data: estimatedMaxes = [] } = useQuery({
    queryKey: ["estimated-max", athleteId],
    queryFn: () => apiClient.getEstimatedMax(athleteId),
    enabled: !!athlete,
  });
  const estMaxByLift = useMemo(() => {
    const m: Record<string, Types.EstimatedMaxForLift> = {};
    for (const e of estimatedMaxes) m[e.lift] = e;
    return m;
  }, [estimatedMaxes]);

  
  const filteredPrograms = useMemo(() => {
    let filtered = programs;
    if (programSearch.trim()) {
      const q = programSearch.toLowerCase();
      filtered = filtered.filter(p =>
        (p.program_name || '').toLowerCase().includes(q) ||
        (p.block_type || '').toLowerCase().includes(q)
      );
    }
    
    
    
    const toTime = (p: typeof filtered[number]) => {
      const raw = p.date_start || p.imported_at || '';
      if (!raw) return 0;
      const t = new Date(raw).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    return [...filtered].sort((a, b) => {
      const timeA = toTime(a);
      const timeB = toTime(b);
      return programSortNewest ? timeB - timeA : timeA - timeB;
    });
  }, [programs, programSearch, programSortNewest]);

  const now = useNow();
  const lastSyncedAt = (() => {
    if (!athlete?.last_synced_at) return null;
    const t = new Date(athlete.last_synced_at).getTime();
    return Number.isNaN(t) ? null : t;
  })();

  const lastSyncedRelative = useMemo(() => {
    if (!lastSyncedAt) return null;
    const diffSec = (now - lastSyncedAt) / 1000;
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
  }, [lastSyncedAt, now]);

  
  const { data: allAthletes = [] } = useQuery({
    queryKey: ["athletes-for-merge"],
    queryFn: () => apiClient.listAthletes(true),
    enabled: showMergeDialog,
  });

  
  const mergeMutation = useMutation({
    mutationFn: () =>
      apiClient.mergeAthletes(athleteId, selectedMergeTarget!.id, mergeNameChoice || undefined),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["athlete", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["athlete-programs", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["athlete-prs", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["athletes"] });
      setShowMergeDialog(false);
      setMergeStep("search");
      setSelectedMergeTarget(null);
      setMergePreview(null);
      setMergeSearch("");
      setSuccessMessage(
        `Merged successfully. ${result.programs_transferred} programs transferred. Total: ${result.total_programs} programs.`
      );
      setTimeout(() => setSuccessMessage(null), 5000);
    },
  });

  
  const updateMutation = useMutation({
    mutationFn: (data: Types.AthleteUpdate) =>
      apiClient.updateAthlete(athleteId, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["athlete", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["athletes"] });
      
      if (variables.program_due !== undefined) {
        queryClient.invalidateQueries({ queryKey: ["notification-count"] });
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }
      setSuccessMessage("Athlete updated successfully");
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  
  const archiveMutation = useMutation({
    mutationFn: () => apiClient.archiveAthlete(athleteId),
    onSuccess: () => {
      router.push("/athletes");
    },
  });

  
  const unarchiveMutation = useMutation({
    mutationFn: () => apiClient.unarchiveAthlete(athleteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["athlete", athleteId] });
      setSuccessMessage("Athlete unarchived");
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const addToQueueMutation = useMutation({
    mutationFn: () => apiClient.addManualQueueEntry(athleteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notification-count"] });
      setSuccessMessage("Added to work queue");
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  
  
  
  const [prevAthleteForEdit, setPrevAthleteForEdit] = useState<
    Types.AthleteResponse | undefined
  >(athlete);
  if (athlete !== prevAthleteForEdit) {
    setPrevAthleteForEdit(athlete);
    if (athlete) {
      
      
      
      
      
      
      
      setEditFormData({
        name: athlete.name,
        email: athlete.email ?? undefined,
        phone: athlete.phone ?? undefined,
        dob: normalizeDateForInput(athlete.dob) || undefined,
        weight_class: athlete.weight_class ?? undefined,
        division: athlete.division ?? undefined,
        sex: athlete.sex ?? undefined,
      });
      setAvailabilityForm({
        out_from: normalizeDateForInput(athlete.out_from) || "",
        out_through: normalizeDateForInput(athlete.out_through) || "",
      });
      setLocalProgramDue(athlete.program_due ? athlete.program_due.split("T")[0] : "");
      setLocalReminderDays(athlete.reminder_days_before ?? 0);
    }
  }

  
  const handleInlineUpdate = (
    field: keyof Types.AthleteUpdate,
    value: Types.AthleteUpdate[keyof Types.AthleteUpdate],
  ) => {
    updateMutation.mutate({ [field]: value } as Types.AthleteUpdate);
  };

  
  const bumpDate = (unit: 'week' | 'month') => {
    const base = localProgramDue ? new Date(localProgramDue + 'T00:00:00') : new Date();
    if (unit === 'week') {
      base.setDate(base.getDate() + 7);
    } else {
      base.setMonth(base.getMonth() + 1);
    }
    const newDate = base.toISOString().split('T')[0];
    setLocalProgramDue(newDate);
    updateMutation.mutate({ program_due: newDate });
  };

  
  const handleProfileSave = () => {
    updateMutation.mutate(editFormData, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["athlete", athleteId] });
        queryClient.invalidateQueries({ queryKey: ["max-history", athleteId] });
        setIsEditingProfile(false);
        setSuccessMessage("Profile updated successfully");
        setTimeout(() => setSuccessMessage(null), 3000);
      },
    });
  };

  
  
  
  const handleAvailabilitySave = () => {
    updateMutation.mutate(
      {
        out_from: availabilityForm.out_from || null,
        out_through: availabilityForm.out_through || null,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["athlete", athleteId] });
          setIsSettingAvailability(false);
          setSuccessMessage("Availability updated");
          setTimeout(() => setSuccessMessage(null), 3000);
        },
      },
    );
  };

  const handleAvailabilityClear = () => {
    updateMutation.mutate(
      { out_from: null, out_through: null },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["athlete", athleteId] });
          setAvailabilityForm({ out_from: "", out_through: "" });
          setIsSettingAvailability(false);
          setSuccessMessage("Availability cleared");
          setTimeout(() => setSuccessMessage(null), 3000);
        },
      },
    );
  };

  if (athleteLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="cloud-text-muted">Loading athlete...</div>
      </div>
    );
  }

  if (athleteError || !athlete) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <div className="cloud-text font-medium">Athlete not found</div>
          <Button onClick={() => router.push("/athletes")} variant="outline">
            Back to Athletes
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "var(--cloud-s5)" }}>
      {}
      {successMessage && (
        <div
          className="fixed top-20 right-4 cloud-panel-raised cloud-text flex items-center gap-2 z-40 animate-fade-out"
          style={{
            padding: "10px var(--cloud-s4)",
            fontSize: 13,
            borderColor: "rgba(16, 185, 129, 0.35)",
            background: "rgba(16, 185, 129, 0.1)",
            color: "var(--cloud-success-text)",
          }}
        >
          <Check className="w-4 h-4" />
          {successMessage}
        </div>
      )}

      <div className="flex flex-col" style={{ gap: "var(--cloud-s4)" }}>
        {}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between" style={{ gap: "var(--cloud-s3)" }}>
          <div className="flex items-start min-w-0" style={{ gap: "var(--cloud-s3)" }}>
            <button
              type="button"
              onClick={() => router.push("/athletes")}
              className="cloud-icon-btn"
              title="Back to athletes"
              aria-label="Back to athletes"
              style={{ marginTop: 2 }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center" style={{ gap: "var(--cloud-s2)" }}>
                <h1
                  className="font-semibold cloud-text truncate"
                  style={{ fontSize: 32, letterSpacing: "-0.03em", lineHeight: 1.1 }}
                >
                  {athlete.name}
                </h1>
                {athlete.archived && (
                  <span className="cloud-badge">Archived</span>
                )}
              </div>
              {athlete.next_meet_name &&
                (!athlete.meet_date ||
                  athlete.meet_date >= new Date().toISOString().slice(0, 10)) && (
                  <p className="cloud-text-muted" style={{ fontSize: 13, marginTop: 4 }}>
                    Next Meet: {athlete.next_meet_name}
                  </p>
                )}
              {lastSyncedRelative && (
                <p className="cloud-text-muted" style={{ fontSize: 13, marginTop: 2 }}>
                  Last Synced: {lastSyncedRelative}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center flex-shrink-0" style={{ gap: "var(--cloud-s2)" }}>
            {athlete.latest_program_sheet_url && (
              <button
                type="button"
                onClick={() =>
                  window.open(
                    athlete.latest_program_sheet_url!,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
                className="cloud-btn cloud-btn-ghost"
                title="Open Google Sheet in new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open Sheet
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsEditingProfile(true)}
              className="cloud-btn cloud-btn-ghost"
            >
              Edit Profile
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="cloud-btn cloud-btn-ghost"
                style={{ padding: "7px var(--cloud-s2)" }}
                aria-label="More actions"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={6}
                className="cloud-panel-raised min-w-[200px]"
              >
                <DropdownMenuItem onClick={() => setIsShowingDetails(true)}>
                  <Info className="w-3.5 h-3.5" />
                  Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsUpdatingMaxes(true)}>
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  Update Maxes
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsOplDialogOpen(true)}>
                  <Trophy className="w-3.5 h-3.5" />
                  OpenPowerlifting profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => addToQueueMutation.mutate()}
                  disabled={addToQueueMutation.isPending}
                >
                  <ListPlus className="w-3.5 h-3.5" />
                  {addToQueueMutation.isPending ? "Adding..." : "Add to Queue"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowPrimaryDaysDialog(true)}>
                  <Info className="w-3.5 h-3.5" />
                  Primary Days
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsSettingAvailability(true)}>
                  <CalendarOff className="w-3.5 h-3.5" />
                  Set availability
                </DropdownMenuItem>
                {portalAvailable && (athlete.portal_disabled ? (
                  <DropdownMenuItem
                    onClick={() => handleInlineUpdate("portal_disabled", false)}
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Enable portal access
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => handleInlineUpdate("portal_disabled", true)}
                  >
                    <UserX className="w-3.5 h-3.5" />
                    Disable portal access
                  </DropdownMenuItem>
                ))}
                {athlete.body_metrics_hidden ? (
                  <DropdownMenuItem
                    onClick={() => handleInlineUpdate("body_metrics_hidden", false)}
                  >
                    <Info className="w-3.5 h-3.5" />
                    Show Body Metrics
                  </DropdownMenuItem>
                ) : recentWellnessEntryCount <= 3 ? (
                  <DropdownMenuItem
                    onClick={() => handleInlineUpdate("body_metrics_hidden", true)}
                  >
                    <Info className="w-3.5 h-3.5" />
                    Hide Body Metrics
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  onClick={() => {
                    setShowMergeDialog(true);
                    setMergeStep("search");
                    setSelectedMergeTarget(null);
                    setMergePreview(null);
                    setMergeSearch("");
                  }}
                >
                  <Merge className="w-3.5 h-3.5" />
                  Merge Athlete
                </DropdownMenuItem>
                {!athlete.archived ? (
                  <DropdownMenuItem
                    onClick={() => setShowArchiveConfirm(true)}
                    style={{ color: "var(--cloud-danger-text)" }}
                  >
                    <Archive className="w-3.5 h-3.5" />
                    Archive Athlete
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => unarchiveMutation.mutate()}
                    style={{ color: "var(--cloud-success-text)" }}
                  >
                    <ArchiveRestore className="w-3.5 h-3.5" />
                    Unarchive Athlete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div>
        {}
        <UpdateMaxesDialog
          open={isUpdatingMaxes}
          onOpenChange={setIsUpdatingMaxes}
          athlete={athlete}
          unit={unit}
          onSaved={() => {
            setSuccessMessage("Maxes updated");
            setTimeout(() => setSuccessMessage(null), 3000);
          }}
        />

        {}
        <DetailsModal
          open={isShowingDetails}
          onOpenChange={setIsShowingDetails}
          athlete={athlete}
          onEditProfile={() => setIsEditingProfile(true)}
          onOpenMeet={(mid) => router.push(`/meets/${mid}`)}
        />

        {/* OpenPowerlifting link/manage dialog. Replaces the old
            LogMeetResultsDialog; OPL is the source of truth for meet
            history now. */}
        <OplLinkDialog
          open={isOplDialogOpen}
          onOpenChange={setIsOplDialogOpen}
          athleteId={athleteId}
          athleteName={athlete.name}
        />

        {}
        <Dialog open={isEditingProfile} onOpenChange={setIsEditingProfile}>
          <DialogContent className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] max-w-md max-h-[85vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
                Edit profile
              </DialogTitle>
              <DialogDescription className="cloud-text-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
                Update {athlete.name}&rsquo;s contact info, meet eligibility, and identity. Time-off windows live under the three-dot menu &rarr; Set availability.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 overflow-y-auto cloud-thin-scroll flex-1 pr-1">
              <div>
                <label
                  className="cloud-text-dim block"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  Name
                </label>
                <input
                  value={editFormData.name || ""}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, name: e.target.value })
                  }
                  className="cloud-input w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="cloud-text-dim block"
                    style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontWeight: 500,
                      marginBottom: 6,
                    }}
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    value={editFormData.email || ""}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, email: e.target.value })
                    }
                    className="cloud-input w-full"
                    placeholder="athlete@example.com"
                  />
                </div>

                <div>
                  <label
                    className="cloud-text-dim block"
                    style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontWeight: 500,
                      marginBottom: 6,
                    }}
                  >
                    Phone
                  </label>
                  <input
                    value={editFormData.phone || ""}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, phone: e.target.value })
                    }
                    className="cloud-input w-full"
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div>
                <label
                  className="cloud-text-dim block"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  Date of birth
                </label>
                <input
                  type="date"
                  value={editFormData.dob || ""}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      dob: e.target.value || undefined,
                    })
                  }
                  className="cloud-input w-full"
                />
              </div>

              <div>
                <label
                  className="cloud-text-dim block"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  Sex
                </label>
                <div
                  className="inline-flex rounded-md overflow-hidden w-full"
                  style={{ border: "1px solid var(--cloud-border)" }}
                >
                  {(["M", "F"] as const).map((opt, i) => {
                    const active = editFormData.sex === opt;
                    return (
                      <Fragment key={opt}>
                        {i > 0 && (
                          <div style={{ width: 1, background: "var(--cloud-border)" }} />
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setEditFormData({
                              ...editFormData,
                              sex: active ? undefined : opt,
                              
                              
                              weight_class: active
                                ? editFormData.weight_class
                                : undefined,
                            })
                          }
                          className="flex-1 transition-colors"
                          style={{
                            padding: "7px 0",
                            fontSize: 13,
                            fontWeight: active ? 500 : 400,
                            background: active ? "rgba(12, 92, 171, 0.18)" : "transparent",
                            color: active ? "#93c5fd" : "var(--cloud-text-muted)",
                          }}
                        >
                          {opt === "M" ? "Men's" : "Women's"}
                        </button>
                      </Fragment>
                    );
                  })}
                </div>
                <p className="cloud-text-dim mt-1.5" style={{ fontSize: 11 }}>
                  Drives which weight-class list appears below.
                </p>
              </div>

              <div>
                <label
                  className="cloud-text-dim block"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  Weight class
                </label>
                {editFormData.sex === "M" || editFormData.sex === "F" ? (
                  <WeightClassSelect
                    sex={editFormData.sex}
                    customRaw={
                      settingsData?.[customWeightClassesKey(editFormData.sex)]
                    }
                    value={editFormData.weight_class}
                    onChange={(next) =>
                      setEditFormData({
                        ...editFormData,
                        weight_class: next || undefined,
                      })
                    }
                    onAddCustom={(value) => {
                      addCustomWeightClass(editFormData.sex as AthleteSex, value);
                      setEditFormData({
                        ...editFormData,
                        weight_class: value,
                      });
                    }}
                  />
                ) : (
                  <p className="cloud-text-dim" style={{ fontSize: 12 }}>
                    Select Men&rsquo;s or Women&rsquo;s above to see weight classes.
                  </p>
                )}
              </div>

              <div>
                <label
                  className="cloud-text-dim block"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  Goal bodyweight <span style={{ opacity: 0.6 }}>({unit})</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  placeholder={`e.g. ${unit === "kg" ? "84" : "185"}`}
                  value={
                    editFormData.goal_bodyweight_lbs != null
                      ? Number(
                          convertWeight(editFormData.goal_bodyweight_lbs, unit).toFixed(1)
                        )
                      : ""
                  }
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      setEditFormData({
                        ...editFormData,
                        goal_bodyweight_lbs: null,
                      });
                      return;
                    }
                    const parsed = parseFloat(raw);
                    if (!Number.isFinite(parsed)) return;
                    const lbs = unit === "kg" ? kgToLbs(parsed) : parsed;
                    setEditFormData({
                      ...editFormData,
                      goal_bodyweight_lbs: Math.round(lbs * 10) / 10,
                    });
                  }}
                  className="cloud-input w-full"
                />
                <p className="cloud-text-dim mt-1.5" style={{ fontSize: 11 }}>
                  Draws a reference line on the bodyweight chart.
                </p>
              </div>

              <div>
                <label
                  className="cloud-text-dim block"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  Division
                </label>
                <select
                  value={editFormData.division || ""}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      division: e.target.value || undefined,
                    })
                  }
                  className="cloud-input w-full cursor-pointer"
                >
                  <option value="">Select division…</option>
                  {DIVISIONS.map((div) => (
                    <option key={div} value={div}>
                      {div}
                    </option>
                  ))}
                </select>
              </div>

            </div>

            <DialogFooter
              className="flex-shrink-0 !mt-2 !-mx-4 !-mb-4 !p-4 !border-t !bg-transparent"
              style={{ borderColor: "var(--cloud-border)" }}
            >
              <button
                type="button"
                className="cloud-btn cloud-btn-ghost"
                onClick={() => setIsEditingProfile(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="cloud-btn cloud-btn-primary"
                onClick={handleProfileSave}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving…" : "Save changes"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {}
        <Dialog open={isSettingAvailability} onOpenChange={setIsSettingAvailability}>
          <DialogContent className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] max-w-sm">
            <DialogHeader>
              <DialogTitle style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
                Set availability
              </DialogTitle>
              <DialogDescription className="cloud-text-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
                Mark {athlete.name} as out for a date range. Once the window passes, calendar sync will skip it automatically.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label
                  className="cloud-text-dim block"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  Out from
                </label>
                <input
                  type="date"
                  value={availabilityForm.out_from}
                  onChange={(e) =>
                    setAvailabilityForm((prev) => ({ ...prev, out_from: e.target.value }))
                  }
                  className="cloud-input w-full"
                />
              </div>

              <div>
                <label
                  className="cloud-text-dim block"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  Out through
                </label>
                <input
                  type="date"
                  value={availabilityForm.out_through}
                  onChange={(e) =>
                    setAvailabilityForm((prev) => ({ ...prev, out_through: e.target.value }))
                  }
                  className="cloud-input w-full"
                />
              </div>
            </div>

            <DialogFooter
              className="!mt-2 !-mx-4 !-mb-4 !p-4 !border-t !bg-transparent flex justify-between"
              style={{ borderColor: "var(--cloud-border)" }}
            >
              <button
                type="button"
                className="cloud-btn cloud-btn-ghost"
                onClick={handleAvailabilityClear}
                disabled={
                  updateMutation.isPending ||
                  (!athlete.out_from && !athlete.out_through)
                }
              >
                Clear
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="cloud-btn cloud-btn-ghost"
                  onClick={() => setIsSettingAvailability(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="cloud-btn cloud-btn-primary"
                  onClick={handleAvailabilitySave}
                  disabled={
                    updateMutation.isPending ||
                    !availabilityForm.out_from ||
                    !availabilityForm.out_through
                  }
                >
                  {updateMutation.isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {}
        <Dialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
          <DialogContent className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)]">
            <DialogHeader>
              <DialogTitle style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
                Archive {athlete.name}?
              </DialogTitle>
              <DialogDescription className="cloud-text-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
                They&rsquo;ll disappear from the active roster and stop counting
                toward workload caps. You can bring them back any time from the
                archived list.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter
              className="!mt-2 !-mx-4 !-mb-4 !p-4 !border-t !bg-transparent"
              style={{ borderColor: "var(--cloud-border)" }}
            >
              <button
                type="button"
                className="cloud-btn cloud-btn-ghost"
                onClick={() => setShowArchiveConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  archiveMutation.mutate();
                  setShowArchiveConfirm(false);
                }}
                disabled={archiveMutation.isPending}
                className="cloud-btn"
                style={{
                  background: "rgba(220, 38, 38, 0.18)",
                  color: "#fca5a5",
                  border: "1px solid rgba(220, 38, 38, 0.4)",
                }}
              >
                {archiveMutation.isPending ? "Archiving…" : "Archive"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {}
        <Dialog open={showMergeDialog} onOpenChange={(open) => {
          setShowMergeDialog(open);
          if (!open) {
            setMergeStep("search");
            setSelectedMergeTarget(null);
            setMergePreview(null);
            setMergeSearch("");
          }
        }}>
          <DialogContent className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] max-w-lg">
            <DialogHeader>
              <DialogTitle style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
                Merge athletes
              </DialogTitle>
              <DialogDescription className="cloud-text-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
                {mergeStep === "search"
                  ? "Pick the duplicate profile to fold into this one. Programs, PRs, and meet history all move over."
                  : "Review the merge summary. This action can\u2019t be undone."}
              </DialogDescription>
            </DialogHeader>

            {mergeStep === "search" && (
              <div className="space-y-3">
                <input
                  placeholder="Search athletes by name…"
                  value={mergeSearch}
                  onChange={(e) => setMergeSearch(e.target.value)}
                  className="cloud-input w-full"
                  autoFocus
                />
                <div
                  className="max-h-64 overflow-y-auto cloud-thin-scroll rounded-md"
                  style={{ border: "1px solid var(--cloud-border)" }}
                >
                  {allAthletes
                    .filter(
                      (a) =>
                        a.id !== athleteId &&
                        a.name.toLowerCase().includes(mergeSearch.toLowerCase())
                    )
                    .map((a, idx) => {
                      const selected = selectedMergeTarget?.id === a.id;
                      return (
                        <button
                          key={a.id}
                          onClick={async () => {
                            setSelectedMergeTarget(a);
                            try {
                              const preview = await apiClient.getMergePreview(athleteId, a.id);
                              setMergePreview(preview);
                              setMergeNameChoice(athlete.name);
                              setMergeStep("preview");
                            } catch (err) {
                              console.error("Failed to load merge preview", err);
                            }
                          }}
                          className="w-full text-left flex items-center justify-between transition-colors"
                          style={{
                            padding: "9px 12px",
                            fontSize: 13,
                            borderTop: idx > 0 ? "1px solid var(--cloud-border)" : "none",
                            background: selected ? "rgba(12, 92, 171, 0.12)" : "transparent",
                            color: selected ? "#93c5fd" : "var(--cloud-text)",
                          }}
                        >
                          <span style={{ fontWeight: selected ? 500 : 400 }}>{a.name}</span>
                          <span className="cloud-text-dim" style={{ fontSize: 11 }}>
                            {a.program_count} program{a.program_count !== 1 ? "s" : ""}
                          </span>
                        </button>
                      );
                    })}
                  {mergeSearch &&
                    allAthletes.filter(
                      (a) =>
                        a.id !== athleteId &&
                        a.name.toLowerCase().includes(mergeSearch.toLowerCase())
                    ).length === 0 && (
                      <div
                        className="cloud-text-dim text-center py-6"
                        style={{ fontSize: 12 }}
                      >
                        No matching athletes found
                      </div>
                    )}
                </div>
              </div>
            )}

            {mergeStep === "preview" && mergePreview && (
              <div className="space-y-4">
                <div
                  className="rounded-md p-4 space-y-2.5"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid var(--cloud-border)",
                  }}
                >
                  <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                    <span className="cloud-text-dim">Primary (this profile)</span>
                    <span className="cloud-text" style={{ fontWeight: 500 }}>
                      {mergePreview.primary_name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                    <span className="cloud-text-dim">Programs</span>
                    <span className="cloud-text">{mergePreview.primary_program_count}</span>
                  </div>
                  <div style={{ height: 1, background: "var(--cloud-border)" }} />
                  <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                    <span className="cloud-text-dim">Merging from</span>
                    <span style={{ color: "#67e8f9", fontWeight: 500 }}>
                      {mergePreview.secondary_name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                    <span className="cloud-text-dim">Programs to transfer</span>
                    <span style={{ color: "#fdba74", fontWeight: 500 }}>
                      {mergePreview.programs_to_transfer}
                    </span>
                  </div>
                </div>

                <div>
                  <div
                    className="cloud-text-dim"
                    style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontWeight: 500,
                      marginBottom: 8,
                    }}
                  >
                    Which name to keep?
                  </div>
                  <div className="space-y-2">
                    {[mergePreview.primary_name, mergePreview.secondary_name].map((name) => {
                      const active = mergeNameChoice === name;
                      return (
                        <label
                          key={name}
                          className="flex items-center gap-2.5 cursor-pointer rounded-md px-3 py-2 transition-colors"
                          style={{
                            fontSize: 13,
                            background: active ? "rgba(12, 92, 171, 0.1)" : "transparent",
                            border: `1px solid ${active ? "rgba(12, 92, 171, 0.4)" : "var(--cloud-border)"}`,
                            color: active ? "var(--cloud-text)" : "var(--cloud-text-muted)",
                          }}
                        >
                          <input
                            type="radio"
                            name="merge-name"
                            checked={active}
                            onChange={() => setMergeNameChoice(name)}
                            style={{ accentColor: "var(--cloud-primary)" }}
                          />
                          {name}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div
                  className="cloud-text-dim"
                  style={{ fontSize: 11, lineHeight: 1.5 }}
                >
                  Empty fields on the primary profile are filled in from the secondary.
                  The secondary profile is deleted after the merge.
                </div>
              </div>
            )}

            <DialogFooter
              className="!mt-2 !-mx-4 !-mb-4 !p-4 !border-t !bg-transparent"
              style={{ borderColor: "var(--cloud-border)" }}
            >
              {mergeStep === "preview" && (
                <button
                  type="button"
                  className="cloud-btn cloud-btn-ghost"
                  onClick={() => {
                    setMergeStep("search");
                    setSelectedMergeTarget(null);
                    setMergePreview(null);
                  }}
                >
                  Back
                </button>
              )}
              <button
                type="button"
                className="cloud-btn cloud-btn-ghost"
                onClick={() => setShowMergeDialog(false)}
              >
                Cancel
              </button>
              {mergeStep === "preview" && (
                <button
                  type="button"
                  className="cloud-btn cloud-btn-primary"
                  onClick={() => mergeMutation.mutate()}
                  disabled={mergeMutation.isPending}
                >
                  {mergeMutation.isPending ? "Merging…" : "Confirm merge"}
                </button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* PostMeetBanner removed: it nudged the coach to log meet
            results manually after a meet date passed. With OPL as the
            canonical source, results land automatically once the
            federation publishes; no nudge needed. */}

        {}
        <NewPRsBanner
          athleteId={athleteId}
          unit={unit}
          currentProgramId={programs[0]?.id ?? null}
          currentProgramStart={programs[0]?.date_start ?? null}
          currentProgramEnd={programs[0]?.date_end ?? null}
          athleteName={athlete?.name ?? null}
        />

        {}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <ProfileStatusPills
            athlete={athlete}
            localProgramDue={localProgramDue}
            setLocalProgramDue={setLocalProgramDue}
            localReminderDays={localReminderDays}
            setLocalReminderDays={setLocalReminderDays}
            onInlineUpdate={handleInlineUpdate}
            onBumpDate={bumpDate}
            onOpenMeet={(mid) => router.push(`/meets/${mid}`)}
          />
          <div className="flex items-center ml-auto" style={{ gap: "var(--cloud-s3)" }}>
            <div className="cloud-tabs" role="tablist" aria-label="Weight unit">
              {(['lbs', 'kg'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  role="tab"
                  aria-selected={unit === u}
                  onClick={() => setWeightUnit(u)}
                  className="cloud-tab"
                  title={
                    u === unit
                      ? `Currently displaying in ${unitLabel(u)}`
                      : `Switch this profile to ${unitLabel(u)}`
                  }
                >
                  {unitLabel(u)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={toggleCompMaxes}
              className="cloud-text-muted hover:cloud-text underline decoration-dotted underline-offset-2"
              style={{ fontSize: 12 }}
              title={
                showCompMaxes
                  ? "Hide the competition max line under each card"
                  : "Show the competition max line under each card"
              }
            >
              {showCompMaxes ? "Hide comp maxes" : "Show comp maxes"}
            </button>
          </div>
        </div>
        <div className="cloud-stats" style={{ marginBottom: "var(--cloud-s5)" }}>
          <div className="cloud-stat">
            <div className="cloud-stat-label">Squat Max</div>
            <div className="cloud-stat-value">
              {formatWeight(athlete.squat_max_lbs, unit, { plate: unit === "kg" })}
            </div>
            {showCompMaxes && <CompMaxLine cm={compMaxByLift.squat} unit={unit} />}
            <EstimatedMaxBadge
              est={estMaxByLift.squat}
              unit={unit}
              onJump={setHighlightedExercise}
            />
          </div>

          <div className="cloud-stat">
            <div className="cloud-stat-label">Bench Max</div>
            <div className="cloud-stat-value">
              {formatWeight(athlete.bench_max_lbs, unit, { plate: unit === "kg" })}
            </div>
            {showCompMaxes && <CompMaxLine cm={compMaxByLift.bench} unit={unit} />}
            <EstimatedMaxBadge
              est={estMaxByLift.bench}
              unit={unit}
              onJump={setHighlightedExercise}
            />
          </div>

          <div className="cloud-stat">
            <div className="cloud-stat-label">Deadlift Max</div>
            <div className="cloud-stat-value">
              {formatWeight(athlete.deadlift_max_lbs, unit, { plate: unit === "kg" })}
            </div>
            {showCompMaxes && <CompMaxLine cm={compMaxByLift.deadlift} unit={unit} />}
            <EstimatedMaxBadge
              est={estMaxByLift.deadlift}
              unit={unit}
              onJump={setHighlightedExercise}
            />
          </div>

          <div className="cloud-stat">
            <div className="cloud-stat-label">Total</div>
            <div className="cloud-stat-value">
              {formatWeight(athlete.total_lbs, unit, { plate: unit === "kg" })}
            </div>
            {showCompMaxes && <CompTotalLine byLift={compMaxByLift} unit={unit} />}
          </div>
        </div>

        {}
        <Dialog open={showPrimaryDaysDialog} onOpenChange={setShowPrimaryDaysDialog}>
          <DialogContent className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] max-w-md">
            <DialogHeader>
              <DialogTitle style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
                Primary days
              </DialogTitle>
              <DialogDescription className="cloud-text-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
                Default training day for each main lift. Charts default to
                these; individual programs can override.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-1">
              {(["squat", "bench", "deadlift"] as const).map((lift) => {
                const fieldKey = `primary_${lift}_day` as keyof Types.AthleteResponse;
                const currentValue = athlete[fieldKey] as number | null | undefined;
                
                const liftColor =
                  lift === "squat" ? "#fb923c" :
                  lift === "bench" ? "#22d3ee" : "#a78bfa";
                return (
                  <div key={lift} className="grid grid-cols-[88px_1fr] items-center gap-3">
                    <label
                      className="capitalize"
                      style={{
                        color: liftColor,
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        fontWeight: 600,
                      }}
                    >
                      {lift}
                    </label>
                    <select
                      value={currentValue ?? ""}
                      onChange={(e) => {
                        const val = e.target.value ? parseInt(e.target.value, 10) : null;
                        handleInlineUpdate(`primary_${lift}_day`, val);
                      }}
                      className="cloud-input w-full cursor-pointer"
                      style={{ colorScheme: "dark" }}
                    >
                      <option value="">Not set</option>
                      {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                        <option key={d} value={d}>Day {d}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            <DialogFooter
              className="!mt-2 !-mx-4 !-mb-4 !p-4 !border-t !bg-transparent"
              style={{ borderColor: "var(--cloud-border)" }}
            >
              <button
                type="button"
                className="cloud-btn cloud-btn-primary"
                onClick={() => setShowPrimaryDaysDialog(false)}
              >
                Done
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {}
        <BodyMetricsCard
          athleteId={athleteId}
          unit={unit}
          weightClass={athlete?.weight_class ?? null}
          goalBodyweightLbs={athlete?.goal_bodyweight_lbs ?? null}
          hasUpcomingMeet={Boolean(athlete?.meet_date || athlete?.next_meet_id)}
          hidden={Boolean(athlete?.body_metrics_hidden)}
        />

        {}
        <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
          <div className="cloud-panel-head">
            <h2>Progression Charts</h2>
          </div>
          <div style={{ padding: "var(--cloud-s4)" }}>
            <ProgressionCharts
              athleteId={athleteId}
              athlete={athlete}
              highlightedExercise={highlightedExercise}
              unit={unit}
              onClearHighlight={() => setHighlightedExercise(null)}
              compMaxes={compMaxes}
            />
          </div>
        </div>

        {}
        <BlockReviewSummary athleteId={athleteId} context="profile" athleteName={athlete?.name ?? null} unit={unit} />

        {}
        <PRHistoryTimeline athleteId={athleteId} unit={unit} athleteName={athlete?.name ?? null} />

        {}
        <MeetHistoryCard
          athleteId={athleteId}
          athlete={athlete}
          unit={unit}
        />

        {}
        <RPEComplianceCard athleteId={athleteId} />

        {}
        <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
          <div className="cloud-panel-head">
            <h2>Programs</h2>
            {!programsLoading && programs.length > 0 && (
              <span className="cloud-text-muted" style={{ fontSize: 12 }}>
                {filteredPrograms.length} of {programs.length}
              </span>
            )}
          </div>
          {programsLoading ? (
            <div
              className="cloud-text-muted"
              style={{ padding: "var(--cloud-s4)", fontSize: 13 }}
            >
              Loading programs...
            </div>
          ) : programs.length === 0 ? (
            <div
              className="cloud-text-muted"
              style={{
                padding: "var(--cloud-s6) var(--cloud-s4)",
                textAlign: "center",
                fontSize: 13,
              }}
            >
              No programs assigned yet
            </div>
          ) : (
            <div className="space-y-3" style={{ padding: "var(--cloud-s4)" }}>
              {}
              <div
                className="flex items-center gap-2"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid var(--cloud-border)",
                  borderRadius: "var(--cloud-r-md)",
                  padding: "var(--cloud-s2) var(--cloud-s3)",
                }}
              >
                <Search className="w-3.5 h-3.5 cloud-text-muted" />
                <Input
                  placeholder="Search programs..."
                  value={programSearch}
                  onChange={(e) => setProgramSearch(e.target.value)}
                  className="bg-transparent border-0 cloud-text focus-visible:ring-0 p-0 flex-1 h-7"
                />
                <button
                  type="button"
                  onClick={() => setProgramSortNewest(!programSortNewest)}
                  className="cloud-btn cloud-btn-ghost"
                  style={{ padding: "4px var(--cloud-s2)", fontSize: 12 }}
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  {programSortNewest ? "Newest" : "Oldest"}
                </button>
              </div>

              {}
              {filteredPrograms.length === 0 ? (
                <div
                  className="cloud-text-muted"
                  style={{
                    padding: "var(--cloud-s5) var(--cloud-s4)",
                    textAlign: "center",
                    fontSize: 13,
                  }}
                >
                  {programSearch.trim() ? "No programs match your search" : "No programs"}
                </div>
              ) : (
                <div
                  className="cloud-thin-scroll space-y-3"
                  style={{ maxHeight: 800, overflowY: "auto", paddingRight: 4 }}
                >
                  {filteredPrograms.map((program) => (
                    <ProgramSection
                      key={program.id}
                      program={program}
                      athleteId={athleteId}
                      unit={unit}
                      onHighlightExercise={setHighlightedExercise}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
