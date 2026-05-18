import * as Types from "@/lib/types";
import parseLocalDate from "@/lib/parseLocalDate";


export type HighlightedExercise = {
  exercise_name: string;
  program_number: number;
  week_number: number;
  day_number: number;
  reps: number;
  weight_lbs: number;
  lift_category: string;
};


export type MeetGroup = {
  key: string;
  meet_id: number | null;
  meet_name: string | null;
  meet_date: string | null;
  federation: string | null;
  weight_class: string | null;
  division: string | null;
  rows: Types.MeetResultEntry[];
};


export const DIVISIONS = [
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


export const LIFT_COLORS: Record<string, string> = {
  squat: "#f97316",   
  bench: "#22d3ee",   
  deadlift: "#a78bfa", 
};


export function formatDate(dateStr: string | undefined | null) {
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


export function formatMeetCountdown(meetDate: string | undefined | null): string | null {
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


export function subscribeToCompMaxesPref(cb: () => void): () => void {
  if (typeof window === "undefined") return () => { };
  
  
  
  window.addEventListener("bestrong:compMaxesPrefChanged", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("bestrong:compMaxesPrefChanged", cb);
    window.removeEventListener("storage", cb);
  };
}


export function getCompMaxesPref(): boolean {
  if (typeof window === "undefined") return false;
  
  
  return window.localStorage.getItem("bestrong.showCompMaxes") === "true";
}


export function getCompMaxesPrefServer(): boolean {
  return false;
}


export function groupMeetResults(rows: Types.MeetResultEntry[]): MeetGroup[] {
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
export function formatMeetDate(d: string | null | undefined): string | null {
  const dt = parseLocalDate(d);
  if (!dt) return null;
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
export function formatPlace(raw: string | null | undefined): string | null {
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
