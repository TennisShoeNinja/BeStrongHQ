


export class APIError extends Error {
  constructor(
    public status: number,
    public data: unknown,
    message: string
  ) {
    super(message);
    this.name = "APIError";
  }
}


export interface MeetBase {
  name: string;
  federation?: string | null;
  meet_date?: string | null;
  meet_date_end?: string | null;
  weeks_out?: number | null;
  days_out?: number | null;
  location?: string | null;
  non_team_athletes?: string | null;
  liftingcast_link?: string | null;
}

export type MeetCreate = MeetBase;

export interface MeetUpdate {
  name?: string | null;
  federation?: string | null;
  meet_date?: string | null;
  meet_date_end?: string | null;
  location?: string | null;
  non_team_athletes?: string | null;
  liftingcast_link?: string | null;
}

export interface MeetListResponse extends MeetBase {
  id: number;
  athlete_count?: number;
}

export interface MeetResponse extends MeetBase {
  id: number;
  created_at: string;
  updated_at: string;
  athlete_count?: number;
  competing_athletes?: Array<{
    id: number;
    name: string;
  }>;
}

export interface AthleteReadiness {
  athlete_id: number;
  athlete_name: string;
  weight_class?: string | null;
  division?: string | null;
  squat_max_lbs?: number | null;
  bench_max_lbs?: number | null;
  deadlift_max_lbs?: number | null;
  total_lbs?: number | null;
  current_program_name?: string | null;
  current_block_type?: string | null;
  program_week?: string | null;
  days_until_meet?: number | null;
  weeks_until_meet?: number | null;
}

export interface MeetPrepResponse {
  meet_id: number;
  meet_name: string;
  meet_date?: string | null;
  athletes: AthleteReadiness[];
}


export interface AthleteBase {
  name: string;
  squat_max_lbs?: number | null;
  bench_max_lbs?: number | null;
  deadlift_max_lbs?: number | null;
  total_lbs?: number | null;
  goal?: string | null;
  age?: number | null;
  dob?: string | null;
  division?: string | null;
  weight_class?: string | null;
  program_due?: string | null;
  next_meet_name?: string | null;
  next_meet_id?: number | null;
  meet_date?: string | null;
  weeks_out?: number | null;
  days_out?: number | null;
  availability_status?: string | null;
  out_from?: string | null;
  out_through?: string | null;
  email?: string | null;
  phone?: string | null;
  membership_no?: number | null;
  lifting_db_link?: string | null;
  tags?: string | null;
  reminder_days_before?: number;
  primary_squat_day?: number | null;
  primary_bench_day?: number | null;
  primary_deadlift_day?: number | null;
  sex?: string | null;
  equipment?: string | null;
  goal_bodyweight_lbs?: number | null;
  body_metrics_hidden?: boolean;
  archived?: boolean;
  portal_disabled?: boolean;
}

export type AthleteCreate = AthleteBase;

export type AthleteUpdate = Partial<AthleteBase>;

export interface AthleteListResponse extends AthleteBase {
  id: number;
  program_count?: number;
  latest_program_name?: string | null;
  latest_program_id?: number | null;
  latest_program_sheet_url?: string | null;
  latest_block_type?: string | null;
  latest_bodyweight_lbs?: number | null;
  portal_last_login_at?: string | null;
}

export interface PendingMeetResults {
  meet_id?: number | null;
  meet_name?: string | null;
  meet_date?: string | null;
  meet_date_end?: string | null;
}

export interface AthleteResponse extends AthleteBase {
  id: number;
  created_at: string;
  updated_at: string;
  program_count?: number;
  latest_program_name?: string | null;
  latest_program_id?: number | null;
  latest_program_sheet_url?: string | null;
  latest_block_type?: string | null;
  pending_meet_results?: PendingMeetResults | null;
  last_synced_at?: string | null;
  portal_last_login_at?: string | null;
}


