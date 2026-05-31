'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ExternalLink,
  User,
  CheckCircle,
  SkipForward,
  SkipBack,
  Loader,
  Play,
  Pause,
  Clock,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Undo2,
  RotateCcw,
  Search,
  Plus,
  X,
  CalendarClock,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { withReturn } from '@/lib/back-nav';
import apiClient from '@/lib/api';
import { useAuth } from '@/lib/auth-provider';
import * as Types from '@/lib/types';
import BlockReviewSummary from '@/components/BlockReviewSummary';


const TIMER_STORAGE_KEY = 'bestrong_queue_timer';

interface TimerState {
  startedAt: number;       
  pausedElapsed: number;   
  athleteId: number | null;
  notificationId: number | null;
  running: boolean;
}

function saveTimerState(state: TimerState | null) {
  if (state) {
    sessionStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(state));
  } else {
    sessionStorage.removeItem(TIMER_STORAGE_KEY);
  }
}

function loadTimerState(): TimerState | null {
  try {
    const raw = sessionStorage.getItem(TIMER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TimerState;
  } catch {
    return null;
  }
}

function getElapsedFromState(state: TimerState): number {
  if (state.running) {
    return state.pausedElapsed + Math.floor((Date.now() - state.startedAt) / 1000);
  }
  return state.pausedElapsed;
}


const QUEUE_INDEX_KEY = 'bestrong_queue_index';

function saveQueueIndex(index: number) {
  sessionStorage.setItem(QUEUE_INDEX_KEY, String(index));
}

function loadQueueIndex(): number {
  try {
    const raw = sessionStorage.getItem(QUEUE_INDEX_KEY);
    if (!raw) return 0;
    return parseInt(raw, 10) || 0;
  } catch {
    return 0;
  }
}


const SESSION_STATS_KEY = 'bestrong_queue_session';

interface SessionStats {
  completed: number;
  totalSeconds: number;
}

function saveSessionStats(stats: SessionStats) {
  sessionStorage.setItem(SESSION_STATS_KEY, JSON.stringify(stats));
}

function loadSessionStats(): SessionStats {
  try {
    const raw = sessionStorage.getItem(SESSION_STATS_KEY);
    if (!raw) return { completed: 0, totalSeconds: 0 };
    return JSON.parse(raw) as SessionStats;
  } catch {
    return { completed: 0, totalSeconds: 0 };
  }
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Compact meet countdown in house style: "6wk" when 2+ weeks out, "5d" when
// inside two weeks, "Today"/"1d" near the line, "Past" once it's gone by.
// Derived entirely from server-computed weeks_out / days_out on the athlete.
function formatMeetCountdown(
  weeksOut: number | null | undefined,
  daysOut: number | null | undefined,
): string | null {
  if (daysOut == null && weeksOut == null) return null;
  if (daysOut != null) {
    if (daysOut < 0) return 'Past';
    if (daysOut === 0) return 'Today';
    if (daysOut < 14) return `${daysOut}d`;
  }
  if (weeksOut != null) {
    if (weeksOut < 0) return 'Past';
    return `${weeksOut}wk`;
  }
  return null;
}

// Tint the countdown the same way the meets page does: red inside 4 weeks,
// amber inside 8, otherwise calm primary. Past meets read dim.
function meetCountdownColor(
  weeksOut: number | null | undefined,
  daysOut: number | null | undefined,
): string {
  if (daysOut != null && daysOut < 0) return 'var(--cloud-text-dim)';
  if (weeksOut != null && weeksOut < 0) return 'var(--cloud-text-dim)';
  if (weeksOut != null) {
    if (weeksOut <= 4) return 'var(--cloud-danger-text)';
    if (weeksOut <= 8) return 'var(--cloud-warning-text)';
  }
  if (daysOut != null && daysOut <= 28) return 'var(--cloud-danger-text)';
  return 'var(--cloud-primary-text)';
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}


const MICRO_LABEL: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--cloud-text-muted)',
  fontWeight: 500,
};

