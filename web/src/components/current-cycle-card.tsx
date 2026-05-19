"use client";

import { Trophy, ArrowRight, ExternalLink } from "lucide-react";
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
 * Combined Current Cycle hero card for athlete detail. Top half shows the
 * next meet (icon chip · name · location/date · countdown pill); a hairline
 * divider separates it from the bottom half, which shows the current block
 * (name · week badge · 5-segment progress bar · date range · cadence).
 *
 * Renders nothing when there's no meet AND no program — the page collapses
 * gracefully for athletes who haven't been programmed yet.
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
      weekLabel = `Week ${displayWeek} / ${totalWeeks}`;
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

      {meetUpcoming && (
        <button
          type="button"
          onClick={() =>
            athlete.next_meet_id && onOpenMeet?.(athlete.next_meet_id)
          }
          disabled={!athlete.next_meet_id}
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 12,
            width: "100%",
            padding: "14px 16px",
            background: "transparent",
            border: 0,
            textAlign: "left",
            color: "inherit",
            font: "inherit",
            cursor: athlete.next_meet_id ? "pointer" : "default",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "rgba(12, 92, 171, 0.28)",
              border: "1px solid rgba(12, 92, 171, 0.40)",
              color: "var(--cloud-primary-text)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Trophy style={{ width: 16, height: 16, strokeWidth: 1.8 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              className="cloud-text"
              style={{
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                margin: 0,
              }}
            >
              {athlete.next_meet_name || "Assigned meet"}
            </p>
            <p
              className="cloud-text-muted"
              style={{
                fontSize: 11,
                margin: "2px 0 0",
                letterSpacing: "0.02em",
              }}
            >
              {meetSubtitle}
            </p>
          </div>
          {countdown && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--cloud-primary-text)",
                padding: "4px 10px",
                borderRadius: 999,
                background: "rgba(12, 92, 171, 0.20)",
                border: "1px solid rgba(12, 92, 171, 0.30)",
                fontVariantNumeric: "tabular-nums",
                flexShrink: 0,
              }}
            >
              {countdown}
            </span>
          )}
        </button>
      )}

      {meetUpcoming && hasProgram && (
        <div
          style={{
            height: 1,
            background: "rgba(12, 92, 171, 0.20)",
            margin: "0 16px",
            position: "relative",
          }}
        />
      )}

      {hasProgram && currentProgram && (
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
            padding: "14px 16px",
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
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: weekSegs ? 10 : 0,
              gap: 12,
            }}
          >
            <p
              className="cloud-text"
              style={{
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                minWidth: 0,
              }}
            >
              {currentProgram.program_number && (
                <span style={{ color: "var(--cloud-primary-text)", marginRight: 6 }}>
                  Block {currentProgram.program_number}
                </span>
              )}
              {blockName}
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
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--cloud-primary-text)",
                      fontWeight: 600,
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
          {weekSegs && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${weekSegs.length}, 1fr)`,
                gap: 4,
                marginBottom: 10,
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
                fontSize: 11,
                color: "var(--cloud-text-dim)",
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
      )}
    </div>
  );
}
