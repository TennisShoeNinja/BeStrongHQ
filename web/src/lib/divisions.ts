

export const STANDARD_DIVISIONS = [
  "Open",
  "Open Raw",
  "Open Equipped",
  "Sub-Junior",
  "Junior",
  "Master 1",
  "Master 2",
  "Master 3",
  "Master 4",
] as const;

export const CUSTOM_DIVISIONS_KEY = "custom_divisions";

export function parseCustomDivisions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((v) => String(v).trim())
      .filter((v) => v.length > 0);
  } catch {
    return [];
  }
}

export function serializeCustomDivisions(divisions: string[]): string {
  const unique = Array.from(new Set(divisions.map((d) => d.trim()).filter(Boolean)));
  unique.sort((a, b) => a.localeCompare(b));
  return JSON.stringify(unique);
}


export function combinedDivisions(
  customRaw: string | null | undefined,
  currentValue: string | null | undefined
): string[] {
  const seen = new Set<string>();
  const combined: string[] = [];
  const add = (v: string) => {
    const t = v.trim();
    if (!t) return;
    if (seen.has(t)) return;
    seen.add(t);
    combined.push(t);
  };
  for (const d of STANDARD_DIVISIONS) add(d);
  for (const d of parseCustomDivisions(customRaw)) add(d);
  if (currentValue) add(currentValue);
  return combined;
}
