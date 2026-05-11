"use client";

import { useState, useMemo, type CSSProperties } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import * as Types from "@/lib/types";
import { AlertCircle, ArrowUpDown, Plus, Search } from "lucide-react";

type SortField = "name" | "date" | "federation" | "athlete_count" | "weeks_out";

const MICRO_LABEL: CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 500,
};

const INPUT_STYLE: CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  fontSize: 13,
  borderRadius: 8,
  backgroundColor: "var(--cloud-surface-raised)",
  border: "1px solid var(--cloud-border)",
  color: "var(--cloud-text)",
  outline: "none",
};

export default function MeetsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [showPast, setShowPast] = useState(false);
  const { instance } = useAuth();
  const teamName = instance?.org_name || "BeStrong";

  const { data: meets = [], isLoading, error } = useQuery({
    queryKey: ["meets"],
    queryFn: () => apiClient.listMeets(),
  });

  const { data: athletes = [] } = useQuery({
    queryKey: ["athletes", false],
    queryFn: () => apiClient.listAthletes(false),
  });

  const athletesByMeet = useMemo(() => {
    const map: Record<number, { id: number; name: string }[]> = {};
    for (const a of athletes) {
      if (a.next_meet_id) {
        if (!map[a.next_meet_id]) map[a.next_meet_id] = [];
        map[a.next_meet_id].push({ id: a.id, name: a.name });
      }
    }
    return map;
  }, [athletes]);

  const formatDate = (dateStr: string | undefined | null) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
  };

  const formatDateRange = (meet: Types.MeetListResponse) => {
    if (!meet.meet_date) return "—";
    const start = formatDate(meet.meet_date);
    if (meet.meet_date_end && meet.meet_date_end !== meet.meet_date) {
      const end = formatDate(meet.meet_date_end);
      return `${start} → ${end}`;
    }
    return start;
  };

  const isMeetPast = (meet: Types.MeetListResponse) => {
    if (!meet.meet_date) return false;
    const meetDate = new Date(meet.meet_date + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return meetDate < today;
  };

  const weeksOutColor = (meet: Types.MeetListResponse): string => {
    if (isMeetPast(meet)) return "var(--cloud-text-muted)";
    if (meet.weeks_out === null || meet.weeks_out === undefined)
      return "var(--cloud-text-muted)";
    if (meet.weeks_out <= 4) return "#fca5a5";
    if (meet.weeks_out <= 8) return "#fb923c";
    return "#67e8f9";
  };

  const weeksOutBarColor = (meet: Types.MeetListResponse): string => {
    if (isMeetPast(meet)) return "var(--cloud-border)";
    if (meet.weeks_out === null || meet.weeks_out === undefined)
      return "var(--cloud-border)";
    if (meet.weeks_out <= 4) return "#ef4444";
    if (meet.weeks_out <= 8) return "#f97316";
    return "#06b6d4";
  };

  const weeksOutProgress = (meet: Types.MeetListResponse): number => {
    if (meet.weeks_out === null || meet.weeks_out === undefined) return 0;
    return Math.min(100, Math.max(5, (meet.weeks_out / 30) * 100));
  };

  const filteredAndSortedMeets = useMemo(() => {
    let result = [...meets];

    if (!showPast) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      result = result.filter((meet) => {
        if (!meet.meet_date) return true;
        const meetDate = new Date(meet.meet_date + "T00:00:00");
        return meetDate >= today;
      });
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((meet) =>
        meet.name?.toLowerCase().includes(query)
      );
    }

    result.sort((a, b) => {
      let aVal: string | number | null | undefined;
      let bVal: string | number | null | undefined;

      switch (sortField) {
        case "name":
          aVal = a.name || "";
          bVal = b.name || "";
          break;
        case "date":
          aVal = a.meet_date || "";
          bVal = b.meet_date || "";
          break;
        case "federation":
          aVal = a.federation || "";
          bVal = b.federation || "";
          break;
        case "athlete_count":
          aVal = a.athlete_count || 0;
          bVal = b.athlete_count || 0;
          break;
        case "weeks_out":
          aVal = a.weeks_out ?? 9999;
          bVal = b.weeks_out ?? 9999;
          break;
        default:
          aVal = a.meet_date || "";
          bVal = b.meet_date || "";
      }

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return sortDirection === "asc"
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });

    return result;
  }, [meets, searchQuery, sortField, sortDirection, showPast]);

  if (error) {
    return (
      <div
        className="mx-auto"
        style={{ maxWidth: 960, padding: "var(--cloud-s5)" }}
      >
        <p
          className="cloud-eyebrow"
          style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}
        >
          <span>{teamName}</span>
          <span
            aria-hidden
            style={{
              width: 3,
              height: 3,
              borderRadius: "50%",
              background: "var(--cloud-text-dim)",
              display: "inline-block",
            }}
          />
          <span style={{ color: "var(--cloud-text-dim)" }}>Competitions</span>
        </p>
        <h1
          className="cloud-text"
          style={{
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
          }}
        >
          Meets
        </h1>
        <div
          className="flex items-center"
          style={{
            gap: 8,
            marginTop: 20,
            padding: "12px 14px",
            borderRadius: 8,
            backgroundColor: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.28)",
            color: "#fca5a5",
          }}
        >
          <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
          Failed to load meets. Please try again.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div
        className="mx-auto"
        style={{
          maxWidth: 1280,
          padding: "var(--cloud-s5)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--cloud-s4)",
        }}
      >
        {}
        <div
          className="flex flex-col md:flex-row md:items-center md:justify-between"
          style={{ gap: 16 }}
        >
          <div>
            <p
              className="cloud-eyebrow"
              style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}
            >
              <span>{teamName}</span>
              <span
                aria-hidden
                style={{
                  width: 3,
                  height: 3,
                  borderRadius: "50%",
                  background: "var(--cloud-text-dim)",
                  display: "inline-block",
                }}
              />
              <span style={{ color: "var(--cloud-text-dim)" }}>Competitions</span>
            </p>
            <h1
              className="cloud-text"
              style={{
                fontSize: 32,
                fontWeight: 600,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
              }}
            >
              Meets
            </h1>
            <p
              className="cloud-text-muted"
              style={{ fontSize: 13, marginTop: 6 }}
            >
              Manage competitions and athlete assignments
            </p>
          </div>
          <Link href="/meets/new" style={{ textDecoration: "none" }}>
            <button className="cloud-btn cloud-btn-primary">
              <Plus style={{ width: 14, height: 14, marginRight: 6 }} />
              Add meet
            </button>
          </Link>
        </div>

        {}
        <div
          className="cloud-panel"
          style={{ padding: 16 }}
        >
          <div
            className="flex flex-wrap items-center"
            style={{ gap: 12 }}
          >
            {}
            <div style={{ position: "relative", flex: "1 1 200px", minWidth: 200 }}>
              <Search
                className="cloud-text-muted"
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 14,
                  height: 14,
                  pointerEvents: "none",
                }}
              />
              <input
                type="text"
                placeholder="Search by name…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  ...INPUT_STYLE,
                  paddingLeft: 34,
                }}
              />
            </div>

            {}
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              style={INPUT_STYLE}
            >
              <option value="name">Name</option>
              <option value="date">Date</option>
              <option value="federation">Federation</option>
              <option value="weeks_out">Weeks out</option>
              <option value="athlete_count">Athletes</option>
            </select>

            {}
            <button
              onClick={() =>
                setSortDirection(sortDirection === "asc" ? "desc" : "asc")
              }
              className="cloud-btn cloud-btn-ghost cloud-btn-sm"
              title={sortDirection === "asc" ? "Ascending" : "Descending"}
            >
              <ArrowUpDown
                style={{
                  width: 13,
                  height: 13,
                  marginRight: 6,
                  transform:
                    sortDirection === "asc"
                      ? "rotate(0deg)"
                      : "rotate(180deg)",
                }}
              />
              {sortDirection === "asc" ? "Asc" : "Desc"}
            </button>

            {}
            <label
              className="flex items-center cloud-text-muted"
              style={{ gap: 8, fontSize: 13, cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={showPast}
                onChange={(e) => setShowPast(e.target.checked)}
                style={{
                  accentColor: "var(--cloud-primary)",
                  width: 14,
                  height: 14,
                }}
              />
              Past meets
            </label>
          </div>
        </div>

        {}
        {!isLoading && filteredAndSortedMeets.length === 0 && (
          <div
            className="cloud-panel text-center"
            style={{ padding: "48px 24px" }}
          >
            <p
              className="cloud-text-muted"
              style={{ fontSize: 13, marginBottom: 16 }}
            >
              {searchQuery.trim()
                ? "No meets found matching your search."
                : "No upcoming meets. Check \u201CPast meets\u201D or add a new one."}
            </p>
            {!searchQuery.trim() && (
              <Link href="/meets/new" style={{ textDecoration: "none" }}>
                <button className="cloud-btn cloud-btn-primary">
                  <Plus style={{ width: 14, height: 14, marginRight: 6 }} />
                  Add meet
                </button>
              </Link>
            )}
          </div>
        )}

        {}
        {filteredAndSortedMeets.length > 0 && (
          <div
            className="cloud-panel"
            style={{ padding: 0, overflow: "hidden" }}
          >
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "separate",
                  borderSpacing: 0,
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr>
                    {[
                      "Name",
                      "Federation",
                      "Date",
                      "Weeks out",
                      "Days",
                      "Location",
                      "Athletes competing",
                    ].map((h) => (
                      <th
                        key={h}
                        className="cloud-text-muted"
                        style={{
                          ...MICRO_LABEL,
                          textAlign: "left",
                          padding: "12px 16px",
                          borderBottom: "1px solid var(--cloud-border)",
                          backgroundColor: "var(--cloud-surface-raised)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 7 }).map((_, j) => (
                            <td
                              key={j}
                              style={{
                                padding: "14px 16px",
                                borderBottom:
                                  "1px solid var(--cloud-border)",
                              }}
                            >
                              <div
                                style={{
                                  backgroundColor: "var(--cloud-border)",
                                  height: 14,
                                  width: 80,
                                  borderRadius: 4,
                                }}
                                className="animate-pulse"
                              />
                            </td>
                          ))}
                        </tr>
                      ))
                    : filteredAndSortedMeets.map((meet, idx) => {
                        const meetAthletes = athletesByMeet[meet.id] || [];
                        const past = isMeetPast(meet);
                        const isLast = idx === filteredAndSortedMeets.length - 1;

                        return (
                          <tr key={meet.id}>
                            <td
                              style={{
                                padding: "12px 16px",
                                borderBottom: isLast
                                  ? "none"
                                  : "1px solid var(--cloud-border)",
                              }}
                            >
                              <Link
                                href={`/meets/${meet.id}`}
                                style={{
                                  color: "#67e8f9",
                                  fontWeight: 500,
                                  textDecoration: "none",
                                }}
                              >
                                {meet.name}
                              </Link>
                            </td>

                            <td
                              style={{
                                padding: "12px 16px",
                                borderBottom: isLast
                                  ? "none"
                                  : "1px solid var(--cloud-border)",
                              }}
                            >
                              {meet.federation ? (
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "3px 8px",
                                    borderRadius: 999,
                                    fontSize: 11,
                                    fontWeight: 500,
                                    backgroundColor:
                                      meet.federation === "USAPL"
                                        ? "rgba(59, 130, 246, 0.12)"
                                        : "rgba(168, 85, 247, 0.12)",
                                    color:
                                      meet.federation === "USAPL"
                                        ? "#93c5fd"
                                        : "#d8b4fe",
                                    border:
                                      meet.federation === "USAPL"
                                        ? "1px solid rgba(59, 130, 246, 0.3)"
                                        : "1px solid rgba(168, 85, 247, 0.3)",
                                  }}
                                >
                                  {meet.federation}
                                </span>
                              ) : (
                                <span className="cloud-text-muted">—</span>
                              )}
                            </td>

                            <td
                              className="cloud-text"
                              style={{
                                padding: "12px 16px",
                                whiteSpace: "nowrap",
                                borderBottom: isLast
                                  ? "none"
                                  : "1px solid var(--cloud-border)",
                              }}
                            >
                              {formatDateRange(meet)}
                            </td>

                            <td
                              style={{
                                padding: "12px 16px",
                                borderBottom: isLast
                                  ? "none"
                                  : "1px solid var(--cloud-border)",
                                minWidth: 140,
                              }}
                            >
                              <div
                                className="flex items-center"
                                style={{ gap: 10 }}
                              >
                                <span
                                  style={{
                                    fontWeight: 500,
                                    fontVariantNumeric: "tabular-nums",
                                    width: 24,
                                    textAlign: "right",
                                    color: weeksOutColor(meet),
                                  }}
                                >
                                  {past
                                    ? "—"
                                    : meet.weeks_out !== null &&
                                      meet.weeks_out !== undefined
                                    ? meet.weeks_out
                                    : "—"}
                                </span>
                                {!past &&
                                  meet.weeks_out !== null &&
                                  meet.weeks_out !== undefined && (
                                    <div
                                      style={{
                                        flex: 1,
                                        height: 4,
                                        borderRadius: 999,
                                        overflow: "hidden",
                                        backgroundColor:
                                          "var(--cloud-border)",
                                      }}
                                    >
                                      <div
                                        style={{
                                          height: "100%",
                                          borderRadius: 999,
                                          backgroundColor: weeksOutBarColor(
                                            meet
                                          ),
                                          width: `${weeksOutProgress(meet)}%`,
                                        }}
                                      />
                                    </div>
                                  )}
                                {past && (
                                  <span
                                    className="cloud-text-muted"
                                    style={{
                                      fontSize: 11,
                                      fontStyle: "italic",
                                    }}
                                  >
                                    completed
                                  </span>
                                )}
                              </div>
                            </td>

                            <td
                              style={{
                                padding: "12px 16px",
                                fontVariantNumeric: "tabular-nums",
                                borderBottom: isLast
                                  ? "none"
                                  : "1px solid var(--cloud-border)",
                              }}
                            >
                              {past ? (
                                <span className="cloud-text-muted">—</span>
                              ) : meet.days_out !== null &&
                                meet.days_out !== undefined ? (
                                <span style={{ color: weeksOutColor(meet) }}>
                                  {meet.days_out}
                                </span>
                              ) : (
                                <span className="cloud-text-muted">—</span>
                              )}
                            </td>

                            <td
                              className="cloud-text"
                              style={{
                                padding: "12px 16px",
                                maxWidth: 200,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                borderBottom: isLast
                                  ? "none"
                                  : "1px solid var(--cloud-border)",
                              }}
                            >
                              {meet.location || (
                                <span className="cloud-text-muted">—</span>
                              )}
                            </td>

                            <td
                              style={{
                                padding: "12px 16px",
                                borderBottom: isLast
                                  ? "none"
                                  : "1px solid var(--cloud-border)",
                              }}
                            >
                              {meetAthletes.length > 0 ? (
                                <div
                                  className="flex flex-wrap"
                                  style={{ gap: 4 }}
                                >
                                  {meetAthletes.map((a) => (
                                    <Link
                                      key={a.id}
                                      href={`/athletes/${a.id}`}
                                      style={{
                                        display: "inline-block",
                                        padding: "2px 8px",
                                        borderRadius: 999,
                                        fontSize: 11,
                                        fontWeight: 500,
                                        backgroundColor:
                                          "var(--cloud-surface-raised)",
                                        color: "var(--cloud-text)",
                                        border:
                                          "1px solid var(--cloud-border)",
                                        textDecoration: "none",
                                      }}
                                    >
                                      {a.name}
                                    </Link>
                                  ))}
                                </div>
                              ) : (
                                <span
                                  style={{
                                    color: "#fbbf24",
                                    fontSize: 11,
                                    fontStyle: "italic",
                                  }}
                                >
                                  No athletes assigned
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {}
        {!isLoading && filteredAndSortedMeets.length > 0 && (
          <div
            className="cloud-text-muted"
            style={{ fontSize: 12 }}
          >
            Showing {filteredAndSortedMeets.length} of {meets.length} meet
            {meets.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
