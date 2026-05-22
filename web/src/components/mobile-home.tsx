"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { User, ArrowRight, Search, Trophy, X } from "lucide-react";
import apiClient from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import * as Types from "@/lib/types";
import PRDetailModal from "@/components/PRDetailModal";

function formatGreetingDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getTimeOfDayLabel(hour: number): string {
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

function firstName(displayName: string | undefined | null): string | null {
  if (!displayName) return null;
  const trimmed = displayName.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
}

const PILL_LABEL: Record<"pr" | "miss" | "load", string> = {
  pr: "PR",
  miss: "MISS",
  load: "LOAD",
};

/**
 * Mobile home page (<md). Built to match `mockups/phone-dashboard.html`
 * in the BeStrongOps mobile-redesign branch.
 */
export function MobileHome() {
  const { instance } = useAuth();
  const [selectedPRItem, setSelectedPRItem] = useState<Types.NeedsReviewItem | null>(null);
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiClient.getSettings(),
  });
  const { data: athletes = [] } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => apiClient.listAthletes(),
  });
  const { data: todayStatus, isLoading: todayStatusLoading } = useQuery({
    queryKey: ["todayStatus"],
    queryFn: () => apiClient.getTodayStatus(),
  });
  const { data: needsReview = [] } = useQuery({
    queryKey: ["needsReview"],
    queryFn: () => apiClient.getNeedsReview(3),
  });
  const { data: todaySchedule = [] } = useQuery({
    queryKey: ["todaySchedule"],
    queryFn: () => apiClient.getTodaySchedule(),
  });
  const { data: selectedPRHistory = [] } = useQuery({
    queryKey: ["maxHistory", selectedPRItem?.athlete_id],
    queryFn: () => {
      if (!selectedPRItem) return Promise.resolve([]);
      return apiClient.getMaxHistory(selectedPRItem.athlete_id);
    },
    enabled: selectedPRItem !== null,
  });

  const teamName = instance?.org_name || "BeStrong";
  const today = new Date();
  const todayWeekday = today.getDay() === 0 ? 7 : today.getDay();
  const dateLabel = formatGreetingDate(today);
  const timeOfDay = getTimeOfDayLabel(today.getHours());
  const coachName = firstName(settings?.coach_display_name) || "Coach";

  const rosterTotal = todayStatus?.roster_total ?? athletes.length;
  const scheduledToday = todayStatus?.scheduled_today ?? 0;
  const activeProgramCount = todayStatus?.with_active_program ?? 0;
  const syncedToday = todayStatus?.synced_today ?? 0;
  const scheduledPct = rosterTotal > 0 ? (scheduledToday / rosterTotal) * 100 : 0;

  const recentPRs = needsReview.filter((item) => item.kind === "pr");
  const selectedPR = useMemo(() => {
    if (!selectedPRItem?.target_id) return null;
    return selectedPRHistory.find((entry) => entry.id === selectedPRItem.target_id) ?? null;
  }, [selectedPRHistory, selectedPRItem]);
  const todayRows = useMemo(() => {
    return todaySchedule
      .map((row) => {
        const rowAthletes =
          row.athletes?.length
            ? row.athletes
            : athletes
                .filter((athlete) => {
                  if (row.title === "Squat day") return athlete.primary_squat_day === todayWeekday;
                  if (row.title === "Bench day") return athlete.primary_bench_day === todayWeekday;
                  if (row.title === "Deadlift day") {
                    return athlete.primary_deadlift_day === todayWeekday;
                  }
                  return false;
                })
                .map((athlete) => ({ id: athlete.id, name: athlete.name }));
        return {
          ...row,
          athletes: rowAthletes.sort((a, b) => a.name.localeCompare(b.name)),
        };
      })
      .filter((row) => row.athletes.length > 0);
  }, [athletes, todaySchedule, todayWeekday]);
  const todayAthleteCount = useMemo(() => {
    const athleteIds = new Set<number>();
    todayRows.forEach((row) => {
      row.athletes.forEach((athlete) => {
        athleteIds.add(athlete.id);
      });
    });
    return athleteIds.size;
  }, [todayRows]);

  return (
    <>
      <div className="cloud-mhome-wrap">
        {/* Header */}
        <header className="cloud-mhome-header">
          <div className="left">
            <p className="cloud-mhome-team-eyebrow">
              <span>{teamName}</span>
              <span className="sep" aria-hidden />
              <span className="date">{dateLabel}</span>
            </p>
            <h1 className="cloud-mhome-greeting">
              {timeOfDay},{" "}
              <span className="cloud-text-grad-blue">{coachName}</span>.
            </h1>
          </div>
          <HomeSearch />
        </header>

        {/* Hero: training today */}
        <div className="cloud-panel-primary cloud-mhome-hero">
          <p className="label">Training today</p>
          <p className="count">
            {scheduledToday}
            <span className="of"> / {rosterTotal} athletes</span>
          </p>
          <div
            className={`bar ${todayStatusLoading ? "is-loading" : ""}`}
            role="presentation"
          >
            <div
              className="seg done"
              style={{ width: `${scheduledPct}%` }}
            />
          </div>
          <p className="legend">
            <strong>{scheduledToday}</strong> scheduled ·{" "}
            <strong>{activeProgramCount}</strong> on a program ·{" "}
            <strong>{syncedToday}</strong> synced today
          </p>
        </div>

        {/* Today schedule */}
        {todaySchedule.length > 0 && (
          <>
            <div className="cloud-mhome-section-h">
              <p className="eyebrow">
                Today <span className="meta">· {todayAthleteCount} athlete{todayAthleteCount === 1 ? "" : "s"}</span>
              </p>
              <Link href="/meets">
                Full week <ArrowRight />
              </Link>
            </div>
            <div className="cloud-mhome-sched">
              {todayRows.map((row, idx) => (
                <div key={`${row.title}-${idx}`} className="row">
                  <div className="chip">
                    <User />
                  </div>
                  <div className="summary">
                    <p className="title">{row.title}</p>
                    <div className="athletes">
                      {row.athletes.map((athlete) => (
                        <Link key={athlete.id} href={`/athletes/${athlete.id}`}>
                          {athlete.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Recent PRs */}
        {recentPRs.length > 0 && (
          <>
            <div className="cloud-mhome-section-h">
              <p className="eyebrow">Recent PRs</p>
            </div>
            <div className="cloud-mhome-review">
              {recentPRs.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  className="cloud-mhome-rcard"
                  onClick={() => setSelectedPRItem(item)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedPRItem(item);
                    }
                  }}
                  aria-label={`Open ${item.athlete_name} PR details`}
                >
                  <div className={`ava ${item.avatar_class}`}>{item.athlete_initials}</div>
                  <div>
                    <p className="who">
                      <Link
                        href={`/athletes/${item.athlete_id}`}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        {item.athlete_name}
                      </Link>
                    </p>
                    <p className="what">{item.title}</p>
                  </div>
                  <span className={`cloud-mhome-pill ${item.kind}`}>
                    {PILL_LABEL[item.kind]}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <PRDetailModal
        open={selectedPRItem !== null && selectedPR !== null}
        onClose={() => setSelectedPRItem(null)}
        pr={selectedPR}
        allHistory={selectedPRHistory}
        athleteName={selectedPRItem?.athlete_name ?? null}
      />
    </>
  );
}

/**
 * Spyglass in the mobile home header. Collapsed it is an icon button; tapping
 * it expands into a fixed top search bar with live athlete/meet results,
 * mirroring the desktop topbar's expand-on-tap pattern.
 */
function HomeSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), 250);
    return () => clearTimeout(handle);
  }, [value]);

  const { data: results } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => apiClient.search(debounced, 6),
    enabled: debounced.trim().length > 0,
    staleTime: 10_000,
  });

  const close = () => {
    setExpanded(false);
    setValue("");
    setDebounced("");
  };

  const hasResults =
    !!results && (results.athletes.length > 0 || results.meets.length > 0);

  if (!expanded) {
    return (
      <button
        type="button"
        className="cloud-mhome-search-btn"
        aria-label="Search"
        onClick={() => {
          setExpanded(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        <Search />
      </button>
    );
  }

  return (
    <>
      <div className="cloud-mhome-search-scrim" onClick={close} aria-hidden />
      <div className="cloud-mhome-search-bar">
        <Search className="icon" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search athletes, meets…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Search"
        />
        <button
          type="button"
          className="close"
          aria-label="Close search"
          onClick={close}
        >
          <X />
        </button>
        {debounced.trim() && (
          <div className="cloud-mhome-search-results cloud-panel-raised">
            {!results ? (
              <p className="empty">Searching…</p>
            ) : !hasResults ? (
              <p className="empty">No matches for &ldquo;{debounced}&rdquo;</p>
            ) : (
              <>
                {results.athletes.length > 0 && (
                  <div>
                    <p className="group">Athletes</p>
                    {results.athletes.map((a) => (
                      <Link
                        key={`ath-${a.id}`}
                        href={`/athletes/${a.id}`}
                        onClick={close}
                        className="cloud-search-hit"
                      >
                        <User className="w-3.5 h-3.5 cloud-text-muted" />
                        <span className="cloud-text">{a.name}</span>
                      </Link>
                    ))}
                  </div>
                )}
                {results.meets.length > 0 && (
                  <div>
                    <p className="group">Meets</p>
                    {results.meets.map((m) => (
                      <Link
                        key={`meet-${m.id}`}
                        href={`/meets/${m.id}`}
                        onClick={close}
                        className="cloud-search-hit"
                      >
                        <Trophy className="w-3.5 h-3.5 cloud-text-muted" />
                        <span className="cloud-text flex-1 truncate">
                          {m.name}
                        </span>
                        {m.meet_date && (
                          <span
                            className="cloud-text-dim"
                            style={{ fontSize: 11 }}
                          >
                            {m.meet_date}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