export interface ProgramListResponse {
  id: number;
  athlete_id: number;
  program_number?: number | null;
  program_name?: string | null;
  date_start?: string | null;
  date_end?: string | null;
  block_type?: string | null;
  google_sheet_url?: string | null;
  imported_at: string;
  session_count?: number;
  primary_squat_day?: number | null;
  primary_bench_day?: number | null;
  primary_deadlift_day?: number | null;
}

export interface ProgramResponse extends ProgramListResponse {
  source_filename?: string | null;
  exercise_count?: number;
}


export interface SessionResponse {
  id: number;
  program_id: number;
  week_number: number;
  day_number: number;
  day_name: string;
  session_label?: string | null;
  nutrition_rating?: string | null;
  stress_rating?: string | null;
  sleep_rating?: string | null;
  fatigue_rating?: string | null;
  exercise_count?: number;
}


export interface ExerciseEntryResponse {
  id: number;
  session_id: number;
  exercise_name: string;
  exercise_order: number;
  exercise_group: number;
  set_type: string;
  lift_category: string;
  sets: number;
  reps?: number | null;
  weight_lbs?: number | null;
  target_rpe?: string | null;
  actual_rpe?: number | null;
  volume?: number | null;
  is_accessory: boolean;
  failed: boolean;
  notes?: string | null;
}


export interface VolumeDataPoint {
  week_number: number;
  program_number?: number | null;
  program_name?: string | null;
  squat_volume?: number | null;
  bench_volume?: number | null;
  deadlift_volume?: number | null;
  total_volume?: number | null;
}

export interface PRRecord {
  exercise_name: string;
  
  canonical_exercise_name: string;
  lift_category: string;
  weight_lbs: number;
  reps?: number | null;
  sets: number;
  volume?: number | null;
  date?: string | null;
  program_number?: number | null;
  week_number: number;
  day_number: number;
}

export interface EstimatedMaxForLift {
  lift: string;
  declared: number | null;
  estimated: number | null;
  weight_lbs: number | null;
  reps: number | null;
  actual_rpe: number | null;
  exercise_name: string | null;
  program_id: number | null;
  program_number: number | null;
  program_name: string | null;
  week_number: number | null;
  day_number: number | null;
  exceeds_declared: boolean;
}

export interface RecentPR {
  athlete_id: number;
  athlete_name: string;
  lift: string;
  exercise_name?: string | null;
  weight_lbs: number;
  prior_best_lbs?: number | null;
  delta_lbs?: number | null;
  reps?: number | null;
  recorded_at: string;
}

export interface SessionsStats {
  window_days: number;
  this_window: number;
  last_window: number;
  delta_pct?: number | null;
}

export interface SearchAthleteHit {
  id: number;
  name: string;
}

export interface SearchMeetHit {
  id: number;
  name: string;
  meet_date?: string | null;
  federation?: string | null;
}

export interface SearchResponse {
  athletes: SearchAthleteHit[];
  meets: SearchMeetHit[];
}

export interface E1RMDataPoint {
  exercise_name: string;
  
  canonical_exercise_name: string;
  lift_category: string;
  weight_lbs: number;
  reps: number;
  
  actual_rpe: number | null;
  
  e1rm: number | null;
  week_number: number;
  day_number: number;
  
  day_name?: string | null;
  program_id?: number | null;
  program_number?: number | null;
  program_name?: string | null;
  
  google_sheet_url?: string | null;
  
  e1rm_method?: string | null;
  
  is_outlier?: boolean;
  
  outlier_reason?: string | null;
  
  outlier_average?: number | null;
  
  outlier_reference_points?: OutlierReferencePoint[];
}

export interface OutlierReferencePoint {
  exercise_name: string;
  weight_lbs: number;
  reps: number;
  actual_rpe: number | null;
  e1rm: number;
  program_number: number | null;
  week_number: number;
  day_number: number;
  day_name: string | null;
  google_sheet_url: string | null;
}

export interface DataQualityIssue {
  
  category: string;
  reason: string;
  lift_category: string | null;
  exercise_name: string | null;
  weight_lbs: number | null;
  reps: number | null;
  actual_rpe: number | null;
  e1rm: number | null;
  week_number: number | null;
  day_number: number | null;
  day_name: string | null;
  program_id: number | null;
  program_number: number | null;
  program_name: string | null;
  google_sheet_url: string | null;
}

