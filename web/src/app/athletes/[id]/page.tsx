"use client";

import { Fragment, useEffect, useRef, useState, useMemo, useCallback, useSyncExternalStore } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api";
import { useNow } from "@/lib/use-now";
import * as Types from "@/lib/types";
import {
  convertWeight,
  formatWeight,
  kgToLbs,
  resolveWeightUnit,
  setWeightUnit,
  unitLabel,
  useLocalWeightUnit,
  type WeightUnit,
} from "@/lib/units";
import {
  customWeightClassesKey,
  normalizeDateForInput,
  parseCustomClasses,
  serializeCustomClasses,
  type AthleteSex,
} from "@/lib/weight-classes";
import { useAuth } from "@/lib/auth-provider";
import { Button } from "@/components/ui/button";
import { ProgressionPanel } from "@/components/progression-panel";
import { Input } from "@/components/ui/input";
import BlockReviewSummary from "@/components/BlockReviewSummary";
import { CurrentCycleCard } from "@/components/current-cycle-card";
import { EmptyState } from "@/components/empty-state";
import { MobileAthleteDetail } from "@/components/mobile-athlete-detail";
import { ShareProfileDialog } from "@/components/share-profile-dialog";
import { ShareRecentPRDialog } from "@/components/share-recent-pr-dialog";
import { ShareCompHistoryDialog } from "@/components/share-comp-history-dialog";
import { ShareAchievementsDialog } from "@/components/share-achievements-dialog";
import { AthleteBadges } from "@/components/athlete-badges";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Merge,
  ArrowUpDown,
  Search,
  Info,
  MoreVertical,
  Archive,
  ArchiveRestore,
  ListPlus,
  Trophy,
  FileText,
  CalendarOff,
  Share2,
} from "lucide-react";
import { ProfileStatusPills } from "@/components/athlete-detail/ProfileStatusPills";
import { NeedsReviewPill } from "@/components/athlete-detail/NeedsReviewPill";
import { DetailsModal } from "@/components/athlete-detail/DetailsModal";
import { UpdateMaxesDialog } from "@/components/athlete-detail/UpdateMaxesDialog";
import { WeightClassSelect } from "@/components/athlete-detail/WeightClassSelect";
import { EstimatedMaxBadge } from "@/components/athlete-detail/EstimatedMaxBadge";
import { CompTotalLine } from "@/components/athlete-detail/CompTotalLine";
import { CompMaxLine } from "@/components/athlete-detail/CompMaxLine";
import { NewPRsBanner } from "@/components/athlete-detail/NewPRsBanner";
import { OplLinkDialog } from "@/components/athlete-detail/OplLinkDialog";
import { ProgramSection } from "@/components/athlete-detail/ProgramSection";
import { MeetHistoryCard } from "@/components/athlete-detail/MeetHistoryCard";
import { PRHistoryTimeline } from "@/components/athlete-detail/PRHistoryTimeline";
import { RPEComplianceCard } from "@/components/athlete-detail/RPEComplianceCard";
import { BodyMetricsCard } from "@/components/athlete-detail/BodyMetricsCard";
import {
  subscribeToCompMaxesPref,
  getCompMaxesPref,
  getCompMaxesPrefServer,
  DIVISIONS,
  type HighlightedExercise,
} from "@/components/athlete-detail/utils";


