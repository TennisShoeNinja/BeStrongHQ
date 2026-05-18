"use client";

import { Clock } from "lucide-react";
import * as Types from "@/lib/types";
import { formatMeetCountdown } from "./utils";


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
