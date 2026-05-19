import type { PREventEntry } from "@/lib/types";

export function compactDate(value: string | null): string {
  if (!value) return "Date pending";
  const parts = value.slice(0, 10).split("-").map(Number);
  const date = parts.length === 3 && parts.every(Boolean)
    ? new Date(parts[0], parts[1] - 1, parts[2])
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "Date pending";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function sortRecentFirst(a: PREventEntry, b: PREventEntry): number {
  const dateA = a.recorded_at ?? "";
  const dateB = b.recorded_at ?? "";
  if (dateA !== dateB) return dateB.localeCompare(dateA);
  const blockA = a.program_number ?? 0;
  const blockB = b.program_number ?? 0;
  if (blockA !== blockB) return blockB - blockA;
  return a.variation.localeCompare(b.variation);
}
