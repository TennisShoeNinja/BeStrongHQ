

import axios, { AxiosInstance, AxiosError } from "axios";
import * as Types from "./types";
import { APIError } from "./types";


const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL + "/api"
  : "/api";

function verifyInstanceHeader(headerValue: string | undefined | null): void {
  if (typeof window === "undefined") return;
  if (!headerValue) return;

  const expected = window.location.hostname.split(".")[0].toLowerCase();
  const actual = String(headerValue).toLowerCase();
  if (actual === expected) return;

  try {
    window.localStorage.clear();
  } catch {

  }
  try {
    window.sessionStorage.clear();
  } catch {

  }




  window.location.replace("/login?error=instance_mismatch");

  throw new Error(
    `Instance mismatch: expected "${expected}", got "${actual}"`
  );
}

export interface OrganizeApplyResult {
  folders_created: { name: string; id: string }[];
  files_moved: number;
  errors: string[];
  watched_folders_set: number;
}

export type OrganizeProgressEvent =
  | { type: "start"; total_files: number; total_groups: number }
  | { type: "folder_created"; name: string; id: string }
  | { type: "folder_failed"; name: string; error: string }
  | {
      type: "file_moved";
      file_id: string;
      athlete_name: string;
      completed: number;
      total: number;
    }
  | {
      type: "move_failed";
      file_id: string;
      athlete_name: string;
      completed: number;
      total: number;
      error: string;
    }
  | { type: "complete"; result: OrganizeApplyResult }
  | { type: "error"; message: string };


class APIClient {
  private client: AxiosInstance;

