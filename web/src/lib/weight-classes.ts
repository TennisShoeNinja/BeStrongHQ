/**
 * Weight-class options for the Edit Profile dropdown.
 *
 * IPF and USAPL share the same class list (USAPL aligned with IPF), so
 * we keep a single canonical list per sex. Coaches can add custom
 * classes (e.g. USPA classes like 67.5 KG, or legacy classes) via a
 * global list stored in the `settings` table under
 * `custom_weight_classes_m` / `custom_weight_classes_f`.
 *
 * Any class added by a coach becomes available in the dropdown for
 * every athlete of the same sex — the ask was explicitly "make it an
 * option across the other athletes."
 */

export const IPF_WEIGHT_CLASSES_M = [
  "53 KG",
  "59 KG",
  "66 KG",
  "74 KG",
  "83 KG",
  "93 KG",
  "105 KG",
  "120 KG",
  "120+ KG",
] as const;

export const IPF_WEIGHT_CLASSES_F = [
  "43 KG",
  "47 KG",
  "52 KG",
  "57 KG",
  "63 KG",
  "69 KG",
  "76 KG",
  "84 KG",
  "84+ KG",
] as const;

export type AthleteSex = "M" | "F";

export function standardWeightClasses(sex: AthleteSex | null | undefined): readonly string[] {
  if (sex === "M") return IPF_WEIGHT_CLASSES_M;
  if (sex === "F") return IPF_WEIGHT_CLASSES_F;
  return [];
}

const CUSTOM_KEY_M = "custom_weight_classes_m";
const CUSTOM_KEY_F = "custom_weight_classes_f";

export function customWeightClassesKey(sex: AthleteSex): string {
  return sex === "M" ? CUSTOM_KEY_M : CUSTOM_KEY_F;
}


export function parseCustomClasses(raw: string | null | undefined): string[] {
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


export function serializeCustomClasses(classes: string[]): string {
  const unique = Array.from(new Set(classes.map((c) => c.trim()).filter(Boolean)));
  unique.sort();
  return JSON.stringify(unique);
}


export function weightClassCapKg(cls: string | null | undefined): number | null {
  if (!cls) return null;
  const match = /^(\d+(?:\.\d+)?)\s*(\+)?/.exec(cls.trim());
  if (!match) return null;
  if (match[2]) return null;
  const num = parseFloat(match[1]);
  return Number.isFinite(num) ? num : null;
}

function weightClassSortKey(cls: string): [number, number] {
  const match = /^(\d+(?:\.\d+)?)\s*(\+)?/.exec(cls.trim());
  if (!match) return [Number.POSITIVE_INFINITY, 0];
  const num = parseFloat(match[1]);
  if (!Number.isFinite(num)) return [Number.POSITIVE_INFINITY, 0];
  return [num, match[2] ? 1 : 0];
}

export function sortWeightClasses(classes: string[]): string[] {
  return [...classes].sort((a, b) => {
    const [aNum, aPlus] = weightClassSortKey(a);
    const [bNum, bPlus] = weightClassSortKey(b);
    if (aNum !== bNum) return aNum - bNum;
    return aPlus - bPlus;
  });
}


export function combinedWeightClasses(
  sex: AthleteSex | null | undefined,
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

  for (const c of standardWeightClasses(sex)) add(c);
  if (sex) for (const c of parseCustomClasses(customRaw)) add(c);
  if (currentValue) add(currentValue);

  return sortWeightClasses(combined);
}


export function normalizeDateForInput(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(trimmed);
  if (slash) {
    const mm = slash[1].padStart(2, "0");
    const dd = slash[2].padStart(2, "0");
    let yyyy = slash[3];
    if (yyyy.length === 2) {
      const n = parseInt(yyyy, 10);
      yyyy = n >= 50 ? `19${yyyy}` : `20${yyyy}`;
    }
    return `${yyyy}-${mm}-${dd}`;
  }
  return "";
}


export function ageFromDob(dob: string | null | undefined): number | null {
  const iso = normalizeDateForInput(dob);
  if (!iso) return null;
  const then = new Date(iso + "T00:00:00");
  if (Number.isNaN(then.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - then.getFullYear();
  const m = now.getMonth() - then.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < then.getDate())) age -= 1;
  return age;
}
