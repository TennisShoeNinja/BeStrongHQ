// What's New entries shown in the in-app popover.
//
// Discipline rules — read before adding an entry:
//   1. Only things a coach can DO RIGHT NOW. Not bug fixes, not internal
//      refactors, not "we shipped X under the hood". If the answer to "what
//      changed for the coach?" is fuzzy, leave it out.
//   2. Body must be ONE sentence. Two if you really need it.
//   3. Hard cap of 5 visible entries (MAX_VISIBLE). Adding a 6th means
//      removing the oldest. The cap is the point.
//   4. Prefer a CTA that lands on the feature itself over a "learn more" link.
//
// Order: newest first.

export interface WhatsNewEntry {
  id: string;
  date: string;
  title: string;
  body: string;
  cta?: { label: string; href: string };
}

export const MAX_VISIBLE = 5;

const ENTRIES: WhatsNewEntry[] = [
  {
    id: "2026-05-work-queue",
    date: "2026-05-05",
    title: "The Work Queue: programs come to you",
    body: "Set a due date on an athlete and their programs surface in the queue automatically when they need attention. Or add an athlete manually from the queue to start working through theirs now.",
    cta: { label: "Open the queue", href: "/queue" },
  },
  {
    id: "2026-05-opl-integration",
    date: "2026-05-01",
    title: "OpenPowerlifting meet results in the PR lane",
    body: "Open an athlete's three-dot menu to search OpenPowerlifting for their lifter profile. Their meet history then feeds the same PR lane as training, so prior bests reflect what they hit on the platform.",
    cta: { label: "Pick an athlete", href: "/athletes" },
  },
];

export const WHATS_NEW_ENTRIES: WhatsNewEntry[] = ENTRIES.slice(0, MAX_VISIBLE);

const STORAGE_KEY = "bestrong_whats_new_last_seen";

export function getLatestEntryId(): string | null {
  return WHATS_NEW_ENTRIES[0]?.id ?? null;
}

export function readLastSeenId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeLastSeenId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // localStorage unavailable (private mode, quota); silently ignore.
  }
}

export function hasUnseenEntries(): boolean {
  const latest = getLatestEntryId();
  if (!latest) return false;
  return readLastSeenId() !== latest;
}
