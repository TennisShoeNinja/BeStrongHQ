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
    id: "2026-05-celebration-prs",
    date: "2026-05-19",
    title: "Celebration PRs",
    body: "A training single that ties an existing competition PR now reads as Comp Match instead of a confusing +0, and per-exercise variations merge per athlete so debut entries no longer seed a bogus PR.",
    cta: { label: "Pick an athlete", href: "/athletes" },
  },
  {
    id: "2026-05-opl-integrations-page",
    date: "2026-05-19",
    title: "OpenPowerlifting integrations page",
    body: "A new page under Integrations shows OPL link status for every athlete on one screen, with one-click auto-link by name when the match is unambiguous.",
    cta: { label: "Open the page", href: "/integrations/openpowerlifting" },
  },
  {
    id: "2026-05-achievement-badges-share",
    date: "2026-05-13",
    title: "Achievement badges and a Share menu",
    body: "Career PR milestones surface as medallions at the top of each athlete page. A new Share icon next to the three-dot menu exports a Profile card, Recent PR sticker, Competition History card, or Achievements card.",
    cta: { label: "Pick an athlete", href: "/athletes" },
  },
  {
    id: "2026-05-brand-pull-reskin",
    date: "2026-05-13",
    title: "Brand-pull reskin",
    body: "Every page rebuilt in the BeStrong HQ visual language. Home, athletes, meets, inbox, queue, configuration. The product now looks like the marketing site.",
    cta: { label: "Take a look", href: "/" },
  },
];

export const FULL_CHANGELOG_URL = "https://bestronghq.com/changelog";

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
