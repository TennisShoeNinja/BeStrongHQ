# Changelog

What's new in BeStrong HQ. Versions follow [semver](https://semver.org/) with a
`-beta` suffix while we're still in beta.

## [1.0.8 BETA], 2026-04-25

### Fixed

- **Drive sync only imports your own sheets.** The Drive scan now filters to
  files you own and skips anything shared with you (e.g., a coach's program
  file shared back as a client). Previously a shared spreadsheet that
  appeared in a watched folder could be parsed and create a phantom athlete
  derived from the filename.
- **Folder picker rejects mixed setups.** "My Drive root" (loose sheets)
  and named athlete folders are mutually exclusive in the watch list.
  Picking root clears named folders and vice versa, with a visible note
  explaining the rule.
- **Empty-program imports are rejected.** When the parser finds a session
  grid but extracts zero exercises, the import aborts with an error
  instead of silently creating an athlete and a skeleton program. This
  catches old or non-program workbooks that look program-shaped from the
  filename but don't match the current adapter.
- **Sync writes are atomic.** Program creation, the source URL, and the
  Drive import audit row now commit in a single transaction. Any failure
  in the middle rolls everything back, so a transient hiccup can no
  longer leave a Program row with no audit trail.

## [1.0.7 BETA], 2026-04-25

### Added

- **Track RPE toggle.** A new switch under Configuration → Features lets you
  turn RPE tracking off if your athletes don't log RPE alongside actual
  weight. When off, the RPE Compliance card, the RPE column on the Peak
  Weight table, the "RPE avg" stat on the athletes list, and the RPE block
  in Block Review summaries all hide. Estimated 1RM falls back to the Epley
  formula instead of returning nothing, and the volume-response confidence
  score stops penalizing you for a methodology choice. Default stays on, so
  nothing changes unless you flip it.

### Changed

- **Configuration page split.** The single long Configuration page is now a
  hub of three focused sub-pages: **Profile** (team name, display name,
  weather, Drive sync status), **Features** (default unit, Track RPE),
  and **System** (API connection, workspace details, version). Easier to
  find each setting, room to grow as new toggles land.

## [1.0.6 BETA], 2026-04-25

The Google integration got a real workover this release. Calendar sync grew
from a single-purpose meet pusher into a full team calendar feed with four
toggleable categories, the auth flow no longer needs a desktop browser to
complete, and Drive + Calendar now share a single Google connection so you
only re-auth once a week instead of twice.

### Added

- **Google Calendar sync, properly built out.** Push meets, program-due
  dates, athlete availability, and birthdays to a dedicated **BeStrongHQ**
  calendar that the app provisions automatically when you connect. Each
  category has its own toggle on the Calendar integration page so you can
  pick what shows up. Re-running sync keeps existing events updated rather
  than duplicating, and unchecking a category leaves the events you've
  already pushed alone (delete them from your phone if you don't want
  them).
- **Program-due reminders on your calendar.** Every athlete with a
  `program_due` date gets a "Program due" all-day event that updates
  automatically the moment you change the date in their profile. No
  manual sync needed for due-date edits.
- **Availability ranges on your calendar.** Athletes with both
  availability dates set show up as multi-day "Unavailable" events, so
  the team calendar tells you who is out at a glance.
- **Birthday events.** Athletes with a date of birth get a yearly
  recurring event with `RRULE:FREQ=YEARLY` so Google handles the
  recurrence forever (no annual re-sync). Marked as Free time so they
  don't block your availability views.
- **Athlete profile "Availability" section** with renamed labels (Out
  from / Out through, "Clear availability" button) covering the same
  start/end date range as before. Saved column-config presets named
  "Vacations" carry forward to "Availability" automatically so nobody
  loses a bookmarked layout.

### Changed

- **One Google connection covers Drive and Calendar.** The Drive auth
  flow now requests calendar scope alongside drive and email, so the
  same refresh token works for both integrations. One consent screen,
  one weekly re-auth, both surfaces stay healthy together. The Calendar
  integration page reflects the shared status and points you back to
  the Drive page for connection management.
- **Calendar OAuth converted to web-redirect.** The previous
  Calendar auth flow opened a local browser window via
  `InstalledAppFlow.run_local_server()`, which only worked on
  desktop-style local installs. The new flow uses the standard
  `auth/start` + `auth/callback` web-redirect pattern, identical to
  the Drive integration.
- **Drive page connection panel cleaned up.** Section header is now
  "Google connection" with copy describing both integrations. Dropped
  the redundant "Last sync" line so only "Last successful sync"
  shows. That row turns orange with a "X minutes/hours/days ago, longer
  than expected" suffix when it's older than twice your configured
  auto-sync interval (or 24 hours when auto-sync is off), so you
  notice silent failures without staring at a wall of fine print.
- **Roster availability column labels** match the new wording: column
  headers are "Availability", "Out From", "Out Through". Status pill
  values now read "Available" / "Out, back in N days" / "Out in N
  days" instead of the old "Active / On Vacation / Vacation in".
  Underlying database columns stay `vacation_*` so existing CSV
  exports and integrations keep working unchanged.
- **Dashboard "On vacation" tile renamed to "Unavailable"** and now
  links to the renamed Availability view of the Roster.