export default function WorkQueuePage() {
  const queryClient = useQueryClient();
  const { instance } = useAuth();
  const teamName = instance?.org_name || 'BeStrong';
  const searchParams = useSearchParams();
  const focusParam = searchParams.get('focus');
  const focusHandledRef = useRef(false);
  const [currentIndex, setCurrentIndexRaw] = useState(0);
  const setCurrentIndex = useCallback((valOrFn: number | ((prev: number) => number)) => {
    setCurrentIndexRaw((prev) => {
      const next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      saveQueueIndex(next);
      return next;
    });
  }, []);

  
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const timerStateRef = useRef<TimerState | null>(null);

  
  const [confirmingDate, setConfirmingDate] = useState(false);
  const [proposedDate, setProposedDate] = useState('');

  
  const [sessionCompleted, setSessionCompleted] = useState(0);
  const [sessionTotalSeconds, setSessionTotalSeconds] = useState(0);

  
  interface UndoState {
    athleteId: number;
    athleteName: string;
    notificationId: number;
    oldDueDate: string | null;
    newDueDate: string;
    workLogId: number | null;
    elapsedSeconds: number;
  }
  const [undoAction, setUndoAction] = useState<UndoState | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  // After completing one athlete, hold the just-completed notification id
  // until the queue refetch lands and `current` advances to the next one,
  // then fire startTimer. State (not ref) so the effect reacts to it.
  const [pendingAutoStartAfterId, setPendingAutoStartAfterId] = useState<
    number | null
  >(null);

  
  const [statsOpen, setStatsOpen] = useState(false);

  
  const [addSearch, setAddSearch] = useState('');
  const [addSearchOpen, setAddSearchOpen] = useState(false);
  const addSearchRef = useRef<HTMLDivElement>(null);

  
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    
    const savedIndex = loadQueueIndex();
    if (savedIndex > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentIndexRaw(savedIndex);
    }

    
    const savedSession = loadSessionStats();
    setSessionCompleted(savedSession.completed);
    setSessionTotalSeconds(savedSession.totalSeconds);

    
    const saved = loadTimerState();
    if (saved) {
      timerStateRef.current = saved;
      const elapsed = getElapsedFromState(saved);
      setElapsedSeconds(elapsed);
      if (saved.running) {
        setTimerRunning(true);
        
        timerRef.current = setInterval(() => {
          if (timerStateRef.current) {
            setElapsedSeconds(getElapsedFromState(timerStateRef.current));
          }
        }, 1000);
      }
    }
  }, []);

  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addSearchRef.current && !addSearchRef.current.contains(e.target as Node)) {
        setAddSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', false],
    queryFn: () => apiClient.listNotifications(false),
  });

  
  const { data: workLogStats } = useQuery({
    queryKey: ['work-log-stats'],
    queryFn: () => apiClient.getWorkLogStats(30),
    staleTime: 60 * 1000,
  });

  
  const { data: allAthletes = [] } = useQuery({
    queryKey: ['athletes', false],
    queryFn: () => apiClient.listAthletes(false),
    staleTime: 5 * 60 * 1000,
  });

  
  const addManualMutation = useMutation({
    mutationFn: (athleteId: number) => apiClient.addManualQueueEntry(athleteId),
    onSuccess: () => {
      setAddSearch('');
      setAddSearchOpen(false);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notification-count'] });
    },
  });

  
  const removeManualMutation = useMutation({
    mutationFn: (notificationId: number) => apiClient.deleteNotification(notificationId),
    onSuccess: () => {
      resetTimer();
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notification-count'] });
    },
  });

  
  const queue = notifications
    .filter((n: Types.NotificationResponse) => !n.archived)
    // RPE-review flags live in the inbox only; the queue is the program
    // completion workflow and has no "done +1 week" action for them.
    .filter((n: Types.NotificationResponse) => n.notification_type !== "rpe_review")
    .sort((a: Types.NotificationResponse, b: Types.NotificationResponse) => {
      
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });


  const queuedAthleteIds = new Set(queue.map((n: Types.NotificationResponse) => n.athlete_id));

  // Athlete lookup for meet context (#22). `allAthletes` is already loaded for
  // the add-search; it carries server-computed next_meet_name / weeks_out /
  // days_out, so we surface the countdown without a second request.
  const athleteById = new Map<number, Types.AthleteListResponse>(
    allAthletes.map((a: Types.AthleteListResponse) => [a.id, a]),
  );

  
  const searchResults = addSearch.trim().length >= 1
    ? allAthletes
        .filter((a: Types.AthleteListResponse) =>
          a.name.toLowerCase().includes(addSearch.toLowerCase()) &&
          !queuedAthleteIds.has(a.id)
        )
        .slice(0, 8)
    : [];

  
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!isLoading && queue.length > 0 && currentIndex >= queue.length) {
      setCurrentIndex(Math.max(0, queue.length - 1));
    }
    if (!isLoading && queue.length === 0 && currentIndex !== 0) {
      setCurrentIndexRaw(0);
      saveQueueIndex(0);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [queue.length, isLoading, currentIndex, setCurrentIndex]);

  // Exact-spot restore: when returning here via a back link that carries
  // `?focus=<athlete_id>`, re-focus that athlete (robust against the queue
  // having reordered since). Runs once, after the queue has loaded.
  useEffect(() => {
    if (focusHandledRef.current || !focusParam || queue.length === 0) return;
    const targetId = parseInt(focusParam, 10);
    const idx = queue.findIndex(
      (n: Types.NotificationResponse) => n.athlete_id === targetId,
    );
    if (idx >= 0) {
      focusHandledRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentIndex(idx);
    }
  }, [focusParam, queue, setCurrentIndex]);

  const current = queue[currentIndex];

  
  const { data: currentAthlete } = useQuery({
    queryKey: ['athlete', current?.athlete_id],
    queryFn: () => apiClient.getAthlete(current!.athlete_id),
    enabled: !!current,
  });

  // Meet context for the focused athlete (#22). Prefer the freshly-fetched
  // single-athlete record; fall back to the roster list entry while it loads.
  const currentMeet: Types.AthleteBase | undefined =
    currentAthlete ?? (current ? athleteById.get(current.athlete_id) : undefined);
  const currentMeetCountdown = currentMeet
    ? formatMeetCountdown(currentMeet.weeks_out, currentMeet.days_out)
    : null;


  const startTimer = useCallback((athleteId?: number, notificationId?: number) => {
    if (timerRef.current) return;

    const existing = timerStateRef.current;
    const state: TimerState = {
      startedAt: Date.now(),
      pausedElapsed: existing ? existing.pausedElapsed : 0,
      athleteId: athleteId ?? existing?.athleteId ?? null,
      notificationId: notificationId ?? existing?.notificationId ?? null,
      running: true,
    };
    timerStateRef.current = state;
    saveTimerState(state);
    setTimerRunning(true);

    timerRef.current = setInterval(() => {
      if (timerStateRef.current) {
        setElapsedSeconds(getElapsedFromState(timerStateRef.current));
      }
    }, 1000);
  }, []);

  const pauseTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (timerStateRef.current && timerStateRef.current.running) {
      const elapsed = getElapsedFromState(timerStateRef.current);
      timerStateRef.current = { ...timerStateRef.current, pausedElapsed: elapsed, running: false };
      saveTimerState(timerStateRef.current);
    }
    setTimerRunning(false);
  }, []);

  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    timerStateRef.current = null;
    saveTimerState(null);
    setTimerRunning(false);
    setElapsedSeconds(0);
  }, []);

  const restartTimer = useCallback(() => {
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    const state: TimerState = {
      startedAt: Date.now(),
      pausedElapsed: 0,
      athleteId: timerStateRef.current?.athleteId ?? null,
      notificationId: timerStateRef.current?.notificationId ?? null,
      running: true,
    };
    timerStateRef.current = state;
    saveTimerState(state);
    setElapsedSeconds(0);
    setTimerRunning(true);
    timerRef.current = setInterval(() => {
      if (timerStateRef.current) {
        setElapsedSeconds(getElapsedFromState(timerStateRef.current));
      }
    }, 1000);
  }, []);

  
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (
      pendingAutoStartAfterId !== null &&
      current &&
      current.id !== pendingAutoStartAfterId &&
      !timerRunning
    ) {
      setPendingAutoStartAfterId(null);
      startTimer(current.athlete_id, current.id);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [pendingAutoStartAfterId, current, timerRunning, startTimer]);

  
  const completeMutation = useMutation({
    mutationFn: async ({ date }: { date: string }) => {
      if (!current) return { workLogId: null };
      
      const oldDueDate = current.notification_type === 'manual_queue'
        ? (currentAthlete?.program_due ?? null)
        : current.due_date;
      const athleteId = current.athlete_id;
      const athleteName = current.athlete_name || 'Unknown';
      const notificationId = current.id;
      const finalElapsed = timerStateRef.current ? getElapsedFromState(timerStateRef.current) : elapsedSeconds;

      await apiClient.updateAthlete(athleteId, { program_due: date });
      await apiClient.archiveNotification(notificationId);

      
      let workLogId: number | null = null;
      if (finalElapsed > 0) {
        const wl = await apiClient.createWorkLog({
          athlete_id: athleteId,
          notification_id: notificationId,
          duration_seconds: finalElapsed,
          action: 'complete',
        });
        workLogId = wl.id;
      }

      return { workLogId, athleteId, athleteName, notificationId, oldDueDate, newDueDate: date, finalElapsed };
    },
    onSuccess: (data) => {
      if (!data) return;
      const { workLogId, athleteId, athleteName, notificationId, oldDueDate, newDueDate, finalElapsed } = data;

      
      setSessionCompleted((prev) => {
        const next = prev + 1;
        setSessionTotalSeconds((prevTotal) => {
          const nextTotal = prevTotal + (finalElapsed || 0);
          saveSessionStats({ completed: next, totalSeconds: nextTotal });
          return nextTotal;
        });
        return next;
      });

      
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndoAction({
        athleteId: athleteId!,
        athleteName: athleteName!,
        notificationId: notificationId!,
        oldDueDate: oldDueDate ?? null,
        newDueDate: newDueDate!,
        workLogId: workLogId ?? null,
        elapsedSeconds: finalElapsed || 0,
      });
      undoTimerRef.current = setTimeout(() => {
        setUndoAction(null);
      }, 15000);

      
      
      
      resetTimer();
      setPendingAutoStartAfterId(notificationId ?? null);
      setConfirmingDate(false);
      setProposedDate('');

      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notification-count'] });
      queryClient.invalidateQueries({ queryKey: ['work-log-stats'] });
    },
  });

  
  const undoMutation = useMutation({
    mutationFn: async () => {
      if (!undoAction) return;
      
      await apiClient.updateAthlete(undoAction.athleteId, { program_due: undoAction.oldDueDate });
      
      await apiClient.unarchiveNotification(undoAction.notificationId);
      
      if (undoAction.workLogId) {
        await apiClient.deleteWorkLog(undoAction.workLogId);
      }
    },
    onSuccess: () => {
      if (!undoAction) return;

      
      setSessionCompleted((prev) => {
        const next = Math.max(0, prev - 1);
        setSessionTotalSeconds((prevTotal) => {
          const nextTotal = Math.max(0, prevTotal - undoAction.elapsedSeconds);
          saveSessionStats({ completed: next, totalSeconds: nextTotal });
          return nextTotal;
        });
        return next;
      });

      
      if (undoAction.elapsedSeconds > 0) {
        const state: TimerState = {
          startedAt: Date.now(),
          pausedElapsed: undoAction.elapsedSeconds,
          athleteId: undoAction.athleteId,
          notificationId: undoAction.notificationId,
          running: false,
        };
        timerStateRef.current = state;
        saveTimerState(state);
        setElapsedSeconds(undoAction.elapsedSeconds);
      }

      
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndoAction(null);

      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notification-count'] });
      queryClient.invalidateQueries({ queryKey: ['work-log-stats'] });
    },
  });

  
  const quickComplete = (unit: 'week' | 'month') => {
    if (!current) return;

    
    const baseDateStr = current.notification_type === 'manual_queue'
      ? currentAthlete?.program_due
      : current.due_date;
    const base = baseDateStr ? new Date(baseDateStr + 'T00:00:00') : new Date();
    if (unit === 'week') {
      base.setDate(base.getDate() + 7);
    } else {
      base.setMonth(base.getMonth() + 1);
    }
    const newDate = base.toISOString().split('T')[0];
    completeMutation.mutate({ date: newDate });
  };

  
  const openManualDatePicker = () => {
    if (!current) return;
    pauseTimer();
    
    const baseDateStr = current.notification_type === 'manual_queue'
      ? currentAthlete?.program_due
      : current.due_date;
    const base = baseDateStr ? new Date(baseDateStr + 'T00:00:00') : new Date();
    base.setDate(base.getDate() + 7);
    setProposedDate(base.toISOString().split('T')[0]);
    setConfirmingDate(true);
  };

  const confirmManualDate = () => {
    completeMutation.mutate({ date: proposedDate });
  };

  const cancelManualDate = () => {
    setConfirmingDate(false);
    setProposedDate('');
  };

  const goBack = () => {
    resetTimer();
    setConfirmingDate(false);
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  };

  const skip = () => {
    resetTimer();
    setConfirmingDate(false);
    setCurrentIndex((prev) => Math.min(prev + 1, queue.length - 1));
  };

  // Jump straight to an athlete from the left list (#24). Same teardown as the
  // skip/back controls so a half-started timer or open date picker don't carry
  // over to the newly-focused athlete.
  const selectAthlete = (index: number) => {
    if (index === currentIndex) return;
    resetTimer();
    setConfirmingDate(false);
    setCurrentIndex(index);
  };

  
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'No date set';
    const [y, m, d] = dateStr.split('-');
    return `${m}/${d}/${y}`;
  };

  
  const getDateStatus = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'none';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateStr + 'T00:00:00');
    const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'overdue';
    if (diff <= 2) return 'due_soon';
    return 'upcoming';
  };

  const dateStatus = current ? getDateStatus(current.due_date) : 'none';
  const dateColor =
    dateStatus === 'overdue'
      ? '#fca5a5'
      : dateStatus === 'due_soon'
        ? '#fdba74'
        : dateStatus === 'upcoming'
          ? '#67e8f9'
          : 'var(--cloud-text-dim)';

  
  const subtitleParts: string[] = [];
  if (!isLoading) {
    subtitleParts.push(`${queue.length} remaining`);
    if (sessionCompleted > 0) {
      subtitleParts.push(`${sessionCompleted} done this session`);
      subtitleParts.push(formatDuration(sessionTotalSeconds));
    }
  }

  return (
    <div style={{ padding: 'var(--cloud-s5) var(--cloud-s6)' }}>
      <div
        className="flex flex-col"
        style={{ gap: 'var(--cloud-s4)' }}
      >
        {}
        <div className="flex items-start justify-between" style={{ gap: 'var(--cloud-s3)' }}>
          <div className="min-w-0">
            <p
              className="cloud-eyebrow"
              style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span>{teamName}</span>
              <span
                aria-hidden
                style={{
                  width: 3,
                  height: 3,
                  borderRadius: '50%',
                  background: 'var(--cloud-text-dim)',
                  display: 'inline-block',
                }}
              />
              <span style={{ color: 'var(--cloud-text-dim)' }}>Triage</span>
            </p>
            <h1
              className="font-semibold cloud-text"
              style={{ fontSize: 32, letterSpacing: '-0.03em', lineHeight: 1.1 }}
            >
              Work queue
            </h1>
            <p className="cloud-text-muted" style={{ fontSize: 13, marginTop: 4 }}>
              {isLoading ? 'Loading…' : (subtitleParts.join(' · ') || 'All caught up')}
            </p>
          </div>

          {}
          {!isLoading && queue.length > 0 && (
            <div
              className="flex items-center flex-shrink-0"
              style={{
                gap: 8,
                padding: '6px 10px 6px 12px',
                borderRadius: 10,
                background: timerRunning
                  ? 'rgba(12, 92, 171, 0.12)'
                  : 'var(--cloud-surface-raised)',
                border: `1px solid ${timerRunning ? 'rgba(12, 92, 171, 0.4)' : 'var(--cloud-border)'}`,
                transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              <Clock
                style={{
                  width: 14,
                  height: 14,
                  color: timerRunning ? 'var(--cloud-primary)' : 'var(--cloud-text-muted)',
                }}
              />
              <span
                className="font-mono tabular-nums"
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  color: timerRunning ? 'var(--cloud-text)' : 'var(--cloud-text-muted)',
                  minWidth: 44,
                }}
              >
                {formatTimer(elapsedSeconds)}
              </span>
              <button
                onClick={timerRunning ? pauseTimer : () => startTimer(current?.athlete_id, current?.id)}
                className="grid place-items-center transition-opacity hover:opacity-80"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: timerRunning ? 'var(--cloud-primary)' : 'var(--cloud-text-muted)',
                }}
                title={timerRunning ? 'Pause' : 'Start'}
              >
                {timerRunning ? (
                  <Pause style={{ width: 13, height: 13 }} />
                ) : (
                  <Play style={{ width: 13, height: 13 }} />
                )}
              </button>
              {(timerRunning || elapsedSeconds > 0) && (
                <button
                  onClick={restartTimer}
                  className="grid place-items-center transition-opacity hover:opacity-80"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--cloud-text-dim)',
                  }}
                  title="Restart timer"
                >
                  <RotateCcw style={{ width: 12, height: 12 }} />
                </button>
              )}
            </div>
          )}
        </div>

        {}
        <div className="relative" ref={addSearchRef} style={{ maxWidth: 440 }}>
          <div
            className="flex items-center"
            style={{
              gap: 8,
              padding: '8px 12px',
              borderRadius: 10,
              background: 'var(--cloud-surface-raised)',
              border: `1px solid ${addSearchOpen ? 'var(--cloud-border-strong)' : 'var(--cloud-border)'}`,
              transition: 'border-color 0.15s',
            }}
          >
            <Search
              style={{ width: 14, height: 14, flexShrink: 0, color: 'var(--cloud-text-muted)' }}
            />
            <input
              type="text"
              placeholder="Add athlete to queue…"
              value={addSearch}
              onChange={(e) => {
                setAddSearch(e.target.value);
                setAddSearchOpen(true);
              }}
              onFocus={() => setAddSearchOpen(true)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 13,
                color: 'var(--cloud-text)',
              }}
            />
            {addSearch && (
              <button
                onClick={() => { setAddSearch(''); setAddSearchOpen(false); }}
                className="transition-opacity hover:opacity-80"
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 2,
                  cursor: 'pointer',
                  color: 'var(--cloud-text-muted)',
                }}
              >
                <X style={{ width: 13, height: 13 }} />
              </button>
            )}
          </div>

          {}
          {addSearchOpen && addSearch.trim().length >= 1 && (
            <div
              className="absolute z-50 w-full overflow-hidden"
              style={{
                marginTop: 4,
                borderRadius: 10,
                background: 'var(--cloud-surface-raised)',
                border: '1px solid var(--cloud-border)',
                boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
              }}
            >
              {searchResults.length === 0 ? (
                <div className="cloud-text-muted" style={{ padding: '12px 14px', fontSize: 13 }}>
                  {allAthletes.length === 0 ? 'Loading athletes…' : 'No matching athletes found'}
                </div>
              ) : (
                searchResults.map((athlete: Types.AthleteListResponse, i) => (
                  <button
                    key={athlete.id}
                    onClick={() => addManualMutation.mutate(athlete.id)}
                    disabled={addManualMutation.isPending}
                    className="w-full flex items-center justify-between transition-colors"
                    style={{
                      padding: '10px 14px',
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      borderTop: i > 0 ? '1px solid var(--cloud-border)' : 'none',
                      cursor: 'pointer',
                      color: 'var(--cloud-text)',
                      fontSize: 13,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div className="flex items-center" style={{ gap: 10, minWidth: 0 }}>
                      <span style={{ fontWeight: 500 }}>{athlete.name}</span>
                      {athlete.program_due && (
                        <span className="cloud-text-dim" style={{ fontSize: 11 }}>
                          Due {formatDate(athlete.program_due)}
                        </span>
                      )}
                    </div>
                    <Plus
                      style={{
                        width: 14,
                        height: 14,
                        flexShrink: 0,
                        color: 'var(--cloud-primary)',
                      }}
                      strokeWidth={2.5}
                    />
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {}
        {undoAction && (
          <div
            className="flex items-center justify-between"
            style={{
              gap: 12,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'var(--cloud-surface-raised)',
              border: '1px solid var(--cloud-border)',
              maxWidth: 440,
            }}
          >
            <span className="cloud-text-muted" style={{ fontSize: 13 }}>
              Completed{' '}
              <strong className="cloud-text" style={{ fontWeight: 600 }}>
                {undoAction.athleteName}
              </strong>
            </span>
            <button
              onClick={() => undoMutation.mutate()}
              disabled={undoMutation.isPending}
              className="cloud-btn cloud-btn-primary cloud-btn-sm"
            >
              <Undo2 style={{ width: 13, height: 13 }} />
              {undoMutation.isPending ? 'Undoing…' : 'Undo'}
            </button>
          </div>
        )}

        {}
        {isLoading && (
          <div className="flex flex-col items-center justify-center" style={{ padding: '96px 0' }}>
            <Loader
              className="animate-spin"
              style={{ width: 22, height: 22, color: 'var(--cloud-primary)', marginBottom: 12 }}
            />
            <p className="cloud-text-muted" style={{ fontSize: 13 }}>Loading notifications…</p>
          </div>
        )}

        {}
        {!isLoading && queue.length === 0 && (
          <div
            className="cloud-panel"
            style={{
              padding: 48,
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 12,
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                color: 'var(--cloud-success-text)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <CheckCircle style={{ width: 24, height: 24, strokeWidth: 1.8 }} />
            </div>
            <h2
              className="cloud-text"
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                margin: 0,
              }}
            >
              All clear.
            </h2>
            <p
              className="cloud-text-muted"
              style={{ fontSize: 13, margin: 0, maxWidth: 380 }}
            >
              Nothing left to review. You&apos;re caught up on every athlete.
            </p>
            {sessionCompleted > 0 && (
              <div
                className="inline-flex items-center"
                style={{
                  gap: 8,
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: 'rgba(12, 92, 171, 0.12)',
                  border: '1px solid rgba(12, 92, 171, 0.30)',
                  color: 'var(--cloud-primary-text)',
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.04em',
                  marginTop: 4,
                }}
              >
                <span style={{ textTransform: 'uppercase' }}>This session</span>
                <span className="cloud-text" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {sessionCompleted}
                </span>
                <span>completed</span>
                {sessionCompleted > 0 && (
                  <span
                    className="cloud-text-dim"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    · avg {formatDuration(Math.round(sessionTotalSeconds / sessionCompleted))}
                  </span>
                )}
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <Link href="/inbox" className="cloud-btn cloud-btn-primary">
                Go to inbox
              </Link>
            </div>
          </div>
        )}

        {}
        {!isLoading && queue.length > 0 && current && (
          <div className="queue-layout">
            {/* Left rail: the full queue as a clickable list (#24). Desktop-only;
                on mobile the single-card carousel below carries the experience. */}
            <aside className="hidden md:block">
              <div
                className="cloud-panel cloud-thin-scroll"
                style={{
                  position: 'sticky',
                  top: 'var(--cloud-s5)',
                  padding: 8,
                  maxHeight: 'calc(100vh - var(--cloud-s5) * 2)',
                  overflowY: 'auto',
                }}
              >
                <div
                  style={{
                    ...MICRO_LABEL,
                    padding: '6px 8px 8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>In queue</span>
                  <span
                    className="tabular-nums"
                    style={{ color: 'var(--cloud-text-dim)' }}
                  >
                    {queue.length}
                  </span>
                </div>
                <div className="flex flex-col" style={{ gap: 2 }}>
                  {queue.map((n: Types.NotificationResponse, index: number) => {
                    const athlete = athleteById.get(n.athlete_id);
                    const isActive = index === currentIndex;
                    const rowDueStatus = getDateStatus(n.due_date);
                    const rowDueColor =
                      rowDueStatus === 'overdue'
                        ? 'var(--cloud-danger-text)'
                        : rowDueStatus === 'due_soon'
                          ? 'var(--cloud-warning-text)'
                          : 'var(--cloud-text-dim)';
                    const countdown = athlete
                      ? formatMeetCountdown(athlete.weeks_out, athlete.days_out)
                      : null;
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => selectAthlete(index)}
                        aria-current={isActive ? 'true' : undefined}
                        className="w-full flex items-center transition-colors"
                        style={{
                          gap: 8,
                          padding: '9px 10px',
                          borderRadius: 8,
                          textAlign: 'left',
                          cursor: 'pointer',
                          border: '1px solid',
                          borderColor: isActive
                            ? 'rgba(12, 92, 171, 0.4)'
                            : 'transparent',
                          background: isActive
                            ? 'rgba(12, 92, 171, 0.12)'
                            : 'transparent',
                          color: 'var(--cloud-text)',
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive)
                            e.currentTarget.style.background =
                              'var(--cloud-panel-hover)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive)
                            e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: '50%',
                            flexShrink: 0,
                            background: rowDueColor,
                          }}
                        />
                        <span
                          className="flex-1 min-w-0"
                          style={{
                            fontSize: 13,
                            fontWeight: isActive ? 600 : 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {n.athlete_name || 'Unknown'}
                        </span>
                        {n.notification_type === 'manual_queue' && (
                          <span
                            aria-label="Manually queued"
                            title="Manually queued"
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: '50%',
                              flexShrink: 0,
                              background: 'var(--cloud-primary-text)',
                            }}
                          />
                        )}
                        {countdown && (
                          <span
                            className="tabular-nums"
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              flexShrink: 0,
                              color: meetCountdownColor(
                                athlete?.weeks_out,
                                athlete?.days_out,
                              ),
                            }}
                          >
                            {countdown}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>

            {/* Right column: the focused athlete + progress + stats. */}
            <div className="flex flex-col min-w-0" style={{ gap: 'var(--cloud-s4)' }}>
            {}
            <div className="cloud-panel" style={{ padding: 28 }}>
              {}
              <div className="flex items-start justify-between" style={{ gap: 12, marginBottom: 6 }}>
                <div style={MICRO_LABEL}>Athlete</div>
                <div className="flex items-center" style={{ gap: 6 }}>
                  {/* Meet countdown chip (#22): instant triage signal for an
                      athlete prepping a meet. Tinted by proximity. */}
                  {currentMeetCountdown && (
                    <Link
                      href={
                        currentMeet?.next_meet_id != null
                          ? withReturn(
                              `/meets/${currentMeet.next_meet_id}`,
                              `/queue?focus=${current.athlete_id}`,
                              'Work queue',
                            )
                          : '/meets'
                      }
                      className="cloud-badge transition-opacity hover:opacity-80"
                      style={{
                        fontSize: 10,
                        color: meetCountdownColor(
                          currentMeet?.weeks_out,
                          currentMeet?.days_out,
                        ),
                        borderColor: 'var(--cloud-border)',
                      }}
                      title={
                        currentMeet?.next_meet_name
                          ? `${currentMeet.next_meet_name} · ${currentMeetCountdown} out`
                          : `${currentMeetCountdown} out`
                      }
                    >
                      <CalendarClock style={{ width: 11, height: 11 }} />
                      {currentMeetCountdown} out
                    </Link>
                  )}
                  {current.notification_type === 'manual_queue' && (
                    <>
                      <span
                        className="cloud-badge cloud-badge-primary"
                        style={{ fontSize: 10 }}
                      >
                        <span className="cloud-badge-dot" />
                        Manual
                      </span>
                      <button
                        onClick={() => removeManualMutation.mutate(current.id)}
                        disabled={removeManualMutation.isPending}
                        className="cloud-btn cloud-btn-ghost cloud-btn-sm"
                        title="Remove from queue"
                      >
                        <Undo2 style={{ width: 12, height: 12 }} />
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
              <h2
                className="cloud-text font-semibold"
                style={{
                  fontSize: 30,
                  letterSpacing: '-0.025em',
                  lineHeight: 1.1,
                }}
              >
                {current.athlete_name || 'Unknown'}
              </h2>

              {}
              <div
                style={{
                  borderTop: '1px solid var(--cloud-border)',
                  margin: '24px 0',
                }}
              />

              {}
              <div
                className="flex flex-wrap"
                style={{ gap: 'var(--cloud-s5)', rowGap: 'var(--cloud-s3)' }}
              >
                <div>
                  <div style={MICRO_LABEL}>Program due</div>
                  <div
                    className="font-semibold"
                    style={{
                      fontSize: 22,
                      marginTop: 4,
                      letterSpacing: '-0.015em',
                      color:
                        current.notification_type === 'manual_queue'
                          ? 'var(--cloud-text)'
                          : dateColor,
                    }}
                  >
                    {current.notification_type === 'manual_queue'
                      ? formatDate(currentAthlete?.program_due)
                      : formatDate(current.due_date)}
                  </div>
                </div>

                {/* Competition context (#22): meet name + how far out, derived
                    from the athlete's server-computed countdown. */}
                {currentMeet?.next_meet_name && currentMeetCountdown && (
                  <div className="min-w-0">
                    <div style={MICRO_LABEL}>Next meet</div>
                    <div
                      className="font-semibold flex items-baseline"
                      style={{
                        fontSize: 22,
                        marginTop: 4,
                        gap: 8,
                        letterSpacing: '-0.015em',
                      }}
                    >
                      <Link
                        href={
                          currentMeet.next_meet_id != null
                            ? `/meets/${currentMeet.next_meet_id}`
                            : '/meets'
                        }
                        className="cloud-text transition-opacity hover:opacity-80"
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 260,
                        }}
                        title={currentMeet.next_meet_name}
                      >
                        {currentMeet.next_meet_name}
                      </Link>
                      <span
                        className="tabular-nums"
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          flexShrink: 0,
                          color: meetCountdownColor(
                            currentMeet.weeks_out,
                            currentMeet.days_out,
                          ),
                        }}
                      >
                        {currentMeetCountdown} out
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {}
              <div style={{ marginTop: 22 }}>
                <div
                  className="cloud-text"
                  style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.005em' }}
                >
                  {current.title}
                </div>
                {current.message && (
                  <p className="cloud-text-muted" style={{ fontSize: 13, marginTop: 4 }}>
                    {current.message}
                  </p>
                )}
              </div>

              {}
              <div
                className="flex flex-wrap"
                style={{ gap: 8, marginTop: 20 }}
              >
                {currentAthlete?.latest_program_sheet_url && (
                  <button
                    type="button"
                    className="cloud-btn cloud-btn-ghost"
                    onClick={() => {
                      if (!timerRunning && elapsedSeconds === 0 && current) {
                        startTimer(current.athlete_id, current.id);
                      }
                      window.open(
                        currentAthlete.latest_program_sheet_url!,
                        '_blank',
                        'noopener,noreferrer',
                      );
                    }}
                  >
                    <ExternalLink style={{ width: 13, height: 13 }} />
                    Open sheet
                  </button>
                )}
                <Link
                  href={withReturn(
                    `/athletes/${current.athlete_id}`,
                    `/queue?focus=${current.athlete_id}`,
                    'Work queue',
                  )}
                  className="cloud-btn cloud-btn-ghost"
                >
                  <User style={{ width: 13, height: 13 }} />
                  View athlete
                </Link>
              </div>

              {}
              {confirmingDate && (
                <div
                  style={{
                    marginTop: 20,
                    padding: 16,
                    borderRadius: 10,
                    background: 'var(--cloud-surface-raised)',
                    border: '1px solid var(--cloud-border)',
                  }}
                >
                  <div style={{ ...MICRO_LABEL, marginBottom: 10 }}>
                    Select next program due date
                  </div>
                  <div className="flex items-center flex-wrap" style={{ gap: 12, marginBottom: 12 }}>
                    <input
                      type="date"
                      value={proposedDate}
                      onChange={(e) => setProposedDate(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'var(--cloud-surface)',
                        border: '1px solid var(--cloud-border)',
                        color: 'var(--cloud-text)',
                        fontSize: 14,
                        fontWeight: 500,
                        fontFamily: 'inherit',
                      }}
                    />
                    <span
                      className="cloud-text"
                      style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}
                    >
                      {formatDate(proposedDate)}
                    </span>
                  </div>
                  {elapsedSeconds > 0 && (
                    <div className="cloud-text-dim" style={{ fontSize: 12, marginBottom: 12 }}>
                      Time spent: {formatTimer(elapsedSeconds)}
                    </div>
                  )}
                  <div className="flex" style={{ gap: 8 }}>
                    <button
                      onClick={confirmManualDate}
                      disabled={completeMutation.isPending}
                      className="cloud-btn cloud-btn-primary"
                    >
                      {completeMutation.isPending ? (
                        <>
                          <Loader className="animate-spin" style={{ width: 13, height: 13 }} />
                          Saving…
                        </>
                      ) : (
                        'Confirm & next'
                      )}
                    </button>
                    <button onClick={cancelManualDate} className="cloud-btn cloud-btn-ghost">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {}
              {!confirmingDate && (
                <div style={{ marginTop: 24 }}>
                  <div className="flex flex-wrap" style={{ gap: 8 }}>
                    <button
                      onClick={goBack}
                      disabled={currentIndex <= 0}
                      className="cloud-btn cloud-btn-ghost"
                      style={{ padding: '9px 12px' }}
                      title="Previous"
                    >
                      <SkipBack style={{ width: 14, height: 14 }} />
                    </button>
                    <button
                      onClick={() => quickComplete('week')}
                      disabled={completeMutation.isPending}
                      className="cloud-btn cloud-btn-primary"
                      style={{ flex: 1, minWidth: 140, justifyContent: 'center' }}
                    >
                      {completeMutation.isPending ? (
                        <>
                          <Loader className="animate-spin" style={{ width: 13, height: 13 }} />
                          Saving…
                        </>
                      ) : (
                        <>
                          <CheckCircle style={{ width: 13, height: 13 }} />
                          Done +1 week
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => quickComplete('month')}
                      disabled={completeMutation.isPending}
                      className="cloud-btn"
                      style={{ flex: 1, minWidth: 140, justifyContent: 'center' }}
                    >
                      <CheckCircle style={{ width: 13, height: 13 }} />
                      Done +1 month
                    </button>
                    <button
                      onClick={skip}
                      disabled={currentIndex >= queue.length - 1}
                      className="cloud-btn cloud-btn-ghost"
                      style={{ padding: '9px 12px' }}
                      title="Next"
                    >
                      <SkipForward style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                  <div className="text-center" style={{ marginTop: 10 }}>
                    <button
                      onClick={openManualDatePicker}
                      className="cloud-text-dim transition-opacity hover:opacity-80"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        fontSize: 12,
                        textDecoration: 'underline',
                        textUnderlineOffset: 2,
                      }}
                    >
                      Pick a specific date
                    </button>
                  </div>
                </div>
              )}

              {}
              {current && (
                <div
                  style={{
                    borderTop: '1px solid var(--cloud-border)',
                    paddingTop: 20,
                    marginTop: 24,
                    marginLeft: -28,
                    marginRight: -28,
                    paddingLeft: 28,
                    paddingRight: 28,
                  }}
                >
                  <BlockReviewSummary
                    athleteId={current.athlete_id}
                    context="queue"
                    athleteName={current.athlete_name ?? null}
                  />
                </div>
              )}
            </div>

            {}
            <div
              className="flex items-center justify-between"
              style={{ padding: '0 4px', fontSize: 12 }}
            >
              <span className="cloud-text-muted">
                {currentIndex + 1} of {queue.length}
                {sessionCompleted > 0 && (
                  <span className="cloud-text-dim"> · {sessionCompleted} done</span>
                )}
              </span>
              <div className="flex" style={{ gap: 4 }}>
                {queue.map((_, index) => (
                  <div
                    key={index}
                    className="transition-all"
                    style={{
                      height: 3,
                      width: index === currentIndex ? 22 : 8,
                      borderRadius: 999,
                      background:
                        index <= currentIndex
                          ? 'var(--cloud-primary)'
                          : 'var(--cloud-border)',
                    }}
                  />
                ))}
              </div>
            </div>

            {}
            <div
              style={{
                borderRadius: 10,
                background: 'var(--cloud-panel)',
                border: '1px solid var(--cloud-border)',
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => setStatsOpen(!statsOpen)}
                className="w-full flex items-center justify-between transition-opacity hover:opacity-90"
                style={{
                  padding: '12px 16px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <span
                  className="cloud-text-muted flex items-center"
                  style={{ gap: 8, fontSize: 13, fontWeight: 500 }}
                >
                  <BarChart3 style={{ width: 14, height: 14 }} />
                  Time tracking stats
                </span>
                {statsOpen ? (
                  <ChevronUp
                    style={{ width: 14, height: 14, color: 'var(--cloud-text-dim)' }}
                  />
                ) : (
                  <ChevronDown
                    style={{ width: 14, height: 14, color: 'var(--cloud-text-dim)' }}
                  />
                )}
              </button>

              {statsOpen && (
                <div style={{ padding: '0 16px 18px', borderTop: '1px solid var(--cloud-border)' }}>
                  {}
                  <div style={{ paddingTop: 16, marginBottom: 16 }}>
                    <div style={{ ...MICRO_LABEL, marginBottom: 10 }}>This session</div>
                    <div className="grid grid-cols-3" style={{ gap: 8 }}>
                      <StatMini label="Completed" value={String(sessionCompleted)} />
                      <StatMini
                        label="Total time"
                        value={formatDuration(sessionTotalSeconds)}
                      />
                      <StatMini
                        label="Avg / athlete"
                        value={
                          sessionCompleted > 0
                            ? formatDuration(Math.round(sessionTotalSeconds / sessionCompleted))
                            : '0m'
                        }
                      />
                    </div>
                  </div>

                  {}
                  {workLogStats && (
                    <div>
                      <div style={{ ...MICRO_LABEL, marginBottom: 10 }}>Last 30 days</div>
                      <div className="grid grid-cols-3" style={{ gap: 8, marginBottom: 16 }}>
                        <StatMini
                          label="Programs"
                          value={String(workLogStats.total_entries)}
                        />
                        <StatMini
                          label="Total time"
                          value={formatDuration(workLogStats.total_seconds)}
                        />
                        <StatMini
                          label="Avg / athlete"
                          value={formatDuration(Math.round(workLogStats.avg_seconds_per_entry))}
                        />
                      </div>

                      {workLogStats.by_athlete.length > 0 && (
                        <div>
                          <div style={{ ...MICRO_LABEL, marginBottom: 8 }}>Time by athlete</div>
                          <div className="flex flex-col" style={{ gap: 2 }}>
                            {workLogStats.by_athlete.slice(0, 5).map((a) => (
                              <div
                                key={a.athlete_id}
                                className="flex items-center justify-between"
                                style={{ padding: '6px 8px', fontSize: 13 }}
                              >
                                <span className="cloud-text">{a.athlete_name}</span>
                                <span className="cloud-text-dim" style={{ fontSize: 12 }}>
                                  {formatDuration(a.total_seconds)} ({a.entry_count} sessions)
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        background: 'var(--cloud-surface-raised)',
        border: '1px solid var(--cloud-border)',
        textAlign: 'center',
      }}
    >
      <div
        className="cloud-text"
        style={{
          fontSize: 20,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        className="cloud-text-muted"
        style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}
      >
        {label}
      </div>
    </div>
  );
}
