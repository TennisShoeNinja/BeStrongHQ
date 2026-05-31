"use client";

import { useState, useEffect, type CSSProperties } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import * as Types from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  AlertCircle,
  Check,
  ExternalLink,
  Pencil,
  Trash2,
  Plus,
  Users,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";

const MICRO_LABEL: CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 500,
};

const FIELD_LABEL: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  marginBottom: 6,
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

function formatDate(dateStr: string | undefined | null) {
  if (!dateStr) return "—";
  try {
    const date = dateStr.includes("T")
      ? new Date(dateStr)
      : new Date(dateStr + "T00:00:00");
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function weeksOutColor(
  weeksOut: number | null | undefined,
  completed: boolean
): string {
  if (completed) return "#4ade80";
  if (weeksOut === null || weeksOut === undefined) return "var(--cloud-text-muted)";
  if (weeksOut < 4) return "#fca5a5";
  if (weeksOut < 8) return "#fb923c";
  return "#4ade80";
}

function weeksOutLabel(
  weeksOut: number | null | undefined,
  meetDate: string | null | undefined
): string {
  if (!meetDate) return "—";
  const meet = new Date(meetDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  meet.setHours(0, 0, 0, 0);

  if (meet < now) return "Completed";
  if (weeksOut === null || weeksOut === undefined) return "—";
  return `${weeksOut} weeks`;
}

function weeksUntilColor(weeksUntil: number | null | undefined): string {
  if (weeksUntil === null || weeksUntil === undefined)
    return "var(--cloud-text-muted)";
  if (weeksUntil > 8) return "#4ade80";
  if (weeksUntil >= 4) return "#fb923c";
  return "#fca5a5";
}

function StatTile({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string | number;
  valueColor?: string;
}) {
  return (
    <div className="cloud-panel" style={{ padding: 16 }}>
      <div className="cloud-text-muted" style={MICRO_LABEL}>
        {label}
      </div>
      <div
        className="cloud-text"
        style={{
          fontSize: 18,
          fontWeight: 600,
          marginTop: 6,
          color: valueColor,
          lineHeight: 1.2,
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function MeetDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { instance } = useAuth();
  const teamName = instance?.org_name || "BeStrong";
  const meetId = parseInt(params.id as string, 10);

  const [isEditingMeet, setIsEditingMeet] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showUnassignConfirm, setShowUnassignConfirm] = useState<number | null>(
    null
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Types.MeetUpdate>({});
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<Set<number>>(
    new Set()
  );

  // The creation form redirects here with ?assign_error=<n> when the meet was
  // created but one or more athlete assignments failed. Surface it explicitly
  // so the coach knows to finish assigning here, then drop the query param.
  useEffect(() => {
    const failed = parseInt(searchParams.get("assign_error") ?? "", 10);
    if (!Number.isNaN(failed) && failed > 0) {
      const noun = searchParams.get("assign_noun") || "athletes";
      setErrorMessage(
        `Meet created, but ${failed} ${noun} couldn't be assigned. Assign them below.`
      );
      router.replace(`/meets/${meetId}`);
      const timer = setTimeout(() => setErrorMessage(null), 8000);
      return () => clearTimeout(timer);
    }
    // meetId is stable for this route; searchParams drives this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const {
    data: meet,
    isLoading: meetLoading,
    error: meetError,
  } = useQuery({
    queryKey: ["meet", meetId],
    queryFn: () => apiClient.getMeet(meetId),
  });

  const { data: meetPrep } = useQuery({
    queryKey: ["meet-prep", meetId],
    queryFn: () => apiClient.getMeetPrep(meetId),
    enabled: !!meet && (meet.athlete_count ?? 0) > 0,
  });

  const { data: allAthletes = [] } = useQuery({
    queryKey: ["athletes-list"],
    queryFn: () => apiClient.listAthletes(false),
  });

  const availableAthletes = allAthletes.filter(
    (athlete) => !meet?.competing_athletes?.some((ca) => ca.id === athlete.id)
  );

  const updateMutation = useMutation({
    mutationFn: (data: Types.MeetUpdate) => apiClient.updateMeet(meetId, data),
    onSuccess: (data) => {
      queryClient.setQueryData(["meet", meetId], data);
      queryClient.invalidateQueries({ queryKey: ["meet", meetId] });
      queryClient.invalidateQueries({ queryKey: ["meets"] });
      queryClient.invalidateQueries({ queryKey: ["athletes"] });
      queryClient.invalidateQueries({ queryKey: ["athlete"] });
      queryClient.invalidateQueries({ queryKey: ["meet-prep", meetId] });
      setSuccessMessage("Meet updated successfully");
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.deleteMeet(meetId),
    onSuccess: () => {
      router.push("/meets");
    },
  });

  const assignMutation = useMutation({
    mutationFn: (athleteIds: number[]) =>
      Promise.all(
        athleteIds.map((id) => apiClient.assignAthleteToMeet(meetId, id))
      ),
    onSuccess: (_data, athleteIds) => {
      queryClient.invalidateQueries({ queryKey: ["meet", meetId] });
      queryClient.invalidateQueries({ queryKey: ["athletes"] });
      queryClient.invalidateQueries({ queryKey: ["athlete"] });
      setShowAssignDialog(false);
      setSelectedAthleteIds(new Set());
      const count = athleteIds.length;
      setSuccessMessage(
        count === 1
          ? "Athlete assigned successfully"
          : `${count} athletes assigned successfully`
      );
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const unassignMutation = useMutation({
    mutationFn: (athleteId: number) =>
      apiClient.unassignAthleteFromMeet(meetId, athleteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meet", meetId] });
      queryClient.invalidateQueries({ queryKey: ["athletes"] });
      queryClient.invalidateQueries({ queryKey: ["athlete"] });
      setShowUnassignConfirm(null);
      setSuccessMessage("Athlete unassigned successfully");
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const handleEditOpen = () => {
    if (meet) {
      setEditFormData({
        name: meet.name,
        federation: meet.federation ?? null,
        meet_date: meet.meet_date ?? null,
        meet_date_end: meet.meet_date_end ?? null,
        location: meet.location ?? null,
        non_team_athletes: meet.non_team_athletes ?? null,
        liftingcast_link: meet.liftingcast_link ?? null,
      });
    }
    setIsEditingMeet(true);
  };

  const handleMeetSave = () => {
    updateMutation.mutate(editFormData, {
      onSuccess: () => {
        setIsEditingMeet(false);
      },
      onError: (err) => {
        console.error("[MeetSave] Error:", err);
        setSuccessMessage("Failed to save meet");
        setTimeout(() => setSuccessMessage(null), 5000);
      },
    });
  };

  if (meetLoading) {
    return (
      <div
        className="flex items-center justify-center min-h-screen cloud-text-muted"
        style={{ fontSize: 13 }}
      >
        Loading meet…
      </div>
    );
  }

  if (meetError || !meet) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center" style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
          <AlertCircle
            style={{ width: 44, height: 44, color: "#fca5a5" }}
          />
          <div
            className="cloud-text"
            style={{ fontSize: 15, fontWeight: 500 }}
          >
            Meet not found
          </div>
          <button
            onClick={() => router.push("/meets")}
            className="cloud-btn cloud-btn-ghost"
          >
            Back to Meets
          </button>
        </div>
      </div>
    );
  }

  const isCompleted = !!(
    meet.meet_date &&
    new Date(meet.meet_date) < new Date(new Date().toISOString().split("T")[0])
  );
  const dateRange =
    meet.meet_date && meet.meet_date_end
      ? `${formatDate(meet.meet_date)} - ${formatDate(meet.meet_date_end)}`
      : formatDate(meet.meet_date);

  return (
    <div className="min-h-screen" style={{ paddingBottom: 48 }}>
      <div
        className="mx-auto"
        style={{
          maxWidth: 1080,
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
          <div
            className="flex items-center"
            style={{ gap: 12, minWidth: 0, flex: 1 }}
          >
            <button
              onClick={() => router.push("/meets")}
              title="Back to Meets"
              style={{
                padding: 6,
                borderRadius: 6,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--cloud-text-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <ChevronLeft style={{ width: 18, height: 18 }} />
            </button>
            <div style={{ minWidth: 0 }}>
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
                <span style={{ color: "var(--cloud-text-dim)" }}>Meet</span>
              </p>
              <h1
                className="font-semibold"
                style={{
                  fontSize: 32,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                <span className="cloud-text-grad-blue">{meet.name}</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center" style={{ gap: 8, flexShrink: 0 }}>
            <button
              onClick={handleEditOpen}
              className="cloud-btn cloud-btn-ghost cloud-btn-sm"
            >
              <Pencil style={{ width: 13, height: 13, marginRight: 6 }} />
              Edit
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="cloud-btn cloud-btn-sm"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.08)",
                color: "#fca5a5",
                border: "1px solid rgba(239, 68, 68, 0.3)",
              }}
            >
              <Trash2 style={{ width: 13, height: 13, marginRight: 6 }} />
              Delete
            </button>
          </div>
        </div>

        {}
        {successMessage && (
          <div
            className="flex items-center"
            style={{
              position: "fixed",
              top: 80,
              right: 16,
              zIndex: 40,
              padding: "10px 14px",
              borderRadius: 8,
              backgroundColor: "rgba(34, 197, 94, 0.16)",
              border: "1px solid rgba(34, 197, 94, 0.4)",
              color: "#86efac",
              fontSize: 13,
              gap: 8,
            }}
          >
            <Check style={{ width: 14, height: 14 }} />
            {successMessage}
          </div>
        )}

        {}
        {errorMessage && (
          <div
            className="flex items-center"
            style={{
              position: "fixed",
              top: 80,
              right: 16,
              zIndex: 40,
              padding: "10px 14px",
              borderRadius: 8,
              backgroundColor: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#fca5a5",
              fontSize: 13,
              gap: 8,
              maxWidth: 360,
            }}
          >
            <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
            {errorMessage}
          </div>
        )}

        {}
        <div
          className="grid grid-cols-2 md:grid-cols-4"
          style={{ gap: 12 }}
        >
          <StatTile
            label="Federation"
            value={meet.federation || "Not set"}
          />
          <StatTile label="Date" value={dateRange} />
          <StatTile
            label="Weeks out"
            value={weeksOutLabel(meet.weeks_out, meet.meet_date)}
            valueColor={weeksOutColor(meet.weeks_out, isCompleted)}
          />
          <StatTile label="Athletes" value={meet.athlete_count ?? 0} />
        </div>

        {}
        <div className="cloud-panel" style={{ padding: 24 }}>
          <h2
            className="cloud-text"
            style={{
              fontSize: 16,
              fontWeight: 600,
              marginBottom: 18,
              letterSpacing: "-0.01em",
            }}
          >
            Details
          </h2>
          <div
            className="grid"
            style={{
              gridTemplateColumns: "repeat(2, 1fr)",
              columnGap: 24,
              rowGap: 18,
            }}
          >
            <div>
              <div
                className="cloud-text-muted"
                style={{ ...MICRO_LABEL, marginBottom: 6 }}
              >
                Location
              </div>
              <div className="cloud-text" style={{ fontSize: 13 }}>
                {meet.location || "—"}
              </div>
            </div>

            <div>
              <div
                className="cloud-text-muted"
                style={{ ...MICRO_LABEL, marginBottom: 6 }}
              >
                LiftingCast link
              </div>
              {meet.liftingcast_link ? (
                <a
                  href={meet.liftingcast_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center"
                  style={{
                    fontSize: 13,
                    color: "#67e8f9",
                    gap: 4,
                    textDecoration: "none",
                  }}
                >
                  View on LiftingCast
                  <ExternalLink style={{ width: 11, height: 11 }} />
                </a>
              ) : (
                <div
                  className="cloud-text-muted"
                  style={{ fontSize: 13 }}
                >
                  Not set
                </div>
              )}
            </div>

            <div>
              <div
                className="cloud-text-muted"
                style={{ ...MICRO_LABEL, marginBottom: 6 }}
              >
                Non-team athletes
              </div>
              <div className="cloud-text" style={{ fontSize: 13 }}>
                {meet.non_team_athletes || "—"}
              </div>
            </div>

            <div>
              <div
                className="cloud-text-muted"
                style={{ ...MICRO_LABEL, marginBottom: 6 }}
              >
                Days out
              </div>
              <div className="cloud-text" style={{ fontSize: 13 }}>
                {meet.days_out !== null && meet.days_out !== undefined
                  ? `${meet.days_out} days`
                  : "—"}
              </div>
            </div>

            <div>
              <div
                className="cloud-text-muted"
                style={{ ...MICRO_LABEL, marginBottom: 6 }}
              >
                Created
              </div>
              <div className="cloud-text" style={{ fontSize: 13 }}>
                {formatDate(meet.created_at)}
              </div>
            </div>

            <div>
              <div
                className="cloud-text-muted"
                style={{ ...MICRO_LABEL, marginBottom: 6 }}
              >
                Last updated
              </div>
              <div className="cloud-text" style={{ fontSize: 13 }}>
                {formatDate(meet.updated_at)}
              </div>
            </div>
          </div>
        </div>

        {}
        {meetPrep && meetPrep.athletes && meetPrep.athletes.length > 0 && (
          <div className="cloud-panel" style={{ padding: 24 }}>
            <h2
              className="cloud-text"
              style={{
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 18,
                letterSpacing: "-0.01em",
              }}
            >
              Meet prep
            </h2>
            <div className="flex flex-col" style={{ gap: 10 }}>
              {meetPrep.athletes.map((athlete) => (
                <div
                  key={athlete.athlete_id}
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    backgroundColor: "var(--cloud-surface-raised)",
                    border: "1px solid var(--cloud-border)",
                  }}
                >
                  <div
                    className="flex items-start justify-between"
                    style={{ marginBottom: 12, gap: 12 }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <button
                        onClick={() =>
                          router.push(`/athletes/${athlete.athlete_id}`)
                        }
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          color: "#67e8f9",
                          fontSize: 15,
                          fontWeight: 600,
                          textDecoration: "none",
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {athlete.athlete_name}
                      </button>
                      <div
                        className="cloud-text-muted"
                        style={{ fontSize: 12, marginTop: 4 }}
                      >
                        {athlete.weight_class && athlete.division ? (
                          <span>
                            {athlete.weight_class} · {athlete.division}
                          </span>
                        ) : athlete.weight_class ? (
                          <span>{athlete.weight_class}</span>
                        ) : athlete.division ? (
                          <span>{athlete.division}</span>
                        ) : (
                          <span>—</span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: weeksUntilColor(athlete.weeks_until_meet),
                        }}
                      >
                        {athlete.weeks_until_meet !== null &&
                        athlete.weeks_until_meet !== undefined
                          ? `${athlete.weeks_until_meet} weeks`
                          : "—"}
                      </div>
                      <div
                        className="cloud-text-muted"
                        style={{ fontSize: 11 }}
                      >
                        {athlete.days_until_meet !== null &&
                        athlete.days_until_meet !== undefined
                          ? `${athlete.days_until_meet} days`
                          : "—"}
                      </div>
                    </div>
                  </div>

                  <div
                    className="grid"
                    style={{
                      gridTemplateColumns: "repeat(2, 1fr)",
                      gap: 16,
                    }}
                  >
                    <div>
                      <div
                        className="cloud-text-muted"
                        style={{ ...MICRO_LABEL, marginBottom: 4 }}
                      >
                        Program
                      </div>
                      <div
                        className="cloud-text"
                        style={{ fontSize: 13, fontWeight: 500 }}
                      >
                        {athlete.current_program_name || "—"}
                      </div>
                      {athlete.current_block_type && (
                        <div
                          className="cloud-text-muted"
                          style={{ fontSize: 11, marginTop: 2 }}
                        >
                          Block: {athlete.current_block_type}
                        </div>
                      )}
                      {athlete.program_week && (
                        <div
                          className="cloud-text-muted"
                          style={{ fontSize: 11 }}
                        >
                          {athlete.program_week}
                        </div>
                      )}
                    </div>
                    <div>
                      <div
                        className="cloud-text-muted"
                        style={{ ...MICRO_LABEL, marginBottom: 4 }}
                      >
                        Current maxes
                      </div>
                      <div
                        className="cloud-text"
                        style={{
                          fontSize: 13,
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, monospace",
                        }}
                      >
                        {athlete.squat_max_lbs !== null &&
                        athlete.squat_max_lbs !== undefined
                          ? Math.round(athlete.squat_max_lbs)
                          : "—"}{" "}
                        /{" "}
                        {athlete.bench_max_lbs !== null &&
                        athlete.bench_max_lbs !== undefined
                          ? Math.round(athlete.bench_max_lbs)
                          : "—"}{" "}
                        /{" "}
                        {athlete.deadlift_max_lbs !== null &&
                        athlete.deadlift_max_lbs !== undefined
                          ? Math.round(athlete.deadlift_max_lbs)
                          : "—"}
                      </div>
                      <div
                        className="cloud-text-muted"
                        style={{ fontSize: 11, marginTop: 2 }}
                      >
                        Total:{" "}
                        <span
                          className="cloud-text"
                          style={{ fontWeight: 600 }}
                        >
                          {athlete.total_lbs !== null &&
                          athlete.total_lbs !== undefined
                            ? Math.round(athlete.total_lbs)
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {}
        <div className="cloud-panel" style={{ padding: 24 }}>
          <div
            className="flex items-center justify-between"
            style={{ marginBottom: 18 }}
          >
            <h2
              className="cloud-text"
              style={{
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "-0.01em",
              }}
            >
              Competing athletes
            </h2>
            <button
              onClick={() => setShowAssignDialog(true)}
              disabled={availableAthletes.length === 0}
              className="cloud-btn cloud-btn-primary cloud-btn-sm"
            >
              <Plus style={{ width: 13, height: 13, marginRight: 6 }} />
              Assign athlete
            </button>
          </div>

          {meet.competing_athletes && meet.competing_athletes.length > 0 ? (
            <div className="flex flex-col" style={{ gap: 6 }}>
              {meet.competing_athletes.map((athlete) => (
                <div
                  key={athlete.id}
                  className="flex items-center justify-between"
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    backgroundColor: "var(--cloud-surface-raised)",
                    border: "1px solid var(--cloud-border)",
                  }}
                >
                  <button
                    onClick={() => router.push(`/athletes/${athlete.id}`)}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      color: "#67e8f9",
                      fontSize: 13,
                      fontWeight: 500,
                      textDecoration: "none",
                    }}
                  >
                    {athlete.name}
                  </button>
                  <button
                    onClick={() => setShowUnassignConfirm(athlete.id)}
                    className="cloud-btn cloud-btn-sm"
                    style={{
                      backgroundColor: "transparent",
                      color: "var(--cloud-danger-text)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                    }}
                  >
                    Unassign
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Users}
              iconTone="muted"
              body="No athletes assigned to this meet yet."
              compact
            />
          )}
        </div>

        <div id="meet-attempt-plans-slot" />
      </div>

      {}
      <Dialog open={isEditingMeet} onOpenChange={setIsEditingMeet}>
        <DialogContent
          className="cloud-panel-raised"
          style={{
            maxWidth: 480,
            backgroundColor: "var(--cloud-surface)",
            border: "1px solid var(--cloud-border)",
            color: "var(--cloud-text)",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: "var(--cloud-text)" }}>
              Edit meet
            </DialogTitle>
            <DialogDescription style={{ color: "var(--cloud-text-muted)" }}>
              Update meet information
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col" style={{ gap: 14, marginTop: 8 }}>
            <div>
              <label className="cloud-text" style={FIELD_LABEL}>
                Name
              </label>
              <input
                type="text"
                value={editFormData.name || ""}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, name: e.target.value })
                }
                style={INPUT_STYLE}
              />
            </div>

            <div>
              <label className="cloud-text" style={FIELD_LABEL}>
                Federation
              </label>
              <select
                value={editFormData.federation || ""}
                onChange={(e) =>
                  setEditFormData({
                    ...editFormData,
                    federation: e.target.value || null,
                  })
                }
                style={INPUT_STYLE}
              >
                <option value="">Not set</option>
                <option value="USAPL">USAPL</option>
                <option value="PA/IPF">PA/IPF</option>
                <option value="USPA">USPA</option>
              </select>
            </div>

            <div
              className="grid"
              style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}
            >
              <div>
                <label className="cloud-text" style={FIELD_LABEL}>
                  Meet date
                </label>
                <input
                  type="date"
                  value={editFormData.meet_date || ""}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      meet_date: e.target.value || null,
                    })
                  }
                  style={INPUT_STYLE}
                />
              </div>
              <div>
                <label className="cloud-text" style={FIELD_LABEL}>
                  End date (optional)
                </label>
                <input
                  type="date"
                  value={editFormData.meet_date_end || ""}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      meet_date_end: e.target.value || null,
                    })
                  }
                  style={INPUT_STYLE}
                />
              </div>
            </div>

            <div>
              <label className="cloud-text" style={FIELD_LABEL}>
                Location
              </label>
              <input
                type="text"
                value={editFormData.location || ""}
                onChange={(e) =>
                  setEditFormData({
                    ...editFormData,
                    location: e.target.value || null,
                  })
                }
                style={INPUT_STYLE}
              />
            </div>

            <div>
              <label className="cloud-text" style={FIELD_LABEL}>
                Non-team athletes
              </label>
              <input
                type="text"
                value={editFormData.non_team_athletes || ""}
                onChange={(e) =>
                  setEditFormData({
                    ...editFormData,
                    non_team_athletes: e.target.value || null,
                  })
                }
                style={INPUT_STYLE}
              />
            </div>

            <div>
              <label className="cloud-text" style={FIELD_LABEL}>
                LiftingCast link
              </label>
              <input
                type="url"
                value={editFormData.liftingcast_link || ""}
                onChange={(e) =>
                  setEditFormData({
                    ...editFormData,
                    liftingcast_link: e.target.value || null,
                  })
                }
                style={INPUT_STYLE}
              />
            </div>
          </div>

          <DialogFooter style={{ marginTop: 16 }}>
            <button
              className="cloud-btn cloud-btn-ghost"
              onClick={() => setIsEditingMeet(false)}
            >
              Cancel
            </button>
            <button
              onClick={handleMeetSave}
              disabled={updateMutation.isPending}
              className="cloud-btn cloud-btn-primary"
            >
              {updateMutation.isPending ? "Saving…" : "Save changes"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent
          style={{
            backgroundColor: "var(--cloud-surface)",
            border: "1px solid var(--cloud-border)",
            color: "var(--cloud-text)",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: "var(--cloud-text)" }}>
              Delete meet
            </DialogTitle>
            <DialogDescription style={{ color: "var(--cloud-text-muted)" }}>
              Deleting this meet will unlink all assigned athletes. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              className="cloud-btn cloud-btn-ghost"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                deleteMutation.mutate();
                setShowDeleteConfirm(false);
              }}
              disabled={deleteMutation.isPending}
              className="cloud-btn"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.2)",
                color: "#fca5a5",
                border: "1px solid rgba(239, 68, 68, 0.4)",
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {}
      <Dialog
        open={showAssignDialog}
        onOpenChange={(open) => {
          setShowAssignDialog(open);
          if (!open) setSelectedAthleteIds(new Set());
        }}
      >
        <DialogContent
          style={{
            maxWidth: 480,
            backgroundColor: "var(--cloud-surface)",
            border: "1px solid var(--cloud-border)",
            color: "var(--cloud-text)",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: "var(--cloud-text)" }}>
              Assign athletes
            </DialogTitle>
            <DialogDescription style={{ color: "var(--cloud-text-muted)" }}>
              {availableAthletes.length === 0
                ? "All athletes are already assigned to this meet."
                : "Select one or more athletes to assign to this meet."}
            </DialogDescription>
          </DialogHeader>

          {availableAthletes.length > 0 && (
            <div
              className="cloud-thin-scroll"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                maxHeight: 288,
                overflowY: "auto",
                marginTop: 8,
              }}
            >
              {availableAthletes.map((athlete) => {
                const checked = selectedAthleteIds.has(athlete.id);
                return (
                  <label
                    key={athlete.id}
                    className="flex items-center"
                    style={{
                      padding: "8px 12px",
                      borderRadius: 6,
                      cursor: "pointer",
                      backgroundColor: checked
                        ? "rgba(12, 92, 171, 0.12)"
                        : "transparent",
                      gap: 12,
                      transition: "background-color 120ms ease",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelectedAthleteIds((prev) => {
                          const next = new Set(prev);
                          if (checked) {
                            next.delete(athlete.id);
                          } else {
                            next.add(athlete.id);
                          }
                          return next;
                        });
                      }}
                      style={{
                        accentColor: "var(--cloud-primary)",
                        width: 14,
                        height: 14,
                      }}
                    />
                    <span
                      className="cloud-text"
                      style={{ fontSize: 13 }}
                    >
                      {athlete.name}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <DialogFooter style={{ marginTop: 16 }}>
            <button
              className="cloud-btn cloud-btn-ghost"
              onClick={() => {
                setShowAssignDialog(false);
                setSelectedAthleteIds(new Set());
              }}
            >
              Cancel
            </button>
            <button
              onClick={() =>
                assignMutation.mutate(Array.from(selectedAthleteIds))
              }
              disabled={
                assignMutation.isPending || selectedAthleteIds.size === 0
              }
              className="cloud-btn cloud-btn-primary"
            >
              {assignMutation.isPending
                ? "Assigning…"
                : selectedAthleteIds.size > 0
                ? `Assign ${selectedAthleteIds.size} athlete${
                    selectedAthleteIds.size > 1 ? "s" : ""
                  }`
                : "Assign"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {}
      <Dialog
        open={showUnassignConfirm !== null}
        onOpenChange={(open) => !open && setShowUnassignConfirm(null)}
      >
        <DialogContent
          style={{
            backgroundColor: "var(--cloud-surface)",
            border: "1px solid var(--cloud-border)",
            color: "var(--cloud-text)",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: "var(--cloud-text)" }}>
              Unassign athlete
            </DialogTitle>
            <DialogDescription style={{ color: "var(--cloud-text-muted)" }}>
              Are you sure you want to unassign this athlete from the meet?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              className="cloud-btn cloud-btn-ghost"
              onClick={() => setShowUnassignConfirm(null)}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (showUnassignConfirm) {
                  unassignMutation.mutate(showUnassignConfirm);
                }
              }}
              disabled={unassignMutation.isPending}
              className="cloud-btn"
              style={{
                backgroundColor: "rgba(251, 146, 60, 0.15)",
                color: "#fb923c",
                border: "1px solid rgba(251, 146, 60, 0.4)",
              }}
            >
              {unassignMutation.isPending ? "Unassigning…" : "Unassign"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
