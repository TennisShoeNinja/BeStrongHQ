"use client";

import { Clock, ArrowRight, ExternalLink } from "lucide-react";
import type * as Types from "@/lib/types";

function formatBlockDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const trimmed = d.trim();
  if (!trimmed) return null;
  // Parse as local date (avoid TZ shifting the day)
  const parts = trimmed.split("-").map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some(isNaN)) return trimmed;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400_000);
}

function parseDateLocal(d: string): Date | null {
  const parts = d.trim().split("-").map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatMeetCountdown(meetDate: string | undefined | null): string | null {
  if (!meetDate) return null;
  const target = parseDateLocal(meetDate);
  if (!target) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = daysBetween(today, target);
  if (days < 0) return "Past";
  if (days === 0) return "Today";
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  const rem = days % 7;
  if (weeks < 8) return rem === 0 ? `${weeks}w` : `${weeks}w ${rem}d`;
  return `${days}d`;
}

interface Props {
  athlete: Types.AthleteResponse;
  currentProgram?: Types.ProgramListResponse | null;
  onOpenMeet?: (meetId: number) => void;
  programSheetUrl?: string | null;
}

/**
 * Combined Current Cycle hero card for athlete detail. On desktop it lays the
 * next meet and current block side by side, separated by a vertical hairline.
 * Below the md breakpoint (where MobileAthleteDetail also renders it) the two
 * columns stack vertically with a horizontal hairline between them. The
 * responsive grid lives in globals.css (.cloud-cycle-grid / .cloud-cycle-div).
 *
 * Renders nothing when there's no meet AND no program (the page collapses
 * gracefully for athletes who haven't been programmed yet).
 */
export function CurrentCycleCard({
  athlete,
  currentProgram,
  onOpenMeet,
  programSheetUrl,
}: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const meetUpcoming = !!athlete.meet_date && athlete.meet_date >= today;
  const hasProgram = !!currentProgram;
  if (!meetUpcoming && !hasProgram) return null;

  const countdown = formatMeetCountdown(athlete.meet_date);

  // Build block week-bar data when we have start/end + today
  let weekSegs: ("done" | "now" | "future")[] | null = null;
  let weekLabel: string | null = null;
  if (
    currentProgram?.date_start &&
    currentProgram?.date_end
  ) {
    const start = parseDateLocal(currentProgram.date_start);
    const end = parseDateLocal(currentProgram.date_end);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (start && end && end > start) {
      const totalDays = daysBetween(start, end);
      const totalWeeks = Math.max(1, Math.ceil(totalDays / 7));
      const elapsedDays = Math.max(0, daysBetween(start, now));
      const currentWeekIdx = Math.min(
        totalWeeks - 1,
        Math.floor(elapsedDays / 7),
      );
      const displayWeek = Math.min(totalWeeks, currentWeekIdx + 1);
      weekLabel = `Week ${displayWeek} of ${totalWeeks}`;
      weekSegs = Array.from({ length: totalWeeks }, (_, i) =>
        i < currentWeekIdx ? "done" : i === currentWeekIdx ? "now" : "future",
      );
    }
  }

  const blockName =
    currentProgram?.program_name ||
    (currentProgram?.program_number
      ? `Program ${currentProgram.program_number}`
      : "Current program");

  const meetSubtitle = (() => {
    if (!athlete.meet_date) return null;
    const dateLabel = formatBlockDate(athlete.meet_date);
    return dateLabel ?? athlete.meet_date;
  })();

  const dateRange = (() => {
    if (!currentProgram?.date_start || !currentProgram?.date_end) return null;
    const s = formatBlockDate(currentProgram.date_start);
    const e = formatBlockDate(currentProgram.date_end);
    if (!s || !e) return null;
    return { start: s, end: e };
  })();

  const meetCell = meetUpcoming ? (
    <button
      type="button"
      onClick={() =>
        athlete.next_meet_id && onOpenMeet?.(athlete.next_meet_id)
      }
      disabled={!athlete.next_meet_id}
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        padding: "var(--cloud-s4)",
        background: "transparent",
        border: 0,
        textAlign: "left",
        color: "inherit",
        font: "inherit",
        cursor: athlete.next_meet_id ? "pointer" : "default",
      }}
      title={athlete.next_meet_id ? "Open meet" : undefined}
    >
      <p className="cloud-eyebrow" style={{ margin: 0 }}>
        Next meet
      </p>
      <p
        className="cloud-text"
        style={{
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          margin: "8px 0 4px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {athlete.next_meet_name || "Assigned meet"}
      </p>
      {meetSubtitle && (
        <p className="cloud-text-muted" style={{ fontSize: 13, margin: 0 }}>
          {meetSubtitle}
        </p>
      )}
      {countdown && (
        <div style={{ marginTop: 14 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              color: "var(--cloud-primary-text)",
              padding: "3px 10px",
              borderRadius: 999,
              background: "rgba(12, 92, 171, 0.16)",
              border: "1px solid rgba(12, 92, 171, 0.35)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <Clock style={{ width: 12, height: 12, strokeWidth: 2 }} />
            {countdown}
          </span>
        </div>
      )}
    </button>
  ) : null;

  const blockCell =
    hasProgram && currentProgram ? (
      <button
        type="button"
        onClick={() => {
          if (programSheetUrl) {
            window.open(programSheetUrl, "_blank", "noopener,noreferrer");
          }
        }}
        disabled={!programSheetUrl}
        style={{
          position: "relative",
          display: "block",
          width: "100%",
          padding: "var(--cloud-s4)",
          background: "transparent",
          border: 0,
          textAlign: "left",
          color: "inherit",
          font: "inherit",
          cursor: programSheetUrl ? "pointer" : "default",
        }}
        title={programSheetUrl ? "Open Google Sheet in new tab" : undefined}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <p className="cloud-eyebrow" style={{ margin: 0 }}>
            Current block
          </p>
          {(weekLabel || programSheetUrl) && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexShrink: 0,
              }}
            >
              {weekLabel && (
                <span
                  style={{
                    display: "inline-flex",
                    padding: "2px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 999,
                    background: "var(--cloud-panel-hover)",
                    color: "var(--cloud-text)",
                    border: "1px solid var(--cloud-border)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {weekLabel}
                </span>
              )}
              {programSheetUrl && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    color: "var(--cloud-text-dim)",
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: "0.01em",
                  }}
                >
                  <ExternalLink style={{ width: 12, height: 12 }} />
                  Open Sheet
                </span>
              )}
            </span>
          )}
        </div>
        <p
          className="cloud-text"
          style={{
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            margin: "8px 0 4px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {currentProgram.program_number && (
            <span style={{ color: "var(--cloud-primary-text)", marginRight: 6 }}>
              Block {currentProgram.program_number}
            </span>
          )}
          {blockName}
        </p>
        {weekSegs && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${weekSegs.length}, 1fr)`,
              gap: 4,
              margin: "14px 0 10px",
            }}
          >
            {weekSegs.map((seg, i) => (
              <span
                key={i}
                style={{
                  height: 6,
                  borderRadius: 999,
                  background:
                    seg === "done"
                      ? "linear-gradient(90deg, var(--cloud-primary) 0%, var(--cloud-primary-hover) 100%)"
                      : seg === "now"
                        ? "repeating-linear-gradient(135deg, rgba(12, 92, 171, 0.55) 0 4px, rgba(12, 92, 171, 0.30) 4px 8px)"
                        : "rgba(255, 255, 255, 0.06)",
                  boxShadow:
                    seg === "done"
                      ? "0 0 12px -2px rgba(12, 92, 171, 0.55)"
                      : "none",
                }}
              />
            ))}
          </div>
        )}
        {dateRange && (
          <p
            style={{
              fontSize: 13,
              color: "var(--cloud-text-muted)",
              letterSpacing: "0.02em",
              margin: 0,
              display: "flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            <span>{dateRange.start}</span>
            <ArrowRight style={{ width: 11, height: 11, opacity: 0.5 }} />
            <span>{dateRange.end}</span>
            {currentProgram.session_count && weekSegs && (
              <>
                <span style={{ opacity: 0.5 }}>·</span>
                <span>
                  {(currentProgram.session_count / weekSegs.length).toFixed(
                    currentProgram.session_count % weekSegs.length === 0
                      ? 0
                      : 1,
                  )}{" "}
                  sessions / week
                </span>
              </>
            )}
          </p>
        )}
      </button>
    ) : null;

  const bothColumns = !!meetCell && !!blockCell;

  return (
    <div
      style={{
        position: "relative",
        background:
          "linear-gradient(180deg, rgba(12, 92, 171, 0.14) 0%, rgba(12, 92, 171, 0) 75%), var(--cloud-panel)",
        border: "1px solid rgba(12, 92, 171, 0.40)",
        borderRadius: "var(--cloud-r-lg)",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          content: '""',
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.03), transparent 30%)",
          pointerEvents: "none",
        }}
      />

      <div
        className={`cloud-cycle-grid${bothColumns ? " has-divider" : ""}`}
        style={{ position: "relative" }}
      >
        {meetCell}
        {bothColumns && <div className="cloud-cycle-div" aria-hidden />}
        {blockCell}
      </div>
    </div>
  );
}