export interface DataQualityResponse {
  athlete_id: number;
  total_top_sets: number;
  plotted_top_sets: number;
  outliers: DataQualityIssue[];
  excluded: DataQualityIssue[];
}


export interface ExerciseAliasEntry {
  id: number;
  primary_name: string;
  alias_name: string;
}

export interface ExerciseAliasGroup {
  primary_name: string;
  aliases: ExerciseAliasEntry[];
}


export interface VolumeResponsePeak {
  exercise_name: string;
  lift_category: string;
  weight_lbs: number;
  reps: number;
  actual_rpe: number | null;
  e1rm: number;
  
  e1rm_method: "actual" | "rpe" | "epley" | "none";
  program_number?: number | null;
  program_name?: string | null;
  week_number: number;
  day_number: number;
  trailing_weeks_available: number;
  trailing_volume_first_half: number | null;
  trailing_volume_second_half: number | null;
  trailing_slope: "rising" | "tapered" | "steady" | "insufficient";
  
  trailing_reason: string | null;
}

export interface VolumeResponseConfidence {
  score: number;
  data_volume_score: number;
  rpe_coverage_score: number;
  pattern_consistency_score: number;
  weeks_logged: number;
  rpe_coverage_pct: number;
  pattern_agreement_pct: number;
  explanation: string;
}

export type VolumeResponseProfileCode =
  | "rising"
  | "tapered"
  | "steady"
  | "mixed"
  | "insufficient_data";

export interface VolumeResponseProfile {
  lift_category: string;
  profile: VolumeResponseProfileCode;
  profile_label: string;
  confidence: VolumeResponseConfidence;
  peaks: VolumeResponsePeak[];
  trailing_weeks_window: number;
  top_n: number;
  total_peak_candidates: number;
}

export interface VolumeResponseResponse {
  athlete_id: number;
  profiles: VolumeResponseProfile[];
}


export interface RPEComplianceByLift {
  lift_category: string;
  
  total_entries: number;
  
  total_prescribed: number;
  
  fill_rate_pct: number;
  avg_rpe_diff: number;
  overshoot_count: number;
  undershoot_count: number;
  on_target_count: number;
}

export interface RPEComplianceByProgram {
  program_id: number;
  program_number?: number | null;
  program_name?: string | null;
  
  total_entries: number;
  
  total_prescribed: number;
  
  fill_rate_pct: number;
  avg_rpe_diff: number;
  overshoot_count: number;
  undershoot_count: number;
  on_target_count: number;
}

export interface RPEComplianceResponse {
  
  enabled: boolean;
  athlete_id: number;
  
  total_entries: number;
  
  total_prescribed: number;
  
  fill_rate_pct: number;
  avg_rpe_diff: number;
  overshoot_count: number;
  undershoot_count: number;
  on_target_count: number;
  by_lift: RPEComplianceByLift[];
  by_program: RPEComplianceByProgram[];
}


export interface WellnessDataPoint {
  id: number;
  date: string | null;
  week_number: number | null;
  day_of_week: string | null;
  goal_calories: number | null;
  goal_protein: number | null;
  goal_carbs: number | null;
  goal_fat: number | null;
  actual_calories: number | null;
  actual_protein: number | null;
  actual_carbs: number | null;
  actual_fat: number | null;
  bodyweight_lbs: number | null;
}

export interface WellnessSummary {
  total_entries: number;
  entries_with_calories: number;
  min_bodyweight: number | null;
  min_bodyweight_date: string | null;
  latest_bodyweight: number | null;
  latest_bodyweight_date: string | null;
  starting_bodyweight: number | null;
  starting_bodyweight_date: string | null;
  starting_bodyweight_program: number | null;
  starting_bodyweight_program_date: string | null;
  bodyweight_change: number | null;
  change_30d: number | null;
  avg_bw_this_week: number | null;
  avg_bw_last_week: number | null;
  avg_actual_calories: number | null;
  avg_actual_protein: number | null;
  avg_actual_carbs: number | null;
  avg_actual_fat: number | null;
  avg_goal_calories: number | null;
  calorie_compliance_pct: number | null;
}

