"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import * as Types from "@/lib/types";
import { formatMeetCountdown } from "./utils";

// Whole days from today to a "YYYY-MM-DD" date. Positive = future,
// negative = past. Null when the date is missing/unparseable.
function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const clean = dateStr.split("T")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null;
  const target = new Date(clean + "T00:00:00");
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function ProfileStatusPills({
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

  // Program-due pill label + urgency. Empty date stays neutral with a
  // "set it" prompt; overdue or within a week reads as amber.
  const dueDays = daysUntil(athlete.program_due);
  const dueLabel =
    dueDays == null
      ? "Set program due"
      : dueDays === 0
        ? "Program due today"
        : dueDays > 0
          ? `Program due in ${dueDays}d`
          : `Program overdue ${Math.abs(dueDays)}d`;
  const dueWarn = dueDays != null && dueDays <= 7;

  const meetCountdown = formatMeetCountdown(athlete.meet_date);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Program due: opens the existing date/reminder controls in a popover. */}
      <PopoverPrimitive.Root>
        <PopoverPrimitive.Trigger
          className={`cloud-status-pill${dueWarn ? " cloud-status-pill--warn" : ""}`}
          title="Set program due date and reminder"
        >
          <span className="cloud-status-pill__dot" aria-hidden />
          {dueLabel}
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner side="bottom" align="start" sideOffset={8}>
            <PopoverPrimitive.Popup
              className="cloud-panel-raised z-50 origin-[var(--transform-origin)] rounded-xl outline-none ring-1 ring-foreground/10 transition-[transform,opacity] duration-150 ease-out data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-top-1 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-top-1"
              style={{
                width: 280,
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
                  margin: "0 0 8px",
                }}
              >
                Program due
              </PopoverPrimitive.Title>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={localProgramDue}
                  onChange={(e) => {
                    setLocalProgramDue(e.target.value);
                    if (e.target.value)
                      onInlineUpdate("program_due", e.target.value);
                  }}
                  style={{
                    backgroundColor: "rgba(255,255,255,0.03)",
                    borderColor: "var(--cloud-border)",
                    color: "var(--cloud-text)",
                    colorScheme: "dark",
                  }}
                  className="border rounded px-2 py-1 text-xs"
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
              </div>

              <label
                className="cloud-text-dim block"
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontWeight: 500,
                  margin: "12px 0 6px",
                }}
              >
                Reminder
              </label>
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
                className="border rounded px-2 py-1 text-xs cloud-text-muted cursor-pointer w-full"
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
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      {/* Next meet: jumps to the meet when one is assigned. */}
      {meetUpcoming && (
        <button
          type="button"
          onClick={() =>
            athlete.next_meet_id && onOpenMeet(athlete.next_meet_id)
          }
          disabled={!athlete.next_meet_id}
          className="cloud-status-pill cloud-status-pill--primary"
        >
          <span className="cloud-status-pill__dot" aria-hidden />
          <span
            className="truncate"
            style={{ maxWidth: 220 }}
          >
            {athlete.next_meet_name || "Next meet"}
            {meetCountdown ? ` · ${meetCountdown}` : ""}
          </span>
        </button>
      )}

      {/* Availability: only when the athlete is flagged as out. */}
      {availabilityActive && (
        <span
          className="cloud-status-pill cloud-status-pill--warn"
          style={{ cursor: "default" }}
          title={
            athlete.out_from || athlete.out_through
              ? `${athlete.out_from || "?"} → ${athlete.out_through || "?"}`
              : undefined
          }
        >
          <span className="cloud-status-pill__dot" aria-hidden />
          {athlete.availability_status}
        </span>
      )}
    </div>
  );
}
