"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import apiClient from "@/lib/api";
import { PortalSidebar } from "@/components/portal-sidebar";
import * as Types from "@/lib/types";

// TODO: This route is currently coach-only via AuthLayout. Once athlete-side
// auth ships, gate this with athlete-token verification AND keep a coach
// "preview" entry; do not let coach AuthLayout alone become the portal door.
function parseMeetDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function todayStart(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function isUpcomingMeet(meet: Types.MeetListResponse): boolean {
  const meetDate = parseMeetDate(meet.meet_date);
  if (!meetDate) return false;
  return meetDate >= todayStart();
}

function daysUntilMeet(meet: Types.MeetResponse): number | null {
  const meetDate = parseMeetDate(meet.meet_date);
  if (!meetDate) return null;
  const diffMs = meetDate.getTime() - todayStart().getTime();
  return Math.max(0, Math.round(diffMs / 86400000));
}

function formatCountdown(meet: Types.MeetResponse): string {
  const days = daysUntilMeet(meet);
  if (days === null) return "date pending";
  if (days === 0) return "today";
  return `in ${days} days`;
}

function formatMeetDate(iso: string | null | undefined): string {
  const date = parseMeetDate(iso);
  if (!date) return "Date pending";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function meetLocation(meet: Types.MeetResponse): string | null {
  const location = meet.location?.trim();
  return location || null;
}

export default function AthletePortalMeetsPage() {
  const params = useParams();
  const athleteId = parseInt(params.id as string, 10);

  const { data: athlete } = useQuery({
    queryKey: ["athlete", athleteId],
    queryFn: () => apiClient.getAthlete(athleteId),
  });
  const { data: meets = [] } = useQuery({
    queryKey: [athleteId, "portal", "meets"],
    queryFn: () => apiClient.listMeets(),
  });

  const futureMeets = useMemo(() => {
    return meets
      .filter(isUpcomingMeet)
      .sort((a, b) => {
        const aTime = parseMeetDate(a.meet_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bTime = parseMeetDate(b.meet_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });
  }, [meets]);

  const meetDetails = useQueries({
    queries: futureMeets.map((meet) => ({
      queryKey: [athleteId, "portal", "meet", meet.id],
      queryFn: () => apiClient.getMeet(meet.id),
    })),
  });

  const upcomingAssignedMeets = useMemo(() => {
    return meetDetails
      .map((result) => result.data)
      .filter((meet): meet is Types.MeetResponse => {
        return (
          !!meet &&
          isUpcomingMeet(meet) &&
          (meet.competing_athletes ?? []).some((assigned) => assigned.id === athleteId)
        );
      })
      .sort((a, b) => {
        const aTime = parseMeetDate(a.meet_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bTime = parseMeetDate(b.meet_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      })
      .slice(0, 3);
  }, [meetDetails, athleteId]);

  const athleteName = athlete?.name ?? "Athlete";

  return (
    <div style={{ padding: "var(--cloud-s5)" }}>
      <div
        className="mx-auto flex flex-col lg:flex-row"
        style={{ maxWidth: 1100, gap: "var(--cloud-s4)" }}
      >
        <div className="w-full lg:w-60 lg:shrink-0">
          <PortalSidebar
            athleteId={athleteId}
            athleteName={athleteName}
            athleteEmail={athlete?.email}
            lastUpdatedISO={athlete?.updated_at}
            activeTab="meets"
          />
        </div>

        <main
          className="flex min-w-0 flex-1 flex-col"
          style={{ gap: "var(--cloud-s4)" }}
        >
          <Link
            href={`/athletes/${athleteId}`}
            className="cloud-btn cloud-btn-ghost"
            style={{ alignSelf: "flex-start" }}
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={1.8} />
            Back to athlete
          </Link>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1
                className="font-semibold cloud-text"
                style={{
                  fontSize: 32,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.05,
                  margin: 0,
                }}
              >
                {athleteName}
              </h1>
              <p className="cloud-text-dim" style={{ marginTop: 8 }}>
                Upcoming meets
              </p>
            </div>
            <div
              className="cloud-eyebrow-sm"
              style={{
                border: "1px solid var(--cloud-border)",
                borderRadius: "var(--cloud-r-sm)",
                padding: "6px 10px",
                background: "var(--cloud-panel)",
                whiteSpace: "nowrap",
              }}
            >
              COACH PREVIEW
            </div>
          </div>

          {upcomingAssignedMeets.length === 0 ? (
            <section
              className="cloud-panel-raised"
              style={{ padding: "var(--cloud-s4)" }}
            >
              <p className="cloud-eyebrow" style={{ marginBottom: 8 }}>
                UPCOMING MEETS
              </p>
              <p className="cloud-text-dim" style={{ margin: 0 }}>
                No upcoming meets scheduled.
              </p>
            </section>
          ) : (
            <div className="flex flex-col" style={{ gap: "var(--cloud-s4)" }}>
              {upcomingAssignedMeets.map((meet) => {
                const location = meetLocation(meet);
                return (
                  <section
                    key={meet.id}
                    className="cloud-panel-raised"
                    style={{ padding: "var(--cloud-s4)" }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2
                        className="cloud-text font-semibold"
                        style={{ margin: 0, fontSize: 20, lineHeight: 1.2 }}
                      >
                        {meet.name}
                      </h2>
                      <span
                        className="cloud-eyebrow-sm"
                        style={{
                          color: "var(--cloud-text-dim)",
                          border: "1px solid var(--cloud-border)",
                          borderRadius: "var(--cloud-r-sm)",
                          padding: "4px 8px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatCountdown(meet)}
                      </span>
                    </div>

                    <p className="cloud-text-dim" style={{ marginTop: 10 }}>
                      {formatMeetDate(meet.meet_date)}
                      {location && <span> | {location}</span>}
                    </p>

                    {meet.federation && (
                      <p
                        className="cloud-text-dim"
                        style={{ marginTop: 8, fontSize: 12 }}
                      >
                        {meet.federation}
                      </p>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