export default function AthleteDetailPage() {
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const { instance, instanceSettings } = useAuth();
  const teamName = instance?.org_name || "BeStrong";
  const athleteId = parseInt(params.id as string, 10);


  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSettingAvailability, setIsSettingAvailability] = useState(false);
  const [availabilityForm, setAvailabilityForm] = useState<{ out_from: string; out_through: string }>({ out_from: "", out_through: "" });
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Types.AthleteUpdate>({});

  
  
  const [localProgramDue, setLocalProgramDue] = useState<string>("");
  const [localReminderDays, setLocalReminderDays] = useState<number>(0);

  
  const [programSearch, setProgramSearch] = useState("");
  const [programSortNewest, setProgramSortNewest] = useState(true);

  
  const { data: settingsData } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiClient.getSettings(),
    staleTime: 60000,
  });
  
  
  
  
  const saveCustomWeightClasses = useMutation({
    mutationFn: (payload: Record<string, string>) => apiClient.updateSettings(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
  const addCustomWeightClass = useCallback(
    (sex: AthleteSex, rawValue: string) => {
      const value = rawValue.trim();
      if (!value) return;
      const key = customWeightClassesKey(sex);
      const existing = parseCustomClasses(settingsData?.[key]);
      if (existing.includes(value)) return;
      const next = serializeCustomClasses([...existing, value]);
      saveCustomWeightClasses.mutate({ [key]: next });
    },
    [settingsData, saveCustomWeightClasses]
  );

  // Weight-unit preference: browser override > global default_unit setting > lbs.
  const localUnit = useLocalWeightUnit();
  const unit: WeightUnit = resolveWeightUnit(localUnit, settingsData?.default_unit);

  
  const [showPrimaryDaysDialog, setShowPrimaryDaysDialog] = useState(false);

  
  
  const [isUpdatingMaxes, setIsUpdatingMaxes] = useState(false);
  const [isShowingDetails, setIsShowingDetails] = useState(false);
  const [isShareProfileOpen, setIsShareProfileOpen] = useState(false);
  const [isShareRecentPROpen, setIsShareRecentPROpen] = useState(false);
  const [isShareCompHistoryOpen, setIsShareCompHistoryOpen] = useState(false);
  const [isShareAchievementsOpen, setIsShareAchievementsOpen] = useState(false);

  
  const [highlightedExercise, setHighlightedExercise] = useState<HighlightedExercise | null>(null);

  // Deep-link target block from a "#block-<programId>" hash (e.g. an inbox
  // "RPE needs review" flag). Read once on mount; the matching ProgramSection
  // opens and scrolls itself into view.
  const [targetBlockId, setTargetBlockId] = useState<number | null>(null);
  useEffect(() => {
    const match = window.location.hash.match(/^#block-(\d+)$/);
    if (match) {
      setTargetBlockId(Number(match[1]));
    }
  }, []);

  
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [selectedMergeTarget, setSelectedMergeTarget] = useState<Types.AthleteListResponse | null>(null);
  const [mergePreview, setMergePreview] = useState<Types.MergePreview | null>(null);
  const [mergeNameChoice, setMergeNameChoice] = useState<string>("");
  const [mergeStep, setMergeStep] = useState<"search" | "preview">("search");

  
  const {
    data: athlete,
    isLoading: athleteLoading,
    error: athleteError,
  } = useQuery({
    queryKey: ["athlete", athleteId],
    queryFn: () => apiClient.getAthlete(athleteId),
  });

  
  const {
    data: programs = [],
    isLoading: programsLoading,
  } = useQuery({
    queryKey: ["athlete-programs", athleteId],
    queryFn: () => apiClient.listPrograms(athleteId),
    enabled: !!athlete,
  });

  
  
  
  
  
  const { data: wellnessForMenu } = useQuery({
    queryKey: ["wellness", athleteId],
    queryFn: () => apiClient.getAthleteWellness(athleteId),
    enabled: !!athlete && !athlete.body_metrics_hidden,
  });
  const recentWellnessEntryCount = (() => {
    if (!wellnessForMenu) return 0;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    return wellnessForMenu.data.filter(
      (d) =>
        (d.date || "") >= cutoffStr &&
        (d.bodyweight_lbs !== null || d.actual_calories !== null)
    ).length;
  })();

  // Single OPL link/manage dialog. The legacy "Log Meet Results" modal
  // (LogMeetResultsDialog further up in the file) is no longer rendered;
  // OpenPowerlifting is now the canonical source for meet history.
  const [isOplDialogOpen, setIsOplDialogOpen] = useState(false);
  const hasAutoOpenedOplRef = useRef(false);
  const oplStatusQuery = useQuery({
    queryKey: ["opl", "status", athleteId],
    queryFn: () => apiClient.getOpenPowerliftingStatus(athleteId),
    enabled: !!athlete,
  });
  useEffect(() => {
    const status = oplStatusQuery.data;
    if (hasAutoOpenedOplRef.current || !status) return;
    if (status.linked === false && status.not_applicable === false) {
      hasAutoOpenedOplRef.current = true;
      setIsOplDialogOpen(true);
    }
  }, [oplStatusQuery.data]);

  const handleOplDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      hasAutoOpenedOplRef.current = true;
    }
    setIsOplDialogOpen(nextOpen);
  }, []);
  
  
  
  const showCompMaxes = useSyncExternalStore(
    subscribeToCompMaxesPref,
    getCompMaxesPref,
    getCompMaxesPrefServer
  );
  const toggleCompMaxes = useCallback(() => {
    if (typeof window === "undefined") return;
    const next = !showCompMaxes;
    window.localStorage.setItem("bestrong.showCompMaxes", String(next));
    window.dispatchEvent(new Event("bestrong:compMaxesPrefChanged"));
  }, [showCompMaxes]);

  const { data: compMaxes = [] } = useQuery({
    queryKey: ["competition-maxes", athleteId],
    queryFn: () => apiClient.getCompetitionMaxes(athleteId),
    enabled: !!athlete,
  });
  const compMaxByLift = useMemo(() => {
    const m: Record<string, Types.CompetitionMaxForLift> = {};
    for (const c of compMaxes) m[c.lift.toLowerCase()] = c;
    return m;
  }, [compMaxes]);
  const competitionMaxesForProgression = useMemo(
    () => ({
      squat: compMaxByLift.squat?.weight_lbs ?? null,
      bench: compMaxByLift.bench?.weight_lbs ?? null,
      deadlift: compMaxByLift.deadlift?.weight_lbs ?? null,
    }),
    [compMaxByLift],
  );

  
  
  
  
  const { data: estimatedMaxes = [] } = useQuery({
    queryKey: ["estimated-max", athleteId],
    queryFn: () => apiClient.getEstimatedMax(athleteId),
    enabled: !!athlete,
  });
  const estMaxByLift = useMemo(() => {
    const m: Record<string, Types.EstimatedMaxForLift> = {};
    for (const e of estimatedMaxes) m[e.lift] = e;
    return m;
  }, [estimatedMaxes]);

  
  const filteredPrograms = useMemo(() => {
    let filtered = programs;
    if (programSearch.trim()) {
      const q = programSearch.toLowerCase();
      filtered = filtered.filter(p =>
        (p.program_name || '').toLowerCase().includes(q) ||
        (p.block_type || '').toLowerCase().includes(q)
      );
    }
    
    
    
    const toTime = (p: typeof filtered[number]) => {
      const raw = p.date_start || p.imported_at || '';
      if (!raw) return 0;
      const t = new Date(raw).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    return [...filtered].sort((a, b) => {
      const timeA = toTime(a);
      const timeB = toTime(b);
      return programSortNewest ? timeB - timeA : timeA - timeB;
    });
  }, [programs, programSearch, programSortNewest]);

  const now = useNow();
  const lastSyncedAt = (() => {
    if (!athlete?.last_synced_at) return null;
    const t = new Date(athlete.last_synced_at).getTime();
    return Number.isNaN(t) ? null : t;
  })();

  const lastSyncedRelative = useMemo(() => {
    if (!lastSyncedAt) return null;
    const diffSec = (now - lastSyncedAt) / 1000;
    if (diffSec < 60) return "just now";
    if (diffSec < 3600) {
      const m = Math.floor(diffSec / 60);
      return `${m} minute${m === 1 ? "" : "s"} ago`;
    }
    if (diffSec < 86400) {
      const h = Math.floor(diffSec / 3600);
      return `${h} hour${h === 1 ? "" : "s"} ago`;
    }
    const d = Math.floor(diffSec / 86400);
    return `${d} day${d === 1 ? "" : "s"} ago`;
  }, [lastSyncedAt, now]);

  
  const { data: allAthletes = [] } = useQuery({
    queryKey: ["athletes-for-merge"],
    queryFn: () => apiClient.listAthletes(true),
    enabled: showMergeDialog,
  });

  
  const mergeMutation = useMutation({
    mutationFn: () =>
      apiClient.mergeAthletes(athleteId, selectedMergeTarget!.id, mergeNameChoice || undefined),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["athlete", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["athlete-programs", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["athlete-prs", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["athletes"] });
      setShowMergeDialog(false);
      setMergeStep("search");
      setSelectedMergeTarget(null);
      setMergePreview(null);
      setMergeSearch("");
      setSuccessMessage(
        `Merged successfully. ${result.programs_transferred} programs transferred. Total: ${result.total_programs} programs.`
      );
      setTimeout(() => setSuccessMessage(null), 5000);
    },
  });

  
  const updateMutation = useMutation({
    mutationFn: (data: Types.AthleteUpdate) =>
      apiClient.updateAthlete(athleteId, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["athlete", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["athletes"] });
      
      if (variables.program_due !== undefined) {
        queryClient.invalidateQueries({ queryKey: ["notification-count"] });
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }
      setSuccessMessage("Athlete updated successfully");
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  
  const archiveMutation = useMutation({
    mutationFn: () => apiClient.archiveAthlete(athleteId),
    onSuccess: () => {
      router.push("/athletes");
    },
  });

  
  const unarchiveMutation = useMutation({
    mutationFn: () => apiClient.unarchiveAthlete(athleteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["athlete", athleteId] });
      setSuccessMessage("Athlete unarchived");
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const addToQueueMutation = useMutation({
    mutationFn: () => apiClient.addManualQueueEntry(athleteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notification-count"] });
      setSuccessMessage("Added to work queue");
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  
  
  
  const [prevAthleteForEdit, setPrevAthleteForEdit] = useState<
    Types.AthleteResponse | undefined
  >(athlete);
  if (athlete !== prevAthleteForEdit) {
    setPrevAthleteForEdit(athlete);
    if (athlete) {
      
      
      
      
      
      
      
      setEditFormData({
        name: athlete.name,
        email: athlete.email ?? undefined,
        phone: athlete.phone ?? undefined,
        dob: normalizeDateForInput(athlete.dob) || undefined,
        weight_class: athlete.weight_class ?? undefined,
        division: athlete.division ?? undefined,
        sex: athlete.sex ?? undefined,
      });
      setAvailabilityForm({
        out_from: normalizeDateForInput(athlete.out_from) || "",
        out_through: normalizeDateForInput(athlete.out_through) || "",
      });
      setLocalProgramDue(athlete.program_due ? athlete.program_due.split("T")[0] : "");
      setLocalReminderDays(athlete.reminder_days_before ?? 0);
    }
  }

  
  const handleInlineUpdate = (
    field: keyof Types.AthleteUpdate,
    value: Types.AthleteUpdate[keyof Types.AthleteUpdate],
  ) => {
    updateMutation.mutate({ [field]: value } as Types.AthleteUpdate);
  };

  
  const bumpDate = (unit: 'week' | 'month') => {
    const base = localProgramDue ? new Date(localProgramDue + 'T00:00:00') : new Date();
    if (unit === 'week') {
      base.setDate(base.getDate() + 7);
    } else {
      base.setMonth(base.getMonth() + 1);
    }
    const newDate = base.toISOString().split('T')[0];
    setLocalProgramDue(newDate);
    updateMutation.mutate({ program_due: newDate });
  };

  
  const handleProfileSave = () => {
    updateMutation.mutate(editFormData, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["athlete", athleteId] });
        queryClient.invalidateQueries({ queryKey: ["max-history", athleteId] });
        setIsEditingProfile(false);
        setSuccessMessage("Profile updated successfully");
        setTimeout(() => setSuccessMessage(null), 3000);
      },
    });
  };

  
  
  
  const handleAvailabilitySave = () => {
    updateMutation.mutate(
      {
        out_from: availabilityForm.out_from || null,
        out_through: availabilityForm.out_through || null,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["athlete", athleteId] });
          setIsSettingAvailability(false);
          setSuccessMessage("Availability updated");
          setTimeout(() => setSuccessMessage(null), 3000);
        },
      },
    );
  };

  const handleAvailabilityClear = () => {
    updateMutation.mutate(
      { out_from: null, out_through: null },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["athlete", athleteId] });
          setAvailabilityForm({ out_from: "", out_through: "" });
          setIsSettingAvailability(false);
          setSuccessMessage("Availability cleared");
          setTimeout(() => setSuccessMessage(null), 3000);
        },
      },
    );
  };

  if (athleteLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="cloud-text-muted">Loading athlete...</div>
      </div>
    );
  }

  if (athleteError || !athlete) {
    return (
      <div style={{ padding: "var(--cloud-s5)" }}>
        <div className="max-w-2xl mx-auto">
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
            <span style={{ color: "var(--cloud-text-dim)" }}>Athlete</span>
          </p>
          <h1
            className="font-semibold cloud-text"
            style={{ fontSize: 32, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 24 }}
          >
            Not found
          </h1>
          <div
            className="cloud-panel"
            style={{
              padding: 24,
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                color: "var(--cloud-danger-text)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <AlertCircle style={{ width: 20, height: 20, strokeWidth: 1.8 }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="cloud-text" style={{ fontWeight: 600, margin: 0 }}>
                Athlete not found
              </p>
              <p className="cloud-text-muted" style={{ fontSize: 13, marginTop: 2 }}>
                This athlete may have been archived or deleted. Try the roster.
              </p>
            </div>
            <Button onClick={() => router.push("/athletes")} variant="outline">
              Back to roster
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="md:hidden">
        <MobileAthleteDetail athlete={athlete} programs={programs} />
      </div>
      <div className="hidden md:block" style={{ padding: "var(--cloud-s5)" }}>
      {}
      {successMessage && (
        <div
          className="fixed top-20 right-4 cloud-panel-raised cloud-text flex items-center gap-2 z-40 animate-fade-out"
          style={{
            padding: "10px var(--cloud-s4)",
            fontSize: 13,
            borderColor: "rgba(16, 185, 129, 0.35)",
            background: "rgba(16, 185, 129, 0.1)",
            color: "var(--cloud-success-text)",
          }}
        >
          <Check className="w-4 h-4" />
          {successMessage}
        </div>
      )}

      <div className="flex flex-col" style={{ gap: "var(--cloud-s4)" }}>
        {}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between" style={{ gap: "var(--cloud-s3)" }}>
          <div className="flex items-start min-w-0" style={{ gap: "var(--cloud-s3)" }}>
            <button
              type="button"
              onClick={() => router.push("/athletes")}
              className="cloud-icon-btn"
              title="Back to athletes"
              aria-label="Back to athletes"
              style={{ marginTop: 2 }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
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
                <span style={{ color: "var(--cloud-text-dim)" }}>Athlete</span>
              </p>
              <div className="flex items-center" style={{ gap: "var(--cloud-s2)" }}>
                <h1
                  className="font-semibold truncate"
                  style={{ fontSize: 32, letterSpacing: "-0.03em", lineHeight: 1.1 }}
                >
                  <span className="cloud-text-grad-blue">{athlete.name}</span>
                </h1>
                {athlete.archived && (
                  <span className="cloud-badge">Archived</span>
                )}
                <NeedsReviewPill athleteId={athleteId} />
              </div>
              {athlete.next_meet_name &&
                (!athlete.meet_date ||
                  athlete.meet_date >= new Date().toISOString().slice(0, 10)) && (
                  <p className="cloud-text-muted" style={{ fontSize: 13, marginTop: 4 }}>
                    Next Meet: {athlete.next_meet_name}
                  </p>
                )}
              {lastSyncedRelative && (
                <p className="cloud-text-muted" style={{ fontSize: 13, marginTop: 2 }}>
                  Last Synced: {lastSyncedRelative}
                </p>
              )}
              <div style={{ marginTop: 12 }}>
                <AthleteBadges athleteId={athleteId} />
              </div>
            </div>
          </div>

          <div className="flex items-center flex-shrink-0" style={{ gap: "var(--cloud-s2)" }}>
            <div id="coach-athlete-toolbar-slot" />
            <DropdownMenu>
              <DropdownMenuTrigger
                className="cloud-btn cloud-btn-ghost"
                style={{ padding: "7px var(--cloud-s2)" }}
                aria-label="Share"
                title="Share"
              >
                <Share2 className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={6}
                className="cloud-panel-raised min-w-[200px]"
              >
                <DropdownMenuItem onClick={() => setIsShareProfileOpen(true)}>
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsShareRecentPROpen(true)}>
                  Recent PR
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsShareCompHistoryOpen(true)}>
                  Competition History
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsShareAchievementsOpen(true)}>
                  Achievements
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="cloud-btn cloud-btn-ghost"
                style={{ padding: "7px var(--cloud-s2)" }}
                aria-label="More actions"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={6}
                className="cloud-panel-raised min-w-[200px]"
              >
                <DropdownMenuItem onClick={() => setIsShowingDetails(true)}>
                  <Info className="w-3.5 h-3.5" />
                  Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsUpdatingMaxes(true)}>
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  Update Maxes
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsOplDialogOpen(true)}>
                  <Trophy className="w-3.5 h-3.5" />
                  OpenPowerlifting profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => addToQueueMutation.mutate()}
                  disabled={addToQueueMutation.isPending}
                >
                  <ListPlus className="w-3.5 h-3.5" />
                  {addToQueueMutation.isPending ? "Adding..." : "Add to Queue"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowPrimaryDaysDialog(true)}>
                  <Info className="w-3.5 h-3.5" />
                  Primary Days
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsSettingAvailability(true)}>
                  <CalendarOff className="w-3.5 h-3.5" />
                  Set availability
                </DropdownMenuItem>
                {athlete.body_metrics_hidden ? (
                  <DropdownMenuItem
                    onClick={() => handleInlineUpdate("body_metrics_hidden", false)}
                  >
                    <Info className="w-3.5 h-3.5" />
                    Show Body Metrics
                  </DropdownMenuItem>
                ) : recentWellnessEntryCount <= 3 ? (
                  <DropdownMenuItem
                    onClick={() => handleInlineUpdate("body_metrics_hidden", true)}
                  >
                    <Info className="w-3.5 h-3.5" />
                    Hide Body Metrics
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  onClick={() => {
                    setShowMergeDialog(true);
                    setMergeStep("search");
                    setSelectedMergeTarget(null);
                    setMergePreview(null);
                    setMergeSearch("");
                  }}
                >
                  <Merge className="w-3.5 h-3.5" />
                  Merge Athlete
                </DropdownMenuItem>
                {!athlete.archived ? (
                  <DropdownMenuItem
                    onClick={() => setShowArchiveConfirm(true)}
                    style={{ color: "var(--cloud-danger-text)" }}
                  >
                    <Archive className="w-3.5 h-3.5" />
                    Archive Athlete
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => unarchiveMutation.mutate()}
                    style={{ color: "var(--cloud-success-text)" }}
                  >
                    <ArchiveRestore className="w-3.5 h-3.5" />
                    Unarchive Athlete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div>
        {}
        <UpdateMaxesDialog
          open={isUpdatingMaxes}
          onOpenChange={setIsUpdatingMaxes}
          athlete={athlete}
          unit={unit}
          onSaved={() => {
            setSuccessMessage("Maxes updated");
            setTimeout(() => setSuccessMessage(null), 3000);
          }}
        />

        {}
        <DetailsModal
          open={isShowingDetails}
          onOpenChange={setIsShowingDetails}
          athlete={athlete}
          onEditProfile={() => setIsEditingProfile(true)}
          onOpenMeet={(mid) => router.push(`/meets/${mid}`)}
        />

        {/* OpenPowerlifting link/manage dialog. Replaces the old
            LogMeetResultsDialog; OPL is the source of truth for meet
            history now. */}
        <OplLinkDialog
          open={isOplDialogOpen}
          onOpenChange={handleOplDialogOpenChange}
          athleteId={athleteId}
          athleteName={athlete.name}
        />

        <ShareProfileDialog
          athlete={athlete}
          open={isShareProfileOpen}
          onOpenChange={setIsShareProfileOpen}
        />

        <ShareRecentPRDialog
          athlete={athlete}
          open={isShareRecentPROpen}
          onOpenChange={setIsShareRecentPROpen}
        />

        <ShareCompHistoryDialog
          athlete={athlete}
          open={isShareCompHistoryOpen}
          onOpenChange={setIsShareCompHistoryOpen}
        />

        <ShareAchievementsDialog
          athlete={athlete}
          open={isShareAchievementsOpen}
          onOpenChange={setIsShareAchievementsOpen}
        />

        {}
        <Dialog open={isEditingProfile} onOpenChange={setIsEditingProfile}>
          <DialogContent className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] max-w-md max-h-[85vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
                Edit profile
              </DialogTitle>
              <DialogDescription className="cloud-text-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
                Update {athlete.name}&rsquo;s contact info, meet eligibility, and identity. Time-off windows live under the three-dot menu &rarr; Set availability.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 overflow-y-auto cloud-thin-scroll flex-1 pr-1">
              <div>
                <label
                  className="cloud-text-dim block"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  Name
                </label>
                <input
                  value={editFormData.name || ""}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, name: e.target.value })
                  }
                  className="cloud-input w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="cloud-text-dim block"
                    style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontWeight: 500,
                      marginBottom: 6,
                    }}
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    value={editFormData.email || ""}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, email: e.target.value })
                    }
                    className="cloud-input w-full"
                    placeholder="athlete@example.com"
                  />
                </div>

                <div>
                  <label
                    className="cloud-text-dim block"
                    style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontWeight: 500,
                      marginBottom: 6,
                    }}
                  >
                    Phone
                  </label>
                  <input
                    value={editFormData.phone || ""}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, phone: e.target.value })
                    }
                    className="cloud-input w-full"
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div>
                <label
                  className="cloud-text-dim block"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  Date of birth
                </label>
                <input
                  type="date"
                  value={editFormData.dob || ""}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      dob: e.target.value || undefined,
                    })
                  }
                  className="cloud-input w-full"
                />
              </div>

              <div>
                <label
                  className="cloud-text-dim block"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  Sex
                </label>
                <div
                  className="inline-flex rounded-md overflow-hidden w-full"
                  style={{ border: "1px solid var(--cloud-border)" }}
                >
                  {(["M", "F"] as const).map((opt, i) => {
                    const active = editFormData.sex === opt;
                    return (
                      <Fragment key={opt}>
                        {i > 0 && (
                          <div style={{ width: 1, background: "var(--cloud-border)" }} />
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setEditFormData({
                              ...editFormData,
                              sex: active ? undefined : opt,
                              
                              
                              weight_class: active
                                ? editFormData.weight_class
                                : undefined,
                            })
                          }
                          className="flex-1 transition-colors"
                          style={{
                            padding: "7px 0",
                            fontSize: 13,
                            fontWeight: active ? 500 : 400,
                            background: active ? "rgba(12, 92, 171, 0.18)" : "transparent",
                            color: active ? "#93c5fd" : "var(--cloud-text-muted)",
                          }}
                        >
                          {opt === "M" ? "Men's" : "Women's"}
                        </button>
                      </Fragment>
                    );
                  })}
                </div>
                <p className="cloud-text-dim mt-1.5" style={{ fontSize: 11 }}>
                  Drives which weight-class list appears below.
                </p>
              </div>

              <div>
                <label
                  className="cloud-text-dim block"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  Weight class
                </label>
                {editFormData.sex === "M" || editFormData.sex === "F" ? (
                  <WeightClassSelect
                    sex={editFormData.sex}
                    customRaw={
                      settingsData?.[customWeightClassesKey(editFormData.sex)]
                    }
                    value={editFormData.weight_class}
                    onChange={(next) =>
                      setEditFormData({
                        ...editFormData,
                        weight_class: next || undefined,
                      })
                    }
                    onAddCustom={(value) => {
                      addCustomWeightClass(editFormData.sex as AthleteSex, value);
                      setEditFormData({
                        ...editFormData,
                        weight_class: value,
                      });
                    }}
                  />
                ) : (
                  <p className="cloud-text-dim" style={{ fontSize: 12 }}>
                    Select Men&rsquo;s or Women&rsquo;s above to see weight classes.
                  </p>
                )}
              </div>

              <div>
                <label
                  className="cloud-text-dim block"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  Goal bodyweight <span style={{ opacity: 0.6 }}>({unit})</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  placeholder={`e.g. ${unit === "kg" ? "84" : "185"}`}
                  value={
                    editFormData.goal_bodyweight_lbs != null
                      ? Number(
                          convertWeight(editFormData.goal_bodyweight_lbs, unit).toFixed(1)
                        )
                      : ""
                  }
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      setEditFormData({
                        ...editFormData,
                        goal_bodyweight_lbs: null,
                      });
                      return;
                    }
                    const parsed = parseFloat(raw);
                    if (!Number.isFinite(parsed)) return;
                    const lbs = unit === "kg" ? kgToLbs(parsed) : parsed;
                    setEditFormData({
                      ...editFormData,
                      goal_bodyweight_lbs: Math.round(lbs * 10) / 10,
                    });
                  }}
                  className="cloud-input w-full"
                />
                <p className="cloud-text-dim mt-1.5" style={{ fontSize: 11 }}>
                  Draws a reference line on the bodyweight chart.
                </p>
              </div>

              <div>
                <label
                  className="cloud-text-dim block"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  Division
                </label>
                <select
                  value={editFormData.division || ""}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      division: e.target.value || undefined,
                    })
                  }
                  className="cloud-input w-full cursor-pointer"
                >
                  <option value="">Select division…</option>
                  {DIVISIONS.map((div) => (
                    <option key={div} value={div}>
                      {div}
                    </option>
                  ))}
                </select>
              </div>

            </div>

            <DialogFooter
              className="flex-shrink-0 !mt-2 !-mx-4 !-mb-4 !p-4 !border-t !bg-transparent"
              style={{ borderColor: "var(--cloud-border)" }}
            >
              <button
                type="button"
                className="cloud-btn cloud-btn-ghost"
                onClick={() => setIsEditingProfile(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="cloud-btn cloud-btn-primary"
                onClick={handleProfileSave}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving…" : "Save changes"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {}
        <Dialog open={isSettingAvailability} onOpenChange={setIsSettingAvailability}>
          <DialogContent className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] max-w-sm">
            <DialogHeader>
              <DialogTitle style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
                Set availability
              </DialogTitle>
              <DialogDescription className="cloud-text-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
                Mark {athlete.name} as out for a date range. Once the window passes, calendar sync will skip it automatically.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label
                  className="cloud-text-dim block"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  Out from
                </label>
                <input
                  type="date"
                  value={availabilityForm.out_from}
                  onChange={(e) =>
                    setAvailabilityForm((prev) => ({ ...prev, out_from: e.target.value }))
                  }
                  className="cloud-input w-full"
                />
              </div>

              <div>
                <label
                  className="cloud-text-dim block"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  Out through
                </label>
                <input
                  type="date"
                  value={availabilityForm.out_through}
                  onChange={(e) =>
                    setAvailabilityForm((prev) => ({ ...prev, out_through: e.target.value }))
                  }
                  className="cloud-input w-full"
                />
              </div>
            </div>

            <DialogFooter
              className="!mt-2 !-mx-4 !-mb-4 !p-4 !border-t !bg-transparent flex justify-between"
              style={{ borderColor: "var(--cloud-border)" }}
            >
              <button
                type="button"
                className="cloud-btn cloud-btn-ghost"
                onClick={handleAvailabilityClear}
                disabled={
                  updateMutation.isPending ||
                  (!athlete.out_from && !athlete.out_through)
                }
              >
                Clear
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="cloud-btn cloud-btn-ghost"
                  onClick={() => setIsSettingAvailability(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="cloud-btn cloud-btn-primary"
                  onClick={handleAvailabilitySave}
                  disabled={
                    updateMutation.isPending ||
                    !availabilityForm.out_from ||
                    !availabilityForm.out_through
                  }
                >
                  {updateMutation.isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {}
        <Dialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
          <DialogContent className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)]">
            <DialogHeader>
              <DialogTitle style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
                Archive {athlete.name}?
              </DialogTitle>
              <DialogDescription className="cloud-text-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
                They&rsquo;ll disappear from the active roster and stop counting
                toward workload caps. You can bring them back any time from the
                archived list.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter
              className="!mt-2 !-mx-4 !-mb-4 !p-4 !border-t !bg-transparent"
              style={{ borderColor: "var(--cloud-border)" }}
            >
              <button
                type="button"
                className="cloud-btn cloud-btn-ghost"
                onClick={() => setShowArchiveConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  archiveMutation.mutate();
                  setShowArchiveConfirm(false);
                }}
                disabled={archiveMutation.isPending}
                className="cloud-btn"
                style={{
                  background: "rgba(220, 38, 38, 0.18)",
                  color: "var(--cloud-danger-text)",
                  border: "1px solid rgba(220, 38, 38, 0.4)",
                }}
              >
                {archiveMutation.isPending ? "Archiving…" : "Archive"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {}
        <Dialog open={showMergeDialog} onOpenChange={(open) => {
          setShowMergeDialog(open);
          if (!open) {
            setMergeStep("search");
            setSelectedMergeTarget(null);
            setMergePreview(null);
            setMergeSearch("");
          }
        }}>
          <DialogContent className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] max-w-lg">
            <DialogHeader>
              <DialogTitle style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
                Merge athletes
              </DialogTitle>
              <DialogDescription className="cloud-text-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
                {mergeStep === "search"
                  ? "Pick the duplicate profile to fold into this one. Programs, PRs, and meet history all move over."
                  : "Review the merge summary. This action can\u2019t be undone."}
              </DialogDescription>
            </DialogHeader>

            {mergeStep === "search" && (
              <div className="space-y-3">
                <input
                  placeholder="Search athletes by name…"
                  value={mergeSearch}
                  onChange={(e) => setMergeSearch(e.target.value)}
                  className="cloud-input w-full"
                  autoFocus
                />
                <div
                  className="max-h-64 overflow-y-auto cloud-thin-scroll rounded-md"
                  style={{ border: "1px solid var(--cloud-border)" }}
                >
                  {allAthletes
                    .filter(
                      (a) =>
                        a.id !== athleteId &&
                        a.name.toLowerCase().includes(mergeSearch.toLowerCase())
                    )
                    .map((a, idx) => {
                      const selected = selectedMergeTarget?.id === a.id;
                      return (
                        <button
                          key={a.id}
                          onClick={async () => {
                            setSelectedMergeTarget(a);
                            try {
                              const preview = await apiClient.getMergePreview(athleteId, a.id);
                              setMergePreview(preview);
                              setMergeNameChoice(athlete.name);
                              setMergeStep("preview");
                            } catch (err) {
                              console.error("Failed to load merge preview", err);
                            }
                          }}
                          className="w-full text-left flex items-center justify-between transition-colors"
                          style={{
                            padding: "9px 12px",
                            fontSize: 13,
                            borderTop: idx > 0 ? "1px solid var(--cloud-border)" : "none",
                            background: selected ? "rgba(12, 92, 171, 0.12)" : "transparent",
                            color: selected ? "#93c5fd" : "var(--cloud-text)",
                          }}
                        >
                          <span style={{ fontWeight: selected ? 500 : 400 }}>{a.name}</span>
                          <span className="cloud-text-dim" style={{ fontSize: 11 }}>
                            {a.program_count} program{a.program_count !== 1 ? "s" : ""}
                          </span>
                        </button>
                      );
                    })}
                  {mergeSearch &&
                    allAthletes.filter(
                      (a) =>
                        a.id !== athleteId &&
                        a.name.toLowerCase().includes(mergeSearch.toLowerCase())
                    ).length === 0 && (
                      <div
                        className="cloud-text-dim text-center py-6"
                        style={{ fontSize: 12 }}
                      >
                        No matching athletes found
                      </div>
                    )}
                </div>
              </div>
            )}

            {mergeStep === "preview" && mergePreview && (
              <div className="space-y-4">
                <div
                  className="rounded-md p-4 space-y-2.5"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid var(--cloud-border)",
                  }}
                >
                  <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                    <span className="cloud-text-dim">Primary (this profile)</span>
                    <span className="cloud-text" style={{ fontWeight: 500 }}>
                      {mergePreview.primary_name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                    <span className="cloud-text-dim">Programs</span>
                    <span className="cloud-text">{mergePreview.primary_program_count}</span>
                  </div>
                  <div style={{ height: 1, background: "var(--cloud-border)" }} />
                  <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                    <span className="cloud-text-dim">Merging from</span>
                    <span style={{ color: "#67e8f9", fontWeight: 500 }}>
                      {mergePreview.secondary_name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                    <span className="cloud-text-dim">Programs to transfer</span>
                    <span style={{ color: "#fdba74", fontWeight: 500 }}>
                      {mergePreview.programs_to_transfer}
                    </span>
                  </div>
                </div>

                <div>
                  <div
                    className="cloud-text-dim"
                    style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontWeight: 500,
                      marginBottom: 8,
                    }}
                  >
                    Which name to keep?
                  </div>
                  <div className="space-y-2">
                    {[mergePreview.primary_name, mergePreview.secondary_name].map((name) => {
                      const active = mergeNameChoice === name;
                      return (
                        <label
                          key={name}
                          className="flex items-center gap-2.5 cursor-pointer rounded-md px-3 py-2 transition-colors"
                          style={{
                            fontSize: 13,
                            background: active ? "rgba(12, 92, 171, 0.1)" : "transparent",
                            border: `1px solid ${active ? "rgba(12, 92, 171, 0.4)" : "var(--cloud-border)"}`,
                            color: active ? "var(--cloud-text)" : "var(--cloud-text-muted)",
                          }}
                        >
                          <input
                            type="radio"
                            name="merge-name"
                            checked={active}
                            onChange={() => setMergeNameChoice(name)}
                            style={{ accentColor: "var(--cloud-primary)" }}
                          />
                          {name}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div
                  className="cloud-text-dim"
                  style={{ fontSize: 11, lineHeight: 1.5 }}
                >
                  Empty fields on the primary profile are filled in from the secondary.
                  The secondary profile is deleted after the merge.
                </div>
              </div>
            )}

            <DialogFooter
              className="!mt-2 !-mx-4 !-mb-4 !p-4 !border-t !bg-transparent"
              style={{ borderColor: "var(--cloud-border)" }}
            >
              {mergeStep === "preview" && (
                <button
                  type="button"
                  className="cloud-btn cloud-btn-ghost"
                  onClick={() => {
                    setMergeStep("search");
                    setSelectedMergeTarget(null);
                    setMergePreview(null);
                  }}
                >
                  Back
                </button>
              )}
              <button
                type="button"
                className="cloud-btn cloud-btn-ghost"
                onClick={() => setShowMergeDialog(false)}
              >
                Cancel
              </button>
              {mergeStep === "preview" && (
                <button
                  type="button"
                  className="cloud-btn cloud-btn-primary"
                  onClick={() => mergeMutation.mutate()}
                  disabled={mergeMutation.isPending}
                >
                  {mergeMutation.isPending ? "Merging…" : "Confirm merge"}
                </button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* PostMeetBanner removed: it nudged the coach to log meet
            results manually after a meet date passed. With OPL as the
            canonical source, results land automatically once the
            federation publishes; no nudge needed. */}

        {}
        <NewPRsBanner
          athleteId={athleteId}
          unit={unit}
          currentProgramId={programs[0]?.id ?? null}
          currentProgramStart={programs[0]?.date_start ?? null}
          currentProgramEnd={programs[0]?.date_end ?? null}
          athleteName={athlete?.name ?? null}
        />

        {/* Current cycle hero - meet + block in one tinted-blue panel */}
        <div style={{ marginBottom: 16 }}>
          <p className="cloud-eyebrow" style={{ marginBottom: 8 }}>
            Current cycle
          </p>
          <CurrentCycleCard
            athlete={athlete}
            currentProgram={programs[0] ?? null}
            programSheetUrl={athlete.latest_program_sheet_url ?? null}
            onOpenMeet={(mid) => router.push(`/meets/${mid}`)}
          />
        </div>

        {}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <ProfileStatusPills
            athlete={athlete}
            localProgramDue={localProgramDue}
            setLocalProgramDue={setLocalProgramDue}
            localReminderDays={localReminderDays}
            setLocalReminderDays={setLocalReminderDays}
            onInlineUpdate={handleInlineUpdate}
            onBumpDate={bumpDate}
            onOpenMeet={(mid) => router.push(`/meets/${mid}`)}
          />
          <div className="flex items-center ml-auto" style={{ gap: "var(--cloud-s3)" }}>
            <div className="cloud-tabs" role="tablist" aria-label="Weight unit">
              {(['lbs', 'kg'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  role="tab"
                  aria-selected={unit === u}
                  onClick={() => setWeightUnit(u)}
                  className="cloud-tab"
                  title={
                    u === unit
                      ? `Currently displaying in ${unitLabel(u)}`
                      : `Switch this profile to ${unitLabel(u)}`
                  }
                >
                  {unitLabel(u)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={toggleCompMaxes}
              className="cloud-text-muted hover:cloud-text underline decoration-dotted underline-offset-2"
              style={{ fontSize: 12 }}
              title={
                showCompMaxes
                  ? "Hide the competition max line under each card"
                  : "Show the competition max line under each card"
              }
            >
              {showCompMaxes ? "Hide comp maxes" : "Show comp maxes"}
            </button>
          </div>
        </div>
        <div className="cloud-stats" style={{ marginBottom: "var(--cloud-s5)" }}>
          <div className="cloud-stat">
            <div className="cloud-stat-label">Squat Max</div>
            <div className="cloud-stat-value">
              {formatWeight(athlete.squat_max_lbs, unit, { plate: unit === "kg" })}
            </div>
            {showCompMaxes && <CompMaxLine cm={compMaxByLift.squat} unit={unit} />}
            <EstimatedMaxBadge
              est={estMaxByLift.squat}
              unit={unit}
              onJump={setHighlightedExercise}
            />
          </div>

          <div className="cloud-stat">
            <div className="cloud-stat-label">Bench Max</div>
            <div className="cloud-stat-value">
              {formatWeight(athlete.bench_max_lbs, unit, { plate: unit === "kg" })}
            </div>
            {showCompMaxes && <CompMaxLine cm={compMaxByLift.bench} unit={unit} />}
            <EstimatedMaxBadge
              est={estMaxByLift.bench}
              unit={unit}
              onJump={setHighlightedExercise}
            />
          </div>

          <div className="cloud-stat">
            <div className="cloud-stat-label">Deadlift Max</div>
            <div className="cloud-stat-value">
              {formatWeight(athlete.deadlift_max_lbs, unit, { plate: unit === "kg" })}
            </div>
            {showCompMaxes && <CompMaxLine cm={compMaxByLift.deadlift} unit={unit} />}
            <EstimatedMaxBadge
              est={estMaxByLift.deadlift}
              unit={unit}
              onJump={setHighlightedExercise}
            />
          </div>

          <div className="cloud-stat">
            <div className="cloud-stat-label">Total</div>
            <div className="cloud-stat-value">
              {formatWeight(athlete.total_lbs, unit, { plate: unit === "kg" })}
            </div>
            {showCompMaxes && <CompTotalLine byLift={compMaxByLift} unit={unit} />}
          </div>
        </div>

        {}
        <Dialog open={showPrimaryDaysDialog} onOpenChange={setShowPrimaryDaysDialog}>
          <DialogContent className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] max-w-md">
            <DialogHeader>
              <DialogTitle style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
                Primary days
              </DialogTitle>
              <DialogDescription className="cloud-text-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
                Default training day for each main lift. Charts default to
                these; individual programs can override.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-1">
              {(["squat", "bench", "deadlift"] as const).map((lift) => {
                const fieldKey = `primary_${lift}_day` as keyof Types.AthleteResponse;
                const currentValue = athlete[fieldKey] as number | null | undefined;
                
                const liftColor =
                  lift === "squat" ? "#fb923c" :
                  lift === "bench" ? "#22d3ee" : "#a78bfa";
                return (
                  <div key={lift} className="grid grid-cols-[88px_1fr] items-center gap-3">
                    <label
                      className="capitalize"
                      style={{
                        color: liftColor,
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        fontWeight: 600,
                      }}
                    >
                      {lift}
                    </label>
                    <select
                      value={currentValue ?? ""}
                      onChange={(e) => {
                        const val = e.target.value ? parseInt(e.target.value, 10) : null;
                        handleInlineUpdate(`primary_${lift}_day`, val);
                      }}
                      className="cloud-input w-full cursor-pointer"
                      style={{ colorScheme: "dark" }}
                    >
                      <option value="">Not set</option>
                      {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                        <option key={d} value={d}>Day {d}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            <DialogFooter
              className="!mt-2 !-mx-4 !-mb-4 !p-4 !border-t !bg-transparent"
              style={{ borderColor: "var(--cloud-border)" }}
            >
              <button
                type="button"
                className="cloud-btn cloud-btn-primary"
                onClick={() => setShowPrimaryDaysDialog(false)}
              >
                Done
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {}
        <BodyMetricsCard
          athleteId={athleteId}
          unit={unit}
          weightClass={athlete?.weight_class ?? null}
          goalBodyweightLbs={athlete?.goal_bodyweight_lbs ?? null}
          hasUpcomingMeet={Boolean(athlete?.meet_date || athlete?.next_meet_id)}
          hidden={Boolean(athlete?.body_metrics_hidden)}
        />

        {}
        <ProgressionPanel
          athleteId={athleteId}
          unit={unit}
          competitionMaxes={competitionMaxesForProgression}
          tracksRpe={instanceSettings.tracks_rpe}
          hasPrimaryDays={Boolean(
            athlete?.primary_squat_day ||
              athlete?.primary_bench_day ||
              athlete?.primary_deadlift_day,
          )}
          highlightedExercise={highlightedExercise}
          onClearHighlight={() => setHighlightedExercise(null)}
        />

        {}
        <BlockReviewSummary athleteId={athleteId} context="profile" athleteName={athlete?.name ?? null} unit={unit} />

        {}
        <PRHistoryTimeline athleteId={athleteId} unit={unit} athleteName={athlete?.name ?? null} />

        {}
        <MeetHistoryCard
          athleteId={athleteId}
          athlete={athlete}
          unit={unit}
        />

        {}
        <RPEComplianceCard athleteId={athleteId} />

        {}
        <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
          <div className="cloud-panel-head">
            <h2>Programs</h2>
            {!programsLoading && programs.length > 0 && (
              <span className="cloud-text-muted" style={{ fontSize: 12 }}>
                {filteredPrograms.length} of {programs.length}
              </span>
            )}
          </div>
          {programsLoading ? (
            <div
              className="cloud-text-muted"
              style={{ padding: "var(--cloud-s4)", fontSize: 13 }}
            >
              Loading programs...
            </div>
          ) : programs.length === 0 ? (
            <div style={{ padding: "var(--cloud-s4)" }}>
              <EmptyState
                icon={FileText}
                iconTone="muted"
                body="No programs assigned yet."
                compact
              />
            </div>
          ) : (
            <div className="space-y-3" style={{ padding: "var(--cloud-s4)" }}>
              {}
              <div
                className="flex items-center gap-2"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid var(--cloud-border)",
                  borderRadius: "var(--cloud-r-md)",
                  padding: "var(--cloud-s2) var(--cloud-s3)",
                }}
              >
                <Search className="w-3.5 h-3.5 cloud-text-muted" />
                <Input
                  placeholder="Search programs..."
                  value={programSearch}
                  onChange={(e) => setProgramSearch(e.target.value)}
                  className="bg-transparent border-0 cloud-text focus-visible:ring-0 p-0 flex-1 h-7"
                />
                <button
                  type="button"
                  onClick={() => setProgramSortNewest(!programSortNewest)}
                  className="cloud-btn cloud-btn-ghost"
                  style={{ padding: "4px var(--cloud-s2)", fontSize: 12 }}
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  {programSortNewest ? "Newest" : "Oldest"}
                </button>
              </div>

              {}
              {filteredPrograms.length === 0 ? (
                <div
                  className="cloud-text-muted"
                  style={{
                    padding: "var(--cloud-s5) var(--cloud-s4)",
                    textAlign: "center",
                    fontSize: 13,
                  }}
                >
                  {programSearch.trim() ? "No programs match your search" : "No programs"}
                </div>
              ) : (
                <div
                  className="cloud-thin-scroll space-y-3"
                  style={{ maxHeight: 340, overflowY: "auto", paddingRight: 4 }}
                >
                  {filteredPrograms.map((program) => (
                    <ProgramSection
                      key={program.id}
                      program={program}
                      athleteId={athleteId}
                      unit={unit}
                      onHighlightExercise={setHighlightedExercise}
                      autoOpen={program.id === targetBlockId}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
    </>
  );
}