export interface WellnessResponse {
  athlete_id: number;
  athlete_name: string;
  program_id: number | null;
  summary: WellnessSummary;
  data: WellnessDataPoint[];
}

export interface BodyweightTrendPoint {
  date: string;
  bodyweight_lbs: number;
  week_number: number | null;
  day_of_week: string | null;
}


export interface MaxHistoryEntry {
  id: number;
  athlete_id: number;
  lift: string;
  old_value: number | null;
  new_value: number;
  source: string;
  note: string | null;
  recorded_at: string;
  
  reps?: number | null;
  exercise_name?: string | null;
}


export interface MeetAttemptInput {
  lift: string;
  attempt_number: number;
  weight_lbs?: number | null;
  made?: boolean;
  notes?: string | null;
}

export interface MeetResultsWrite {
  athlete_id: number;
  meet_id?: number | null;
  meet_name?: string | null;
  meet_date?: string | null;
  federation?: string | null;
  weight_class?: string | null;
  division?: string | null;
  attempts: MeetAttemptInput[];
  replace_existing?: boolean;
}

export interface MeetResultEntry {
  id: number;
  athlete_id: number;
  meet_id: number | null;
  meet_name: string | null;
  meet_date: string | null;
  federation: string | null;
  weight_class: string | null;
  division: string | null;
  lift: string;
  attempt_number: number;
  weight_lbs: number;
  made: boolean;
  notes: string | null;
  bodyweight_kg: number | null;
  dots_score: number | null;
  gl_points: number | null;
  place: string | null;
  created_at: string;
}

export interface CompetitionMaxForLift {
  lift: string;
  weight_lbs: number | null;
  meet_id: number | null;
  meet_name: string | null;
  meet_date: string | null;
  federation: string | null;
  weight_class: string | null;
}


export interface PrimaryDayExercise {
  exercise_name: string;
  lift_category: string;
  set_type: string;
  sets: number;
  reps: number | null;
  weight_lbs: number | null;
  actual_rpe: number | null;
  e1rm: number | null;
  e1rm_eligible: boolean;
  issues: string[];
}

export interface PrimaryDayLiftDebug {
  day_number: number | null;
  day_name?: string;
  week_sampled?: number;
  status: string;
  matching_exercises?: PrimaryDayExercise[];
  other_exercises_on_day?: PrimaryDayExercise[];
  available_days?: number[];
}

export interface PrimaryDayDebugResponse {
  program: {
    id: number;
    name: string;
    number: number;
    date_start: string | null;
    date_end: string | null;
  } | null;
  available_days: Record<number, string>;
  primary_config: Record<string, number | null>;
  days: Record<string, PrimaryDayLiftDebug>;
}


export interface NotificationResponse {
  id: number;
  athlete_id: number;
  athlete_name?: string;
  notification_type: string;
  title: string;
  message?: string | null;
  due_date?: string | null;
  archived?: boolean;
  read?: boolean;
  created_at: string;
}


export interface ImportPreview {
  athlete_name: string;
  squat_max?: number | null;
  bench_max?: number | null;
  deadlift_max?: number | null;
  program_name?: string | null;
  program_number?: number | null;
  session_count: number;
  exercise_count: number;
}

export interface ImportResult {
  athlete_name: string;
  athlete_id: number;
  athlete_created: boolean;
  program_id: number;
  sessions_imported: number;
  exercises_imported: number;
}


export type GDriveConnectionStatus = 'active' | 'expired' | 'disconnected';

export interface GDriveAuthStatus {
  has_credentials: boolean;
  authenticated: boolean;
  connection_status: GDriveConnectionStatus;
  connected_email: string | null;
  last_error: string | null;
  last_error_at: string | null;
  last_successful_sync_at: string | null;
  refresh_token_issued_at: string | null;
  refresh_token_expires_at: string | null;
}

