"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Users, User, ArrowRight, CheckCircle } from "lucide-react";
import apiClient from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import { Spark } from "@/components/spark";

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

/**
 * Mobile home page (<md). Built to match `mockups/phone-dashboard.html`
 * in the BeStrongOps mobile-redesign branch. Sections without backing
 * data yet show synthetic placeholder values — marked with TODO and
 * intended to be wired up as those endpoints land.
 */
export function MobileHome() {
  const { instance } = useAuth();
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiClient.getSettings(),
  });
  const { data: athletes = [] } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => apiClient.listAthletes(),
  });

  const teamName = instance?.org_name || "BeStrong";
  const today = new Date();
  const dateLabel = formatGreetingDate(today);
  const timeOfDay = getTimeOfDayLabel(today.getHours());
  const coachName = firstName(settings?.coach_display_name) || "Coach";
  const initials = coachName.slice(0, 2).toUpperCase();

  // Roster total comes from real data; the done/open/late split is synthetic
  // until the today-status endpoint lands (see MOBILE_IMPL.md backend notes).
  const rosterTotal = athletes.length || 22;

  // TODO: wire to backend once the today-roster status endpoint exists.
  // Shape will be { scheduled_today, done, open, late }.
  const todaySynthetic = { scheduled: 14, done: 6, open: 6, late: 2 };

  // TODO: wire to weekly aggregator endpoints.
  const synthStats = {
    prs7d: { value: 7, delta: 3, sparkPoints: [2, 3, 2, 4, 3, 5, 4, 7] },
    sessions7d: { value: 38, sparkPoints: [4, 5, 6, 5, 7, 5, 6, 8] },
    flagged: { value: 3, delta: 1, sparkPoints: [1, 1, 2, 1, 2, 2, 3, 3] },
  };

  // TODO: wire to the unified activity feed endpoint.
  const synthReview = [
    { id: "1", initials: "SK", avClass: "cloud-av-3", name: "Sara K.", what: "Back squat 145kg × 3 · new PR", pillLabel: "PR",   pillClass: "pr" },
    { id: "2", initials: "DR", avClass: "cloud-av-2", name: "Diego R.", what: "Missed 2 sessions this week",        pillLabel: "Miss", pillClass: "miss" },
    { id: "3", initials: "AT", avClass: "cloud-av-4", name: "Aiden T.", what: "RPE 9.5 on bench triple · flag",      pillLabel: "Load", pillClass: "load" },
  ];

  // TODO: wire to today's schedule endpoint.
  const synthSchedule = [
    { time: "7:30 AM",  icon: Users, title: "Morning lifters · Group A", meta: "6 athletes · Lower body" },
    { time: "12:00 PM", icon: User,  title: "1:1 · Sara K.",              meta: "PR review · Programming" },
    { time: "5:30 PM",  icon: Users, title: "Evening squad",              meta: "9 athletes · Upper / accessory" },
  ];

  const reviewCount = synthReview.length;
  const sessionCount = synthSchedule.length;

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
          <div className="cloud-mhome-avatar">{initials}</div>
        </header>

        {/* Hero: training today */}
        <div className="cloud-panel-primary cloud-mhome-hero">
          <p className="label">Training today</p>
          <p className="count">
            {todaySynthetic.scheduled}
            <span className="of"> / {rosterTotal} athletes</span>
          </p>
          <div className="bar" role="presentation">
            <div
              className="seg done"
              style={{ width: `${(todaySynthetic.done / rosterTotal) * 100}%` }}
            />
            <div
              className="seg open"
              style={{ width: `${(todaySynthetic.open / rosterTotal) * 100}%` }}
            />
            <div
              className="seg late"
              style={{ width: `${(todaySynthetic.late / rosterTotal) * 100}%` }}
            />
          </div>
          <p className="legend">
            <span className="item">
              <span className="swatch done" />
              <strong>{todaySynthetic.done}</strong> done
            </span>
            <span className="item">
              <span className="swatch open" />
              <strong>{todaySynthetic.open}</strong> open
            </span>
            <span className="item">
              <span className="swatch late" />
              <strong>{todaySynthetic.late}</strong> late
            </span>
          </p>
        </div>

        {/* Stat strip */}
        <div className="cloud-mhome-strip">
          <div className="cloud-mhome-stat">
            <p className="label">PRs · 7d</p>
            <p className="value">
              {synthStats.prs7d.value}
              <span className="delta up">+{synthStats.prs7d.delta}</span>
            </p>
            <p className="sub">vs last week</p>
            <Spark
              className="spark"
              points={synthStats.prs7d.sparkPoints}
              tone="success"
              width={44}
              height={14}
            />
          </div>
          <div className="cloud-mhome-stat">
            <p className="label">Sessions</p>
            <p className="value">{synthStats.sessions7d.value}</p>
            <p className="sub">past 7d</p>
            <Spark
              className="spark"
              points={synthStats.sessions7d.sparkPoints}
              tone="primary"
              width={44}
              height={14}
            />
          </div>
          <div className="cloud-mhome-stat">
            <p className="label">Flagged</p>
            <p className="value">
              {synthStats.flagged.value}
              <span className="delta down">+{synthStats.flagged.delta}</span>
            </p>
            <p className="sub">since Fri</p>
            <Spark
              className="spark"
              points={synthStats.flagged.sparkPoints}
              tone="danger"
              width={44}
              height={14}
            />
          </div>
        </div>

        {/* Needs review */}
        <div className="cloud-mhome-section-h">
          <p className="eyebrow">Needs review</p>
          <Link href="/queue">
            See all <ArrowRight />
          </Link>
        </div>
        <div className="cloud-mhome-review">
          {synthReview.map((item) => (
            <div key={item.id} className="cloud-mhome-rcard">
              <div className={`ava ${item.avClass}`}>{item.initials}</div>
              <div>
                <p className="who">{item.name}</p>
                <p className="what">{item.what}</p>
              </div>
              <span className={`cloud-mhome-pill ${item.pillClass}`}>
                {item.pillLabel}
              </span>
            </div>
          ))}
        </div>

        {/* Today schedule */}
        <div className="cloud-mhome-section-h">
          <p className="eyebrow">
            Today <span className="meta">· {sessionCount} sessions</span>
          </p>
          <Link href="/meets">
            Full week <ArrowRight />
          </Link>
        </div>
        <div className="cloud-mhome-sched">
          {synthSchedule.map((row) => {
            const Icon = row.icon;
            return (
              <div key={row.time} className="row">
                <div className="time">{row.time}</div>
                <div className="chip">
                  <Icon />
                </div>
                <div>
                  <p className="title">{row.title}</p>
                  <p className="meta">{row.meta}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Review FAB */}
      <Link href="/queue" className="cloud-mhome-fab">
        <CheckCircle />
        Review
        <span className="fab-badge">{reviewCount}</span>
      </Link>
    </>
  );
}
