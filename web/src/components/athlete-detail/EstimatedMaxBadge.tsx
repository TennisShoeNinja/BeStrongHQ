"use client";

import { useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import * as Types from "@/lib/types";
import { convertWeight, formatWeight, type WeightUnit } from "@/lib/units";
import parseLocalDate from "@/lib/parseLocalDate";
import { type HighlightedExercise } from "./utils";

// A block is considered "stale" once its end date is more than this many days
// in the past. ~6 months: old enough that the estimate no longer reflects
// where the athlete is today.
const STALE_AFTER_DAYS = 183;

// Format a "YYYY-MM-DD" start/end pair as a single range like
// "Jul 14 – Aug 11, 2024". Parses as local dates to avoid a TZ day shift.
function formatDateRange(
  startStr: string | null | undefined,
  endStr: string | null | undefined
): string | null {
  const start = parseLocalDate(startStr);
  const end = parseLocalDate(endStr);
  if (!start && !end) return null;
  const md = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const mdy = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  if (start && end) {
    // Drop the redundant year on the start when both fall in the same year.
    const sameYear = start.getFullYear() === end.getFullYear();
    return `${sameYear ? md(start) : mdy(start)} – ${mdy(end)}`;
  }
  return mdy((start ?? end) as Date);
}

// Rough "X ago" phrasing measured from a block's end date to now.
function formatStaleness(endStr: string | null | undefined): string | null {
  const end = parseLocalDate(endStr);
  if (!end) return null;
  const days = Math.round((Date.now() - end.getTime()) / 86400_000);
  if (days < 0) return null;
  if (days < 30) return "this month";
  const months = Math.round(days / 30);
  if (months < 12) return `~${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(days / 365);
  return `~${years} year${years === 1 ? "" : "s"} ago`;
}

function isStale(endStr: string | null | undefined): boolean {
  const end = parseLocalDate(endStr);
  if (!end) return false;
  return (Date.now() - end.getTime()) / 86400_000 > STALE_AFTER_DAYS;
}

export function EstimatedMaxBadge({
  est,
  unit,
  programs,
  onJump,
}: {
  est: Types.EstimatedMaxForLift | undefined;
  unit: WeightUnit;
  programs: Types.ProgramListResponse[];
  onJump: (hit: HighlightedExercise) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!est || est.estimated == null) return null;

  const deltaLbs = est.declared != null ? est.estimated - est.declared : null;
  const deltaDisplay =
    deltaLbs != null ? Math.round(convertWeight(deltaLbs, unit)) : null;
  const showDelta =
    est.exceeds_declared && deltaDisplay != null && deltaDisplay > 0;

  const canJump =
    est.exercise_name != null &&
    est.weight_lbs != null &&
    est.reps != null &&
    est.program_number != null &&
    est.week_number != null &&
    est.day_number != null;

  const handleJump = () => {
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
    setOpen(false);
  };

  // "From" row: weight × reps (@ RPE if logged).
  const fromSummary =
    est.weight_lbs != null && est.reps != null
      ? `${formatWeight(est.weight_lbs, unit, { unitless: true })} × ${est.reps}${
          est.actual_rpe != null ? ` @ RPE ${est.actual_rpe}` : ""
        }`
      : null;

  // "Block" row: Block N · Week N, Day N (+ program name if present).
  const blockSummary = (() => {
    const parts: string[] = [];
    if (est.program_number != null) parts.push(`Block ${est.program_number}`);
    const wd: string[] = [];
    if (est.week_number != null) wd.push(`Week ${est.week_number}`);
    if (est.day_number != null) wd.push(`Day ${est.day_number}`);
    let main = parts.join(" · ");
    if (wd.length) main = main ? `${main} · ${wd.join(", ")}` : wd.join(", ");
    if (!main) return null;
    return est.program_name ? `${main} · ${est.program_name}` : main;
  })();

  // "When" row: source block's date window + staleness.
  const sourceProgram = programs.find((p) => p.id === est.program_id);
  const whenRange = sourceProgram
    ? formatDateRange(sourceProgram.date_start, sourceProgram.date_end)
    : null;
  const whenStaleness = sourceProgram
    ? formatStaleness(sourceProgram.date_end)
    : null;
  const whenValue =
    whenRange != null
      ? whenStaleness
        ? `${whenRange} · ${whenStaleness}`
        : whenRange
      : null;
  const whenStale = sourceProgram ? isStale(sourceProgram.date_end) : false;

  const method =
    est.actual_rpe != null
      ? "Tuchscherer RPE-table estimate"
      : "Epley estimate";

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        className="inline-flex items-baseline gap-1 cursor-pointer outline-none"
        style={{ fontSize: 11, marginTop: 1 }}
      >
        <span
          className={est.exceeds_declared ? "text-amber-500" : "cloud-text-dim"}
          style={{
            textDecoration: "underline",
            textDecorationStyle: "dotted",
            textUnderlineOffset: 2,
          }}
        >
          est {formatWeight(est.estimated, unit, { unitless: true })}
        </span>
        {showDelta && (
          <span
            className="text-amber-500"
            style={{ fontWeight: 600 }}
          >
            +{deltaDisplay}
          </span>
        )}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="bottom" align="start" sideOffset={8}>
          <PopoverPrimitive.Popup
            className="cloud-panel-raised z-50 origin-[var(--transform-origin)] rounded-xl outline-none ring-1 ring-foreground/10 transition-[transform,opacity] duration-150 ease-out data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-top-1 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-top-1"
            style={{
              width: 320,
              padding: "var(--cloud-s4)",
              boxShadow:
                "0 20px 40px -16px rgba(0,0,0,0.6), 0 8px 16px -4px rgba(0,0,0,0.4)",
            }}
          >
            <PopoverPrimitive.Title
              className="cloud-text-muted"
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontWeight: 600,
                margin: 0,
              }}
            >
              Estimated 1RM
            </PopoverPrimitive.Title>

            <div
              className="cloud-text"
              style={{
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                fontVariantNumeric: "tabular-nums",
                marginTop: 4,
                display: "flex",
                alignItems: "baseline",
                gap: 2,
              }}
            >
              <span>{formatWeight(est.estimated, unit, { unitless: true })}</span>
              <small className="cloud-text-muted" style={{ fontSize: 13, marginLeft: 3 }}>
                {unit}
              </small>
              {showDelta && (
                <span
                  style={{
                    color: "var(--cloud-warning-text)",
                    fontSize: 12,
                    fontWeight: 600,
                    marginLeft: 8,
                  }}
                >
                  +{deltaDisplay} over declared
                </span>
              )}
            </div>

            <div
              style={{
                height: 1,
                background: "var(--cloud-border)",
                margin: "12px 0",
              }}
            />

            {fromSummary && <KV k="From" v={fromSummary} />}
            {est.exercise_name && <KV k="Lift" v={est.exercise_name} />}
            {blockSummary && <KV k="Block" v={blockSummary} />}
            {whenValue && <KV k="When" v={whenValue} stale={whenStale} />}
            <KV k="Method" v={method} />

            {canJump && (
              <button
                type="button"
                onClick={handleJump}
                style={{
                  marginTop: 14,
                  width: "100%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "8px var(--cloud-s3)",
                  borderRadius: "var(--cloud-r-sm)",
                  background: "var(--cloud-panel)",
                  border: "1px solid var(--cloud-border)",
                  color: "var(--cloud-primary-text)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
                className="hover:bg-[var(--cloud-panel-hover)]"
              >
                View on progression chart →
              </button>
            )}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function KV({ k, v, stale }: { k: string; v: string; stale?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 10, fontSize: 12, marginTop: 7 }}>
      <span
        className="cloud-text-dim"
        style={{ minWidth: 52, flexShrink: 0 }}
      >
        {k}
      </span>
      <span
        style={{
          color: stale ? "var(--cloud-warning-text)" : "var(--cloud-text)",
          fontWeight: stale ? 500 : 400,
        }}
      >
        {v}
      </span>
    </div>
  );
}