export interface GDriveFolder {
  id: string;
  name: string;
  modifiedTime?: string | null;
}

export interface GDriveSheet {
  id: string;
  name: string;
  modifiedTime?: string | null;
  createdTime?: string | null;
}

export interface GDriveSyncItem {
  name: string;
  folder?: string;
  sessions?: number;
  exercises?: number;
  reason?: string;
  error?: string;
}

export interface GDriveSyncResponse {
  total_found: number;
  total_imported: number;
  total_skipped: number;
  total_errors: number;
  imported: GDriveSyncItem[];
  skipped: GDriveSyncItem[];
  errors: GDriveSyncItem[];
  folders_scanned: string[];
  folders_excluded: string[];
}

export interface SyncScheduleStatus {
  enabled: boolean;
  interval_minutes: number;
  last_run: string | null;
  last_status: string | null;
  running_now: boolean;
}

export interface GDriveSyncHistory {
  id: number;
  gdrive_file_id: string;
  gdrive_file_name: string;
  gdrive_modified_time: string;
  program_id?: number | null;
  imported_at: string;
  status: string;
  error_message?: string | null;
}


export interface MergePreview {
  primary_id: number;
  primary_name: string;
  secondary_id: number;
  secondary_name: string;
  primary_program_count: number;
  secondary_program_count: number;
  programs_to_transfer: number;
}

export interface MergeResult {
  merged_athlete_id: number;
  merged_athlete_name: string;
  programs_transferred: number;
  total_programs: number;
}


export interface HealthResponse {
  status: string;
}


export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}


export interface WorkLogCreate {
  athlete_id: number;
  notification_id?: number | null;
  duration_seconds: number;
  action?: string;
  note?: string | null;
}

export interface WorkLogResponse {
  id: number;
  athlete_id: number;
  athlete_name: string;
  notification_id: number | null;
  duration_seconds: number;
  action: string;
  note: string | null;
  created_at: string;
}

export interface WorkLogStats {
  total_entries: number;
  total_seconds: number;
  avg_seconds_per_entry: number;
  by_athlete: Array<{
    athlete_id: number;
    athlete_name: string;
    total_seconds: number;
    entry_count: number;
  }>;
  by_week: Array<{
    week_start: string;
    total_seconds: number;
    entry_count: number;
  }>;
  by_month: Array<{
    month: string;
    total_seconds: number;
    entry_count: number;
  }>;
}


export interface AuthUserInfo {
  email: string;
  name: string | null;
  picture: string | null;
}

export interface InstanceInfo {
  subdomain: string;
  org_name: string;
  parser_id: string;
}

export interface InstanceSettings {
  tracks_rpe: boolean;
}

export interface AuthStatusResponse {
  authenticated: boolean;
  auth_enabled: boolean;
  deployment_mode: string;
  user: AuthUserInfo | null;
  instance: InstanceInfo | null;
  instance_settings: InstanceSettings;
  features: string[];
}

export interface AllowedUserResponse {
  id: number;
  email: string;
  name: string | null;
  is_admin: boolean;
  added_at: string;
}

export interface OplCandidate {
  slug: string;
  name: string;
  federation: string | null;
  country: string | null;
  state: string | null;
  sex: string | null;
  equipment: string | null;
  age_class: string | null;
  division: string | null;
  best_total_lbs: number | null;
  best_dots: number | null;
  weight_class_lbs: string | null;
  last_meet_date: string | null;
}

export interface OplSearchResponse {
  query: string;
  candidates: OplCandidate[];
}

export interface OplLinkInfo {
  slug: string;
  display_name: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
  profile_url: string;
}

// OPL meets land in the existing meet_results table (with source='opl')
// rather than a separate OPL-only table; the athlete profile renders
// them via the same MeetHistoryCard the manual entry surface used to
// feed. So the OPL status payload only carries link metadata now.
export interface OplStatusResponse {
  linked: boolean;
  link?: OplLinkInfo | null;
}

export interface OplLinkResult {
  linked: boolean;
  imported_attempts: number;
  link?: OplLinkInfo | null;
}