### Fixed

- **Dashboard "Unavailable" tile always showed zero.** The dashboard
  was filtering athletes against a status string the backend never
  produced, so the count was permanently `0` regardless of who was
  out. The filter now matches the actual "Out, back in N days" status
  the availability helper returns.

## [1.0.5 BETA], 2026-04-23

### Fixed

- **Drive organization on fresh installs.** The "Scan Drive" button returned
  a 400 when the coach had only configured watched folders through the modern
  folder picker (which clears the legacy single-folder setting). Organization
  now correctly runs against My Drive root when it's one of the watched
  folders.

### Changed

- **Drive organization only applies to root-watchers.** If you've already
  organized your sheets into per-athlete folders and are watching those
  directly, the Scan Drive button is now disabled with an inline explanation.
  The feature exists to group loose sheets, so it has nothing to do when
  your Drive is already tidy.

## [1.0.4 BETA], 2026-04-23

### Added

- **Google Drive root as a sync source.** Coaches who keep program sheets
  loose in My Drive (rather than organized into per-athlete folders) can now
  check "My Drive root" in the folder picker. The picker shows a live sheet
  count so you can see what's there before committing. Root-sourced files
  route the athlete name through your filename pattern instead of the folder
  name.
- **xlsx uploads sync just like Google Sheets.** If you drag an .xlsx file
  straight into Drive without converting, sync now picks it up anyway. Native
  Google Sheets are still converted on Google's side; xlsx uploads are
  streamed directly. The folder sheet-count and the DriveOrganizer grouping
  also include xlsx uploads.

## [1.0.3 BETA], 2026-04-23

### Added

- **In-app feedback button.** The help icon in the topbar now opens a
  "Got feedback?" dialog with one-click buttons to file a bug, share an idea,
  or browse existing issues on GitHub. Designed so testers never have to hunt
  for where to send feedback.
- **Issue templates** for bug reports and feature feedback, so GitHub issues
  arrive with the context needed to act on them.
- **ACKNOWLEDGMENTS.md** crediting beta testers, bug reporters, and design
  input. If your feedback shaped a release, you get listed.

### Changed

- **Sidebar label**: "Settings" renamed to "Configuration" to match the page
  it links to (previously two different words for the same thing).

## [1.0.2 BETA] — 2026-04-19

### Added

- **Rep PRs.** The app now celebrates every rep-range PR (1RM, 2RM, 3RM … up to
  10RM) on squat / bench / deadlift compound variations, not just singles.
  Variations are tracked separately — a Close-Grip Bench PR and a Competition
  Bench PR don't get mashed together.
- **New PRs banner** at the top of each athlete's profile, surfacing PRs from
  their current block. Dismissible per program so it reappears fresh each block.
- **PR History filters.** Filter by rep count (e.g. "show me all 3RMs") and by
  exercise variation. Dropdowns only list options that actually exist in the
  current view.
- **Current best ↔ All events toggle** on the PR History Timeline. Default shows
  one row per (lift, exercise, reps) combo; toggle to expand into the full
  progression history.
- **`bestrong resync-all`** CLI for bulk reimport after parser upgrades.
- **`bestrong backfill-prs`** CLI for rebuilding auto-generated PR rows after a
  PR-logic change.

### Changed

- **Progression Charts filter UX**: default rep filter is now `1-3`, Primary
  Only defaults off, block selector shows program names alongside the block
  number, variation chips collapsed into a single dropdown, last-lift toggle
  disables instead of silently no-op, filter state snapshots + restores when
  a highlight is cleared.
- **Outlier detection rewritten** using a percent-of-median deviation instead of
  a z-score. Points flagged as outliers get a dashed amber ring on the chart and
  a one-click "Open source sheet" link.
- **Block Review — PRs This Block**: collapses to the heaviest event per
  (exercise, reps) combo, shows rep badges + variation names. No more 154 → 157
  → 160 progression noise within a single block.
- **PR History Timeline**: rep badges (3RM / 6RM / Total), variation sublines,
  refined filter controls, "Current best" default view.

### Fixed

- `Copy of ...` files from Google Drive are now rejected at import. Seventeen
  historical duplicates were cleaned up as part of the rollout.
- Accessories like "Smith Machine Incline Bench" or "Goblet Squats" no longer
  leak into compound PR / outlier / peak-lifts pipelines — compound
  classification is now purely color-based (the coach's yellow / light green /
  light blue on the exercise name).
- Past meets auto-clear from "next meet" fields once their date passes — no
  more stale meets showing weeks after they're over.
- RPE compliance denominator now restricted to rows where the coach painted the
  RPE cell pink. Accessories don't drag the number down anymore.
- RPE parsing tolerates ranges (`7-8` → 7.5), text wrapped around a number
  (`rpe7` → 7), and flags out-of-range values for manual review with the raw
  cell text preserved.

### Database

Schema migrations run automatically on startup. New columns were added to
`max_history` (rep PR tracking), `exercise_entries` (cell-fill flags), and
`athletes` (goal bodyweight, body metrics visibility). No data loss.

---

## [1.0.1 BETA] and earlier

Pre-changelog. See git history for details.