  constructor(baseURL: string = API_BASE_URL) {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      withCredentials: true,
      headers: {
        "Content-Type": "application/json",
      },
    });

    
    this.client.interceptors.response.use(
      (response) => {
        verifyInstanceHeader(response.headers?.["x-instance-subdomain"]);
        return response;
      },
      (error: AxiosError) => {
        if (error.response) {


          verifyInstanceHeader(
            (error.response.headers as Record<string, string> | undefined)?.[
              "x-instance-subdomain"
            ]
          );
          
          
          
          
          if (
            error.response.status === 401 &&
            typeof window !== "undefined" &&
            !window.location.pathname.startsWith("/login") &&
            !window.location.pathname.startsWith("/configuration") &&
            !window.location.pathname.startsWith("/athlete")
          ) {
            window.location.href = "/login";
            return new Promise(() => {});
          }
          throw new APIError(
            error.response.status,
            error.response.data,
            error.message
          );
        }
        throw error;
      }
    );
  }

  
  
  

  async health(): Promise<Types.HealthResponse> {
    const response = await this.client.get<Types.HealthResponse>("/health");
    return response.data;
  }

  
  
  

  
  async listAthletes(includeArchived: boolean = false): Promise<Types.AthleteListResponse[]> {
    const response = await this.client.get<Types.AthleteListResponse[]>(
      "/athletes",
      {
        params: { include_archived: includeArchived },
      }
    );
    return response.data;
  }

  async getTodaySessions(): Promise<Types.TodaySessionEntry[]> {
    const response = await this.client.get<Types.TodaySessionEntry[]>(
      "/athletes/today-sessions"
    );
    return response.data;
  }

  async getTodayStatus(): Promise<Types.TodayStatusResponse> {
    const response = await this.client.get<Types.TodayStatusResponse>(
      "/dashboard/today-status"
    );
    return response.data;
  }

  async getWeeklyStats(): Promise<Types.WeeklyStatsResponse> {
    const response = await this.client.get<Types.WeeklyStatsResponse>(
      "/dashboard/weekly-stats"
    );
    return response.data;
  }

  async getNeedsReview(limit: number = 3): Promise<Types.NeedsReviewItem[]> {
    const response = await this.client.get<Types.NeedsReviewItem[]>(
      "/dashboard/needs-review",
      { params: { limit } }
    );
    return response.data;
  }

  async getTodaySchedule(): Promise<Types.TodayScheduleItem[]> {
    const response = await this.client.get<Types.TodayScheduleItem[]>(
      "/dashboard/today-schedule"
    );
    return response.data;
  }

  
  athletesExportCsvUrl(includeArchived: boolean = false): string {
    const suffix = includeArchived ? "?include_archived=true" : "";
    return `${API_BASE_URL}/athletes/export.csv${suffix}`;
  }

  
  async getAthlete(id: number): Promise<Types.AthleteResponse> {
    const response = await this.client.get<Types.AthleteResponse>(
      `/athletes/${id}`
    );
    return response.data;
  }

  async getMyAthlete(): Promise<Types.AthleteResponse> {
    const response = await this.client.get<Types.AthleteResponse>(
      "/athlete/me"
    );
    return response.data;
  }

  
  async createAthlete(data: Types.AthleteCreate): Promise<Types.AthleteResponse> {
    const response = await this.client.post<Types.AthleteResponse>(
      "/athletes",
      data
    );
    return response.data;
  }

  
  async updateAthlete(
    id: number,
    data: Types.AthleteUpdate
  ): Promise<Types.AthleteResponse> {
    const response = await this.client.patch<Types.AthleteResponse>(
      `/athletes/${id}`,
      data
    );
    return response.data;
  }

  
  async archiveAthlete(id: number): Promise<Types.AthleteResponse> {
    const response = await this.client.post<Types.AthleteResponse>(
      `/athletes/${id}/archive`
    );
    return response.data;
  }

  
  async unarchiveAthlete(id: number): Promise<Types.AthleteResponse> {
    const response = await this.client.post<Types.AthleteResponse>(
      `/athletes/${id}/unarchive`
    );
    return response.data;
  }

  
  async deleteAthlete(id: number): Promise<void> {
    await this.client.delete(`/athletes/${id}`);
  }

  
  async getMergePreview(primaryId: number, secondaryId: number): Promise<Types.MergePreview> {
    const response = await this.client.get<Types.MergePreview>(
      `/athletes/${primaryId}/merge-preview/${secondaryId}`
    );
    return response.data;
  }

  
  async mergeAthletes(
    primaryId: number,
    secondaryId: number,
    keepName?: string
  ): Promise<Types.MergeResult> {
    const response = await this.client.post<Types.MergeResult>(
      `/athletes/${primaryId}/merge/${secondaryId}`,
      { keep_name: keepName || null }
    );
    return response.data;
  }

  
  
  

  
  async listMeets(): Promise<Types.MeetListResponse[]> {
    const response = await this.client.get<Types.MeetListResponse[]>("/meets");
    return response.data;
  }

  async getMyMeets(): Promise<Types.MeetListResponse[]> {
    const response = await this.client.get<Types.MeetListResponse[]>(
      "/athlete/me/meets"
    );
    return response.data;
  }

  
  async getMeet(id: number): Promise<Types.MeetResponse> {
    const response = await this.client.get<Types.MeetResponse>(`/meets/${id}`);
    return response.data;
  }

  async getMyMeet(meetId: number): Promise<Types.MeetResponse> {
    const response = await this.client.get<Types.MeetResponse>(
      `/athlete/me/meets/${meetId}`
    );
    return response.data;
  }

  
  async createMeet(data: Types.MeetCreate): Promise<Types.MeetResponse> {
    const response = await this.client.post<Types.MeetResponse>(
      "/meets",
      data
    );
    return response.data;
  }

  
  async updateMeet(
    id: number,
    data: Types.MeetUpdate
  ): Promise<Types.MeetResponse> {
    const response = await this.client.patch<Types.MeetResponse>(
      `/meets/${id}`,
      data
    );
    return response.data;
  }

  
  async deleteMeet(id: number): Promise<void> {
    await this.client.delete(`/meets/${id}`);
  }

  
  async assignAthleteToMeet(meetId: number, athleteId: number): Promise<void> {
    await this.client.post(
      `/meets/${meetId}/assign/${athleteId}`
    );
  }

  
  async unassignAthleteFromMeet(
    meetId: number,
    athleteId: number
  ): Promise<void> {
    await this.client.post(
      `/meets/${meetId}/unassign/${athleteId}`
    );
  }

  
  async getMeetPrep(meetId: number): Promise<Types.MeetPrepResponse> {
    const response = await this.client.get<Types.MeetPrepResponse>(
      `/meets/${meetId}/prep`
    );
    return response.data;
  }

  async getMeetAttemptPlans(meetId: number): Promise<Types.MeetAttemptPlan[]> {
    const response = await this.client.get<Types.MeetAttemptPlan[]>(
      `/meets/${meetId}/attempt-plans`
    );
    return response.data;
  }

  async getAthleteMeetAttemptPlan(
    meetId: number,
    athleteId: number
  ): Promise<Types.AthleteMeetAttemptPlan> {
    const response = await this.client.get<Types.AthleteMeetAttemptPlan>(
      `/meets/${meetId}/attempt-plans/${athleteId}`
    );
    return response.data;
  }

  async saveAthleteMeetAttemptPlan(
    meetId: number,
    athleteId: number,
    body: Types.MeetAttemptPlanUpsertBody
  ): Promise<Types.AthleteMeetAttemptPlan> {
    const response = await this.client.put<Types.AthleteMeetAttemptPlan>(
      `/meets/${meetId}/attempt-plans/${athleteId}`,
      body
    );
    return response.data;
  }

  async clearAthleteMeetAttemptPlan(
    meetId: number,
    athleteId: number
  ): Promise<void> {
    await this.client.delete(`/meets/${meetId}/attempt-plans/${athleteId}`);
  }

  async getMeetsToday(): Promise<Types.MeetTodayItem[]> {
    const response = await this.client.get<Types.MeetTodayItem[]>("/meets/today");
    return response.data;
  }

  async getPickerContext(
    athleteId: number,
    meetId: number,
    lift: Types.MeetAttemptLift,
    weightLbs: number
  ): Promise<Types.PickerContext> {
    const response = await this.client.get<Types.PickerContext>(
      `/athletes/${athleteId}/meets/${meetId}/picker-context`,
      { params: { lift, weight_lbs: weightLbs } }
    );
    return response.data;
  }

  
  
  

  
  async listPrograms(
    athleteId: number,
    skip: number = 0,
    limit: number = 100
  ): Promise<Types.ProgramListResponse[]> {
    const response = await this.client.get<Types.ProgramListResponse[]>(
      `/athletes/${athleteId}/programs`,
      {
        params: { skip, limit },
      }
    );
    return response.data;
  }

  async getMyPrograms(): Promise<Types.ProgramListResponse[]> {
    const response = await this.client.get<Types.ProgramListResponse[]>(
      "/athlete/me/programs"
    );
    return response.data;
  }

  
  async getProgram(
    athleteId: number,
    programId: number
  ): Promise<Types.ProgramResponse> {
    const response = await this.client.get<Types.ProgramResponse>(
      `/programs/${programId}`
    );
    return response.data;
  }

  
  async updateProgramPrimaryDays(
    programId: number,
    data: {
      primary_squat_day: number | null;
      primary_bench_day: number | null;
      primary_deadlift_day: number | null;
    }
  ): Promise<Types.ProgramResponse> {
    const response = await this.client.put<Types.ProgramResponse>(
      `/programs/${programId}/primary-days`,
      data
    );
    return response.data;
  }

  
  async listProgramSessions(
    athleteId: number,
    programId: number
  ): Promise<Types.SessionResponse[]> {
    const response = await this.client.get<Types.SessionResponse[]>(
      `/programs/${programId}/sessions`
    );
    return response.data;
  }

  async getMyProgramSessions(programId: number): Promise<Types.SessionResponse[]> {
    const response = await this.client.get<Types.SessionResponse[]>(
      `/athlete/me/programs/${programId}/sessions`
    );
    return response.data;
  }

  
  async getProgramVolume(
    athleteId: number,
    programId: number
  ): Promise<Types.VolumeDataPoint[]> {
    const response = await this.client.get<Types.VolumeDataPoint[]>(
      `/programs/${programId}/volume`
    );
    return response.data;
  }

  
  
  

  
  async getSessionExercises(
    athleteId: number,
    programId: number,
    sessionId: number
  ): Promise<Types.ExerciseEntryResponse[]> {
    const response = await this.client.get<Types.ExerciseEntryResponse[]>(
      `/sessions/${sessionId}/exercises`
    );
    return response.data;
  }

  async getMySessionExercises(
    sessionId: number
  ): Promise<Types.ExerciseEntryResponse[]> {
    const response = await this.client.get<Types.ExerciseEntryResponse[]>(
      `/athlete/me/sessions/${sessionId}/exercises`
    );
    return response.data;
  }

  
  
  

  
  async getVolumeTrends(
    athleteId: number,
    programId?: number
  ): Promise<Types.VolumeDataPoint[]> {
    const response = await this.client.get<Types.VolumeDataPoint[]>(
      "/analytics/volume",
      {
        params: { athlete_id: athleteId, program_id: programId },
      }
    );
    return response.data;
  }

  
  
  async getRecentPRs(days: number = 7, limit: number = 25): Promise<Types.RecentPR[]> {
    const response = await this.client.get<Types.RecentPR[]>(
      "/analytics/recent-prs",
      { params: { days, limit } }
    );
    return response.data;
  }

  
  async getSessionsStats(window: "week" | "month" = "week"): Promise<Types.SessionsStats> {
    const response = await this.client.get<Types.SessionsStats>(
      "/analytics/sessions",
      { params: { window } }
    );
    return response.data;
  }

  
  async search(q: string, limit: number = 8): Promise<Types.SearchResponse> {
    const response = await this.client.get<Types.SearchResponse>(
      "/search",
      { params: { q, limit } }
    );
    return response.data;
  }

  async getPRs(
    athleteId: number,
    liftCategory?: string
  ): Promise<Types.PRRecord[]> {
    const response = await this.client.get<Types.PRRecord[]>(
      "/analytics/prs",
      {
        params: { athlete_id: athleteId, lift_category: liftCategory },
      }
    );
    return response.data;
  }

  
  async getE1RMTrends(
    athleteId: number,
    options?: {
      liftCategory?: string;
      programId?: number;
      primaryOnly?: boolean;
      minReps?: number;
      maxReps?: number;
    }
  ): Promise<Types.E1RMDataPoint[]> {
    const response = await this.client.get<Types.E1RMDataPoint[]>(
      "/analytics/e1rm",
      {
        params: {
          athlete_id: athleteId,
          lift_category: options?.liftCategory,
          program_id: options?.programId,
          primary_only: options?.primaryOnly,
          min_reps: options?.minReps,
          max_reps: options?.maxReps,
        },
      }
    );
    return response.data;
  }

  async getMyE1RMTrends(
    options?: {
      liftCategory?: string;
      programId?: number;
      primaryOnly?: boolean;
      minReps?: number;
      maxReps?: number;
    }
  ): Promise<Types.E1RMDataPoint[]> {
    const response = await this.client.get<Types.E1RMDataPoint[]>(
      "/athlete/me/e1rm",
      {
        params: {
          lift_category: options?.liftCategory,
          program_id: options?.programId,
          primary_only: options?.primaryOnly,
          min_reps: options?.minReps,
          max_reps: options?.maxReps,
        },
      }
    );
    return response.data;
  }


  async getFeaturedAthlete(): Promise<Types.FeaturedAthleteResponse | null> {
    const response = await this.client.get<Types.FeaturedAthleteResponse | null>(
      "/analytics/featured-athlete",
    );
    return response.data;
  }


  async getDataQuality(athleteId: number): Promise<Types.DataQualityResponse> {
    const response = await this.client.get<Types.DataQualityResponse>(
      `/analytics/athletes/${athleteId}/data-quality`,
    );
    return response.data;
  }

  // Competition-lift top sets flagged with an out-of-range RPE (held back
  // from maxes until corrected). Powers the per-athlete review page + pill.
  async getRpeReview(athleteId: number): Promise<Types.DataQualityIssue[]> {
    const response = await this.client.get<Types.DataQualityIssue[]>(
      `/analytics/athletes/${athleteId}/rpe-review`,
    );
    return response.data;
  }

  
  
  

  
  async listExerciseAliases(
    athleteId?: number,
  ): Promise<Types.ExerciseAliasGroup[]> {
    const response = await this.client.get<Types.ExerciseAliasGroup[]>(
      "/exercise-aliases",
      athleteId != null ? { params: { athlete_id: athleteId } } : undefined,
    );
    return response.data;
  }


  async createExerciseAlias(
    primary_name: string,
    aliases: string[],
    athleteId?: number,
  ): Promise<Types.ExerciseAliasGroup> {
    const response = await this.client.post<Types.ExerciseAliasGroup>(
      "/exercise-aliases",
      { primary_name, aliases, athlete_id: athleteId ?? null },
    );
    return response.data;
  }

  
  async deleteExerciseAlias(aliasId: number): Promise<void> {
    await this.client.delete(`/exercise-aliases/${aliasId}`);
  }

  
  async getEstimatedMax(
    athleteId: number,
    options?: { maxReps?: number }
  ): Promise<Types.EstimatedMaxForLift[]> {
    const response = await this.client.get<Types.EstimatedMaxForLift[]>(
      "/analytics/estimated-max",
      {
        params: {
          athlete_id: athleteId,
          max_reps: options?.maxReps,
        },
      }
    );
    return response.data;
  }

  
  async getVolumeResponse(
    athleteId: number,
    options?: {
      liftCategory?: string;
      topN?: number;
      trailingWeeks?: number;
      maxPeakReps?: number;
    }
  ): Promise<Types.VolumeResponseResponse> {
    const response = await this.client.get<Types.VolumeResponseResponse>(
      "/analytics/volume-response",
      {
        params: {
          athlete_id: athleteId,
          lift_category: options?.liftCategory,
          top_n: options?.topN,
          trailing_weeks: options?.trailingWeeks,
          max_peak_reps: options?.maxPeakReps,
        },
      }
    );
    return response.data;
  }

  
  
  

  /**
   * List all notifications (global inbox)
   */
  async listNotifications(
    includeArchived: boolean = false,
    limit?: number
  ): Promise<Types.NotificationResponse[]> {
    const params: Record<string, unknown> = {
      include_archived: includeArchived,
    };
    if (limit !== undefined) params.limit = limit;
    const response = await this.client.get<Types.NotificationResponse[]>(
      "/notifications",
      { params }
    );
    return response.data;
  }

  
  async getNotificationCount(): Promise<number> {
    const response = await this.client.get<{ count: number }>(
      "/notifications/count"
    );
    return response.data.count;
  }

  
  async markNotificationRead(
    notificationId: number
  ): Promise<Types.NotificationResponse> {
    const response = await this.client.post<Types.NotificationResponse>(
      `/notifications/${notificationId}/read`
    );
    return response.data;
  }

  async markNotificationUnread(
    notificationId: number
  ): Promise<Types.NotificationResponse> {
    const response = await this.client.post<Types.NotificationResponse>(
      `/notifications/${notificationId}/unread`
    );
    return response.data;
  }

  async archiveNotification(
    notificationId: number
  ): Promise<Types.NotificationResponse> {
    const response = await this.client.post<Types.NotificationResponse>(
      `/notifications/${notificationId}/archive`
    );
    return response.data;
  }

  
  async unarchiveNotification(
    notificationId: number
  ): Promise<Types.NotificationResponse> {
    const response = await this.client.post<Types.NotificationResponse>(
      `/notifications/${notificationId}/unarchive`
    );
    return response.data;
  }

  
  async addManualQueueEntry(
    athleteId: number,
    note?: string
  ): Promise<Types.NotificationResponse> {
    const response = await this.client.post<Types.NotificationResponse>(
      "/notifications/manual",
      { athlete_id: athleteId, note }
    );
    return response.data;
  }

  
  async deleteNotification(
    notificationId: number
  ): Promise<Types.NotificationResponse> {
    const response = await this.client.delete<Types.NotificationResponse>(
      `/notifications/${notificationId}`
    );
    return response.data;
  }

  
  
  

  
  async importPreview(file: File, title?: string): Promise<Types.ImportPreview[]> {
    const formData = new FormData();
    formData.append("file", file);
    if (title) {
      formData.append("title", title);
    }

    const response = await this.client.post<Types.ImportPreview[]>(
      "/import/preview",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );
    return response.data;
  }

  
  async importConfirm(file: File, title?: string): Promise<Types.ImportResult[]> {
    const formData = new FormData();
    formData.append("file", file);
    if (title) {
      formData.append("title", title);
    }

    const response = await this.client.post<Types.ImportResult[]>(
      "/import/confirm",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );
    return response.data;
  }

  
  
  

  
  async getGDriveAuthStatus(): Promise<Types.GDriveAuthStatus> {
    const response = await this.client.get<{
      has_credentials: boolean;
      is_authenticated: boolean;
      connection_status: Types.GDriveConnectionStatus;
      connected_email: string | null;
      last_error: string | null;
      last_error_at: string | null;
      last_successful_sync_at: string | null;
      refresh_token_issued_at: string | null;
      refresh_token_expires_at: string | null;
    }>("/gdrive/auth/status");
    return {
      has_credentials: response.data.has_credentials,
      authenticated: response.data.is_authenticated,
      connection_status: response.data.connection_status,
      connected_email: response.data.connected_email,
      last_error: response.data.last_error,
      last_error_at: response.data.last_error_at,
      last_successful_sync_at: response.data.last_successful_sync_at,
      refresh_token_issued_at: response.data.refresh_token_issued_at,
      refresh_token_expires_at: response.data.refresh_token_expires_at,
    };
  }

  
  async getGDriveAuthUrl(): Promise<{ auth_url: string }> {
    const response = await this.client.get<{ auth_url: string }>(
      "/gdrive/auth/start"
    );
    return response.data;
  }

  
  async disconnectGDrive(): Promise<{ status: string }> {
    const response = await this.client.post<{ status: string }>(
      "/gdrive/auth/disconnect"
    );
    return response.data;
  }

  
  async listFolders(parentId?: string): Promise<Types.GDriveFolder[]> {
    const response = await this.client.get<Types.GDriveFolder[]>(
      "/gdrive/folders",
      {
        params: { parent_id: parentId || "root" },
      }
    );
    return response.data;
  }

  
  async getWatchedFolder(): Promise<Types.GDriveFolder | null> {
    const response = await this.client.get<Types.GDriveFolder | null>("/gdrive/folder");
    return response.data;
  }

  
  async getWatchedFolders(): Promise<Types.GDriveFolder[]> {
    const response = await this.client.get<Types.GDriveFolder[]>("/gdrive/watched-folders");
    return response.data;
  }

  
  async setWatchedFolders(folders: { id: string; name: string }[]): Promise<Types.GDriveFolder[]> {
    const response = await this.client.post<Types.GDriveFolder[]>(
      "/gdrive/watched-folders",
      { folders }
    );
    return response.data;
  }

  
  async getExcludedFolders(): Promise<{ folders: string[] }> {
    const response = await this.client.get<{ folders: string[] }>(
      "/gdrive/excluded-folders"
    );
    return response.data;
  }

  
  async setExcludedFolders(folders: string[]): Promise<{ status: string }> {
    const response = await this.client.post<{ status: string }>(
      "/gdrive/excluded-folders",
      { folders }
    );
    return response.data;
  }

  
  async listSheets(): Promise<Types.GDriveSheet[]> {
    const response = await this.client.get<Types.GDriveSheet[]>(
      "/gdrive/sheets"
    );
    return response.data;
  }

  
  async getFolderSheetCount(folderId: string): Promise<number> {
    const response = await this.client.get<{ count: number }>(
      "/gdrive/folder-sheet-count",
      { params: { folder_id: folderId } }
    );
    return response.data.count;
  }

  
  async sync(): Promise<Types.GDriveSyncResponse> {
    const response = await this.client.post<Types.GDriveSyncResponse>("/gdrive/sync", null, {
      timeout: 300000, 
    });
    return response.data;
  }

  
  async getSyncSchedule(): Promise<Types.SyncScheduleStatus> {
    const response = await this.client.get<Types.SyncScheduleStatus>("/gdrive/schedule");
    return response.data;
  }

  
  async setSyncSchedule(intervalMinutes: number): Promise<Types.SyncScheduleStatus> {
    const response = await this.client.put<Types.SyncScheduleStatus>("/gdrive/schedule", {
      interval_minutes: intervalMinutes,
    });
    return response.data;
  }

  
  async getHistory(): Promise<Types.GDriveSyncHistory[]> {
    const response = await this.client.get<Types.GDriveSyncHistory[]>(
      "/gdrive/history"
    );
    return response.data;
  }

  
  async resyncProgram(programId: number): Promise<{ status: string; program_id: number; sessions_imported: number; exercises_imported: number }> {
    const response = await this.client.post<{ status: string; program_id: number; sessions_imported: number; exercises_imported: number }>(
      `/gdrive/resync/${programId}`,
      null,
      { timeout: 120000 }
    );
    return response.data;
  }

  
  async resyncAllPrograms(athleteId: number): Promise<{ status: string; total: number; resynced: number; errors: string[] }> {
    const response = await this.client.post<{ status: string; total: number; resynced: number; errors: string[] }>(
      `/gdrive/resync-all/${athleteId}`,
      null,
      { timeout: 300000 }  
    );
    return response.data;
  }

  
  async forceResyncAll(): Promise<{ status: string; message: string }> {
    const response = await this.client.post<{ status: string; message: string }>(
      `/gdrive/force-resync-all`
    );
    return response.data;
  }

  
  async getForceResyncStatus(): Promise<{
    running: boolean;
    phase: string;
    total: number;
    resynced: number;
    errors: string[];
    orphaned: string[];
    started_at: number | null;
    finished_at: number | null;
  }> {
    const response = await this.client.get(`/gdrive/force-resync-status`);
    return response.data;
  }

  
  
  

  
  async getNamingPattern(): Promise<{
    current: string;
    default: string;
    presets: { id: string; label: string; pattern: string; example: string }[];
  }> {
    const response = await this.client.get(`/gdrive/naming-pattern`);
    return response.data;
  }

  
  async setNamingPattern(pattern: string): Promise<{ pattern: string; message: string }> {
    const response = await this.client.put(`/gdrive/naming-pattern`, { pattern });
    return response.data;
  }

  
  async previewNamingPattern(template: string, filenames: string[]): Promise<{
    template: string;
    total: number;
    matched_count: number;
    unmatched_count: number;
    matched: { filename: string; athlete: string | null; number: number | null; dates: string | null; theme: string | null; matched: boolean }[];
    unmatched: { filename: string }[];
  }> {
    const response = await this.client.post(`/gdrive/naming-pattern/preview`, { template, filenames });
    return response.data;
  }

  
  
  

  
  async organizeScan(folderId?: string): Promise<{
    groups: Record<string, { athlete_name: string; sheets: { id: string; name: string; modifiedTime: string }[]; count: number }>;
    unrecognized: { id: string; name: string; modifiedTime: string }[];
    already_organized: { id: string; name: string; folder: string; modifiedTime: string }[];
    existing_folders: { id: string; name: string }[];
    root_folder_id: string;
    summary: {
      total_sheets: number;
      matched_athletes: number;
      matched_sheets: number;
      unrecognized_count: number;
      already_organized_count: number;
    };
  }> {
    const url = folderId ? `/gdrive/organize/scan/${folderId}` : `/gdrive/organize/scan`;
    const response = await this.client.post(url);
    return response.data;
  }

  
  async organizeApply(
    data: {
      root_folder_id: string;
      groups: Record<string, string[]>;
      auto_watch?: boolean;
    },
    onProgress?: (event: OrganizeProgressEvent) => void,
  ): Promise<OrganizeApplyResult> {
    const response = await fetch(`${API_BASE_URL}/gdrive/organize/apply`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      let detail: unknown = response.statusText;
      try {
        detail = await response.json();
      } catch {
        
      }
      throw new APIError(response.status, detail, response.statusText);
    }

    verifyInstanceHeader(response.headers.get("x-instance-subdomain"));

    if (!response.body) {
      throw new Error("Streaming organize response had no body.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult: OrganizeApplyResult | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let frameEnd: number;
      while ((frameEnd = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd + 2);

        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;

          let event: OrganizeProgressEvent;
          try {
            event = JSON.parse(payload) as OrganizeProgressEvent;
          } catch {
            continue;
          }

          if (event.type === "complete") {
            finalResult = event.result;
          } else if (event.type === "error") {
            throw new Error(event.message || "Organize failed");
          }

          onProgress?.(event);
        }
      }
    }

    if (!finalResult) {
      throw new Error("Organize stream ended without a complete event.");
    }
    return finalResult;
  }

  
  
  

  async getCalendarAuthStatus(): Promise<{ has_credentials: boolean; is_authenticated: boolean }> {
    const response = await this.client.get<{ has_credentials: boolean; is_authenticated: boolean }>("/calendar/auth/status");
    return response.data;
  }

  async startCalendarAuth(): Promise<{ auth_url: string }> {
    const response = await this.client.get<{ auth_url: string }>("/calendar/auth/start");
    return response.data;
  }

  async disconnectCalendar(): Promise<{ status: string }> {
    const response = await this.client.post<{ status: string }>("/calendar/auth/disconnect");
    return response.data;
  }

  async listCalendars(): Promise<{ id: string; name: string; primary: boolean }[]> {
    const response = await this.client.get<{ id: string; name: string; primary: boolean }[]>("/calendar/calendars");
    return response.data;
  }

  async getSelectedCalendar(): Promise<{ calendar_id: string }> {
    const response = await this.client.get<{ calendar_id: string }>("/calendar/selected");
    return response.data;
  }

  async setSelectedCalendar(calendarId: string): Promise<{ status: string }> {
    const response = await this.client.post<{ status: string }>("/calendar/selected", { calendar_id: calendarId });
    return response.data;
  }

  async syncCalendar(): Promise<{
    meets: { total_meets: number; created: number; updated: number; errors: string[] };
    programs: { total_programs: number; created: number; updated: number; errors: string[] };
    availability: { total_athletes: number; created: number; updated: number; errors: string[] };
    birthdays: { total_athletes: number; created: number; updated: number; errors: string[] };
  }> {
    const response = await this.client.post<{
      meets: { total_meets: number; created: number; updated: number; errors: string[] };
      programs: { total_programs: number; created: number; updated: number; errors: string[] };
      availability: { total_athletes: number; created: number; updated: number; errors: string[] };
      birthdays: { total_athletes: number; created: number; updated: number; errors: string[] };
    }>("/calendar/sync");
    return response.data;
  }

  async getCalendarSyncOptions(): Promise<{
    meets: boolean;
    programs: boolean;
    availability: boolean;
    birthdays: boolean;
  }> {
    const response = await this.client.get<{
      meets: boolean;
      programs: boolean;
      availability: boolean;
      birthdays: boolean;
    }>("/calendar/sync-options");
    return response.data;
  }

  async setCalendarSyncOptions(options: {
    meets: boolean;
    programs: boolean;
    availability: boolean;
    birthdays: boolean;
  }): Promise<{
    meets: boolean;
    programs: boolean;
    availability: boolean;
    birthdays: boolean;
  }> {
    const response = await this.client.post<{
      meets: boolean;
      programs: boolean;
      availability: boolean;
      birthdays: boolean;
    }>("/calendar/sync-options", options);
    return response.data;
  }

  async syncSingleMeetToCalendar(meetId: number): Promise<{ status: string; event_id: string }> {
    const response = await this.client.post<{ status: string; event_id: string }>(`/calendar/sync/meets/${meetId}`);
    return response.data;
  }

  async syncSingleProgramToCalendar(athleteId: number): Promise<{ status: string; event_id: string }> {
    const response = await this.client.post<{ status: string; event_id: string }>(`/calendar/sync/programs/${athleteId}`);
    return response.data;
  }

  async ensureBeStrongHQCalendar(): Promise<{ status: string; calendar_id: string }> {
    const response = await this.client.post<{ status: string; calendar_id: string }>("/calendar/ensure-bestronghq");
    return response.data;
  }

  async getCalendarEventMapping(): Promise<{
    meet_events: Record<string, string>;
    program_events: Record<string, string>;
    availability_events: Record<string, string>;
    birthday_events: Record<string, string>;
  }> {
    const response = await this.client.get<{
      meet_events: Record<string, string>;
      program_events: Record<string, string>;
      availability_events: Record<string, string>;
      birthday_events: Record<string, string>;
    }>("/calendar/events");
    return response.data;
  }

  async getCalendarSyncPreview(): Promise<{
    meets: number;
    programs: number;
    availability: number;
    birthdays: number;
  }> {
    const response = await this.client.get<{
      meets: number;
      programs: number;
      availability: number;
      birthdays: number;
    }>("/calendar/sync-preview");
    return response.data;
  }

  async getCalendarSyncErrors(): Promise<{
    errors: {
      category: string;
      target_id: string;
      label: string;
      message: string;
      occurred_at: string;
    }[];
  }> {
    const response = await this.client.get<{
      errors: {
        category: string;
        target_id: string;
        label: string;
        message: string;
        occurred_at: string;
      }[];
    }>("/calendar/sync-errors");
    return response.data;
  }

  async clearCalendarSyncErrors(): Promise<{ status: string }> {
    const response = await this.client.post<{ status: string }>("/calendar/sync-errors/clear");
    return response.data;
  }

  
  
  

  
  async getAthleteWellness(
    athleteId: number,
    programId?: number
  ): Promise<Types.WellnessResponse> {
    const response = await this.client.get<Types.WellnessResponse>(
      `/wellness/athletes/${athleteId}`,
      {
        params: programId ? { program_id: programId } : {},
      }
    );
    return response.data;
  }

  
  async getBodyweightTrend(
    athleteId: number,
    programId?: number
  ): Promise<Types.BodyweightTrendPoint[]> {
    const response = await this.client.get<Types.BodyweightTrendPoint[]>(
      `/wellness/athletes/${athleteId}/bodyweight`,
      {
        params: programId ? { program_id: programId } : {},
      }
    );
    return response.data;
  }

  async getMyBodyweightTrend(
    programId?: number
  ): Promise<Types.BodyweightTrendPoint[]> {
    const response = await this.client.get<Types.BodyweightTrendPoint[]>(
      "/athlete/me/bodyweight",
      {
        params: programId ? { program_id: programId } : {},
      }
    );
    return response.data;
  }

  
  
  

  
  async getPrimaryDayDebug(
    athleteId: number,
    programId?: number
  ): Promise<Types.PrimaryDayDebugResponse> {
    const response = await this.client.get<Types.PrimaryDayDebugResponse>(
      "/analytics/primary-day-debug",
      {
        params: { athlete_id: athleteId, program_id: programId },
      }
    );
    return response.data;
  }

  
  async getRPECompliance(
    athleteId: number,
    programId?: number
  ): Promise<Types.RPEComplianceResponse> {
    const response = await this.client.get<Types.RPEComplianceResponse>(
      "/analytics/rpe-compliance",
      {
        params: { athlete_id: athleteId, program_id: programId },
      }
    );
    return response.data;
  }

  async getMyRPECompliance(
    programId?: number
  ): Promise<Types.RPEComplianceResponse> {
    const response = await this.client.get<Types.RPEComplianceResponse>(
      "/athlete/me/rpe-compliance",
      {
        params: { program_id: programId },
      }
    );
    return response.data;
  }

  
  async saveMeetResults(
    athleteId: number,
    payload: Types.MeetResultsWrite
  ): Promise<Types.MeetResultEntry[]> {
    const response = await this.client.post<Types.MeetResultEntry[]>(
      `/athletes/${athleteId}/meet-results`,
      payload
    );
    return response.data;
  }

  
  async listMeetResults(athleteId: number): Promise<Types.MeetResultEntry[]> {
    const response = await this.client.get<Types.MeetResultEntry[]>(
      `/athletes/${athleteId}/meet-results`
    );
    return response.data;
  }

  async getMyMeetResults(): Promise<Types.MeetResultEntry[]> {
    const response = await this.client.get<Types.MeetResultEntry[]>(
      "/athlete/me/meet-results"
    );
    return response.data;
  }

  
  async getCompetitionMaxes(
    athleteId: number
  ): Promise<Types.CompetitionMaxForLift[]> {
    const response = await this.client.get<Types.CompetitionMaxForLift[]>(
      `/athletes/${athleteId}/competition-maxes`
    );
    return response.data;
  }

  async deleteMeetResult(resultId: number): Promise<void> {
    await this.client.delete(`/meet-results/${resultId}`);
  }

  
  async getMaxHistory(
    athleteId: number,
    lift?: string
  ): Promise<Types.MaxHistoryEntry[]> {
    const response = await this.client.get<Types.MaxHistoryEntry[]>(
      `/athletes/${athleteId}/max-history`,
      {
        params: lift ? { lift } : {},
      }
    );
    return response.data;
  }

  async getMyMaxHistory(
    options?: { lift?: string }
  ): Promise<Types.MaxHistoryEntry[]> {
    const response = await this.client.get<Types.MaxHistoryEntry[]>(
      "/athlete/me/max-history",
      {
        params: options?.lift ? { lift: options.lift } : {},
      }
    );
    return response.data;
  }

  async getPREvents(athleteId: number): Promise<Types.PREventEntry[]> {
    const response = await this.client.get<Types.PREventEntry[]>(
      `/analytics/athletes/${athleteId}/pr-events`
    );
    return response.data;
  }

  async getMyPREvents(): Promise<Types.PREventEntry[]> {
    const response = await this.client.get<Types.PREventEntry[]>(
      "/athlete/me/pr-events"
    );
    return response.data;
  }

  
  async deduplicatePrograms(): Promise<{
    deleted_count: number;
    kept_count: number;
    details: Array<{
      program_id: number;
      athlete_id: number;
      program_number: number | null;
      reason: string;
      source_filename: string | null;
      kept_program_id?: number;
    }>;
  }> {
    const response = await this.client.post(`/programs/deduplicate`, null, { timeout: 60000 });
    return response.data;
  }

  
  
  

  async createWorkLog(data: Types.WorkLogCreate): Promise<Types.WorkLogResponse> {
    const response = await this.client.post<Types.WorkLogResponse>("/work-logs", data);
    return response.data;
  }

  async listWorkLogs(athleteId?: number, limit?: number): Promise<Types.WorkLogResponse[]> {
    const response = await this.client.get<Types.WorkLogResponse[]>("/work-logs", {
      params: { athlete_id: athleteId, limit },
    });
    return response.data;
  }

  async getWorkLogStats(days?: number): Promise<Types.WorkLogStats> {
    const response = await this.client.get<Types.WorkLogStats>("/work-logs/stats", {
      params: { days },
    });
    return response.data;
  }

  async deleteWorkLog(id: number): Promise<void> {
    await this.client.delete(`/work-logs/${id}`);
  }

  
  
  

  
  
  

  async getSettings(): Promise<Record<string, string | null>> {
    const response = await this.client.get<{ settings: Record<string, string | null> }>("/settings");
    return response.data.settings;
  }

  async getMySettings(): Promise<Record<string, string | null>> {
    const response = await this.client.get<Record<string, string | null>>(
      "/athlete/me/settings"
    );
    return response.data;
  }

  async updateSettings(settings: Record<string, string | null>): Promise<Record<string, string | null>> {
    const response = await this.client.put<{ settings: Record<string, string | null> }>("/settings", { settings });
    return response.data.settings;
  }

  
  setBaseURL(url: string): void {
    this.client.defaults.baseURL = url;
  }

  
  /* eslint-disable @typescript-eslint/no-explicit-any */
  addRequestInterceptor(
    onFulfilled: (config: any) => any,
    onRejected?: (error: any) => any
  ): void {
    this.client.interceptors.request.use(onFulfilled, onRejected);
  }

  
  addResponseInterceptor(
    onFulfilled: (response: any) => any,
    onRejected?: (error: any) => any
  ): void {
    this.client.interceptors.response.use(onFulfilled, onRejected);
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  
  
  

  
  async getAuthStatus(): Promise<Types.AuthStatusResponse> {
    const response = await this.client.get<Types.AuthStatusResponse>("/auth/status");
    return response.data;
  }

  
  async getBranding(): Promise<{ team_name: string }> {
    const response = await this.client.get<{ team_name: string }>("/auth/branding");
    return response.data;
  }

  
  async logout(): Promise<void> {
    await this.client.post("/auth/logout");
  }

  async athleteLogout(): Promise<void> {
    await this.client.post("/auth/athlete/logout");
  }

  async listAllowedUsers(): Promise<Types.AllowedUserResponse[]> {
    const response = await this.client.get<Types.AllowedUserResponse[]>("/auth/allowed-users");
    return response.data;
  }

  
  async addAllowedUser(data: { email: string; name?: string }): Promise<Types.AllowedUserResponse> {
    const response = await this.client.post<Types.AllowedUserResponse>("/auth/allowed-users", data);
    return response.data;
  }

  
  async removeAllowedUser(userId: number): Promise<void> {
    await this.client.delete(`/auth/allowed-users/${userId}`);
  }

  
  
  

  // ---------- OpenPowerlifting integration ----------

  async searchOpenPowerlifting(query: string): Promise<Types.OplSearchResponse> {
    const response = await this.client.get<Types.OplSearchResponse>("/opl/search", {
      params: { q: query },
    });
    return response.data;
  }

  async getOplCoverage(): Promise<Types.OplCoverageResponse> {
    const response = await this.client.get<Types.OplCoverageResponse>("/opl/coverage");
    return response.data;
  }

  async runOplAutolink(): Promise<Types.OplAutolinkResponse> {
    const response = await this.client.post<Types.OplAutolinkResponse>(
      "/opl/autolink",
      null,
      { timeout: 600000 },
    );
    return response.data;
  }

  async getOpenPowerliftingStatus(athleteId: number): Promise<Types.OplStatusResponse> {
    const response = await this.client.get<Types.OplStatusResponse>(
      `/opl/athletes/${athleteId}/status`,
    );
    return response.data;
  }

  async linkOpenPowerlifting(
    athleteId: number,
    slug: string,
    displayName?: string,
  ): Promise<Types.OplLinkResult> {
    const response = await this.client.post<Types.OplLinkResult>(
      `/opl/athletes/${athleteId}/link`,
      { slug, display_name: displayName ?? null },
      // Lifter CSV fetch can be slow when OpenPowerlifting is under load;
      // give it a generous ceiling rather than hitting the 30s default.
      { timeout: 60000 },
    );
    return response.data;
  }

  async refreshOpenPowerlifting(athleteId: number): Promise<Types.OplLinkResult> {
    const response = await this.client.post<Types.OplLinkResult>(
      `/opl/athletes/${athleteId}/refresh`,
      null,
      { timeout: 60000 },
    );
    return response.data;
  }

  async unlinkOpenPowerlifting(athleteId: number): Promise<void> {
    await this.client.delete(`/opl/athletes/${athleteId}/link`);
  }

  async setOplNotApplicable(
    athleteId: number,
    value: boolean,
  ): Promise<Types.OplStatusResponse> {
    const response = await this.client.put<Types.OplStatusResponse>(
      `/opl/athletes/${athleteId}/not-applicable`,
      { value },
    );
    return response.data;
  }


  async submitFeedback(payload: {
    type: "bug" | "feedback" | "question";
    text: string;
    creditName?: string;
    pageUrl?: string;
    images?: Blob[];
  }): Promise<{ ok: boolean; issue_url?: string }> {
    const formData = new FormData();
    formData.append("type", payload.type);
    formData.append("text", payload.text);
    if (payload.creditName) formData.append("credit_name", payload.creditName);
    if (payload.pageUrl) formData.append("page_url", payload.pageUrl);
    (payload.images || []).forEach((blob, i) => {
      formData.append(`image${i + 1}`, blob, `screenshot-${i + 1}.jpg`);
    });
    const response = await this.client.post<{ ok: boolean; issue_url?: string }>(
      "/feedback",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return response.data;
  }
}


const apiClient = new APIClient(API_BASE_URL);

export default apiClient;
export { APIClient };
