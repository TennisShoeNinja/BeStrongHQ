'use client';

import { useState, type CSSProperties } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  FolderOpen,
  Loader2,
  Check,
  AlertCircle,
  FileSpreadsheet,
  FolderPlus,
  ChevronRight,
  HelpCircle,
  X,
  Users,
} from 'lucide-react';
import apiClient, { type OrganizeApplyResult } from '@/lib/api';

type ScanResult = Awaited<ReturnType<typeof apiClient.organizeScan>>;
type ApplyResult = OrganizeApplyResult;

interface ApplyProgress {
  total: number;
  completed: number;
  currentFilename: string | null;
  currentAthlete: string | null;
}

interface GroupEdit {
  athlete_name: string;
  file_ids: string[];
  sheets: { id: string; name: string; modifiedTime: string }[];
}

const MICRO_LABEL: CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontWeight: 500,
};

interface DriveOrganizerProps {
  rootWatched: boolean;
}

export default function DriveOrganizer({ rootWatched }: DriveOrganizerProps) {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [editedGroups, setEditedGroups] = useState<GroupEdit[]>([]);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [showUnrecognized, setShowUnrecognized] = useState(false);
  const [progress, setProgress] = useState<ApplyProgress | null>(null);

  const scanMutation = useMutation({
    mutationFn: () => apiClient.organizeScan(),
    onSuccess: (data) => {
      setScanResult(data);
      setApplyResult(null);
      const groups: GroupEdit[] = Object.entries(data.groups).map(
        ([name, group]) => ({
          athlete_name: name,
          file_ids: group.sheets.map((s) => s.id),
          sheets: group.sheets,
        })
      );
      setEditedGroups(groups);
    },
  });

  const applyMutation = useMutation({
    mutationFn: () => {
      if (!scanResult) throw new Error('No scan result');
      const groups: Record<string, string[]> = {};
      const filenameById = new Map<string, string>();
      for (const g of editedGroups) {
        if (g.file_ids.length > 0) {
          groups[g.athlete_name] = g.file_ids;
        }
        for (const sheet of g.sheets) {
          filenameById.set(sheet.id, sheet.name);
        }
      }
      setProgress({
        total: 0,
        completed: 0,
        currentFilename: null,
        currentAthlete: null,
      });
      return apiClient.organizeApply(
        {
          root_folder_id: scanResult.root_folder_id,
          groups,
          auto_watch: true,
        },
        (event) => {
          if (event.type === 'start') {
            setProgress({
              total: event.total_files,
              completed: 0,
              currentFilename: null,
              currentAthlete: null,
            });
          } else if (
            event.type === 'file_moved' ||
            event.type === 'move_failed'
          ) {
            setProgress({
              total: event.total,
              completed: event.completed,
              currentFilename:
                filenameById.get(event.file_id) ?? event.file_id,
              currentAthlete: event.athlete_name,
            });
          } else if (event.type === 'folder_created') {
            setProgress((prev) =>
              prev
                ? { ...prev, currentAthlete: event.name, currentFilename: null }
                : prev
            );
          }
        }
      );
    },
    onSuccess: (data) => {
      setApplyResult(data);
      setScanResult(null);
      setEditedGroups([]);
      setProgress(null);
    },
    onError: () => {
      setProgress(null);
    },
  });

  const handleRenameGroup = (index: number, newName: string) => {
    setEditedGroups((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], athlete_name: newName };
      return updated;
    });
  };

  const handleRemoveFromGroup = (groupIndex: number, fileId: string) => {
    setEditedGroups((prev) => {
      const updated = [...prev];
      const group = { ...updated[groupIndex] };
      group.file_ids = group.file_ids.filter((id) => id !== fileId);
      group.sheets = group.sheets.filter((s) => s.id !== fileId);
      updated[groupIndex] = group;
      return updated;
    });
  };

  
  if (!scanResult && !applyResult) {
    return (
      <div className="cloud-panel" style={{ padding: 24 }}>
        <div className="flex items-center" style={{ gap: 10, marginBottom: 6 }}>
          <FolderPlus
            style={{ width: 18, height: 18, color: '#fb923c', strokeWidth: 1.8 }}
          />
          <h3
            className="cloud-text"
            style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}
          >
            Drive organization
          </h3>
        </div>
        <p
          className="cloud-text-muted"
          style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.55 }}
        >
          Scan My Drive for loose program sheets and automatically group them
          into per-athlete folders. This makes your Google Drive cleaner and
          sets up automatic syncing.
        </p>

        <p
          className="cloud-text-dim"
          style={{ fontSize: 12, marginBottom: 16, lineHeight: 1.55 }}
        >
          {rootWatched
            ? 'My Drive root is one of your watched folders, so there may be loose sheets to organize. Once everything lives inside per-athlete folders, this step no longer applies.'
            : 'Available only when My Drive root is one of your watched folders. Your current setup watches specific folders, so your sheets are already organized.'}
        </p>

        <div
          className="flex items-start"
          style={{
            gap: 8,
            marginBottom: 18,
            padding: 12,
            borderRadius: 8,
            backgroundColor: 'rgba(103, 232, 249, 0.06)',
            border: '1px solid rgba(103, 232, 249, 0.18)',
          }}
        >
          <HelpCircle
            style={{
              width: 14,
              height: 14,
              color: '#67e8f9',
              marginTop: 2,
              flexShrink: 0,
            }}
          />
          <p
            className="cloud-text-muted"
            style={{ fontSize: 12, lineHeight: 1.55, margin: 0 }}
          >
            The scan looks at filenames like{' '}
            <span
              className="cloud-text"
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            >
              &ldquo;Name&rsquo;s Program 35 &ndash; (dates) &ndash; Theme&rdquo;
            </span>{' '}
            to extract athlete names. Sheets that don&apos;t match this pattern will
            be listed separately for manual review. Nothing is moved until you
            confirm.
          </p>
        </div>

        <button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending || !rootWatched}
          className="cloud-btn cloud-btn-primary"
          title={
            rootWatched
              ? undefined
              : 'Add My Drive root to your watched folders to enable this.'
          }
        >
          {scanMutation.isPending ? (
            <>
              <Loader2
                className="animate-spin"
                style={{ width: 14, height: 14, marginRight: 8 }}
              />
              Scanning…
            </>
          ) : (
            <>
              <FolderOpen
                style={{ width: 14, height: 14, marginRight: 8 }}
              />
              Scan Drive
            </>
          )}
        </button>

        {scanMutation.isError && (
          <p style={{ color: '#fca5a5', fontSize: 13, marginTop: 12 }}>
            {(scanMutation.error as Error)?.message || 'Scan failed'}
          </p>
        )}
      </div>
    );
  }

  
  if (applyResult) {
    return (
      <div className="cloud-panel" style={{ padding: 24 }}>
        <div className="flex items-center" style={{ gap: 10, marginBottom: 16 }}>
          <Check
            style={{ width: 18, height: 18, color: '#4ade80', strokeWidth: 2 }}
          />
          <h3
            className="cloud-text"
            style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}
          >
            Organization complete
          </h3>
        </div>

        <div
          className="flex flex-col"
          style={{ gap: 6, fontSize: 13, marginBottom: 18 }}
        >
          {applyResult.folders_created.length > 0 && (
            <p style={{ color: '#4ade80', margin: 0 }}>
              Created {applyResult.folders_created.length} new folder
              {applyResult.folders_created.length !== 1 ? 's' : ''}:{' '}
              {applyResult.folders_created.map((f) => f.name).join(', ')}
            </p>
          )}
          <p className="cloud-text" style={{ margin: 0 }}>
            Moved {applyResult.files_moved} file
            {applyResult.files_moved !== 1 ? 's' : ''} into athlete folders.
          </p>
          {applyResult.watched_folders_set > 0 && (
            <p className="cloud-text" style={{ margin: 0 }}>
              Set up {applyResult.watched_folders_set} watched folder
              {applyResult.watched_folders_set !== 1 ? 's' : ''} for automatic
              syncing.
            </p>
          )}
          {applyResult.errors.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <p style={{ color: '#fca5a5', fontWeight: 500, margin: '0 0 4px' }}>
                {applyResult.errors.length} error
                {applyResult.errors.length !== 1 ? 's' : ''}:
              </p>
              {applyResult.errors.map((err, i) => (
                <p
                  key={i}
                  style={{
                    color: '#fca5a5',
                    fontSize: 11,
                    marginLeft: 16,
                    margin: 0,
                  }}
                >
                  {err}
                </p>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => {
            setApplyResult(null);
            setScanResult(null);
          }}
          className="cloud-btn cloud-btn-ghost"
        >
          Done
        </button>
      </div>
    );
  }

  
  const summary = scanResult!.summary;

  return (
    <div className="cloud-panel" style={{ padding: 24 }}>
      {}
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 16 }}
      >
        <div className="flex items-center" style={{ gap: 10 }}>
          <FolderPlus
            style={{ width: 18, height: 18, color: '#fb923c', strokeWidth: 1.8 }}
          />
          <h3
            className="cloud-text"
            style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}
          >
            Drive organization
          </h3>
        </div>
        <button
          onClick={() => {
            setScanResult(null);
            setEditedGroups([]);
          }}
          className="cloud-text-muted"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {}
      <div
        className="flex items-center flex-wrap"
        style={{
          gap: 16,
          marginBottom: 18,
          padding: '10px 14px',
          borderRadius: 8,
          backgroundColor: 'var(--cloud-surface-raised)',
          border: '1px solid var(--cloud-border)',
          fontSize: 13,
        }}
      >
        <span className="cloud-text">{summary.total_sheets} sheets found</span>
        <span style={{ color: '#4ade80', fontWeight: 500 }}>
          {summary.matched_sheets} matched to {summary.matched_athletes} athlete
          {summary.matched_athletes !== 1 ? 's' : ''}
        </span>
        {summary.unrecognized_count > 0 && (
          <span style={{ color: '#fbbf24' }}>
            {summary.unrecognized_count} unrecognized
          </span>
        )}
        {summary.already_organized_count > 0 && (
          <span className="cloud-text-muted">
            {summary.already_organized_count} already in folders
          </span>
        )}
      </div>

      {}
      {editedGroups.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <h4
            className="flex items-center cloud-text-muted"
            style={{ ...MICRO_LABEL, gap: 6, marginBottom: 10 }}
          >
            <Users style={{ width: 12, height: 12 }} />
            Athlete groups
          </h4>
          <div className="flex flex-col" style={{ gap: 6 }}>
            {editedGroups.map((group, index) => (
              <div
                key={index}
                style={{
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: '1px solid var(--cloud-border)',
                }}
              >
                <button
                  onClick={() =>
                    setExpandedGroup(
                      expandedGroup === group.athlete_name
                        ? null
                        : group.athlete_name
                    )
                  }
                  className="flex items-center justify-between"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    fontSize: 13,
                    backgroundColor: 'var(--cloud-surface-raised)',
                    border: 'none',
                    color: 'var(--cloud-text)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div className="flex items-center" style={{ gap: 12 }}>
                    <FolderOpen
                      style={{
                        width: 14,
                        height: 14,
                        color: '#fb923c',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontWeight: 500 }}>{group.athlete_name}</span>
                    <span
                      className="cloud-text-muted"
                      style={{ fontSize: 11 }}
                    >
                      {group.sheets.length} sheet
                      {group.sheets.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <ChevronRight
                    className="cloud-text-muted"
                    style={{
                      width: 14,
                      height: 14,
                      transition: 'transform 0.15s ease',
                      transform:
                        expandedGroup === group.athlete_name
                          ? 'rotate(90deg)'
                          : 'rotate(0deg)',
                    }}
                  />
                </button>
                {expandedGroup === group.athlete_name && (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderTop: '1px solid var(--cloud-border)',
                    }}
                  >
                    {}
                    <div
                      className="flex items-center"
                      style={{ gap: 8, marginBottom: 10 }}
                    >
                      <label
                        className="cloud-text-muted"
                        style={MICRO_LABEL}
                      >
                        Folder
                      </label>
                      <input
                        type="text"
                        value={group.athlete_name}
                        onChange={(e) =>
                          handleRenameGroup(index, e.target.value)
                        }
                        style={{
                          padding: '6px 10px',
                          fontSize: 13,
                          borderRadius: 6,
                          backgroundColor: 'var(--cloud-surface)',
                          border: '1px solid var(--cloud-border)',
                          color: 'var(--cloud-text)',
                          flex: 1,
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div className="flex flex-col" style={{ gap: 4 }}>
                      {group.sheets.map((sheet) => (
                        <div
                          key={sheet.id}
                          className="flex items-center justify-between"
                          style={{ padding: '4px 0', fontSize: 11 }}
                        >
                          <div
                            className="flex items-center"
                            style={{ gap: 8, minWidth: 0 }}
                          >
                            <FileSpreadsheet
                              style={{
                                width: 12,
                                height: 12,
                                color: '#4ade80',
                                flexShrink: 0,
                              }}
                            />
                            <span
                              className="cloud-text"
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {sheet.name}
                            </span>
                          </div>
                          <button
                            onClick={() =>
                              handleRemoveFromGroup(index, sheet.id)
                            }
                            style={{
                              color: '#fca5a5',
                              padding: 4,
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                            title="Remove from group"
                          >
                            <X style={{ width: 12, height: 12 }} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {}
      {scanResult!.unrecognized.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <button
            onClick={() => setShowUnrecognized(!showUnrecognized)}
            className="flex items-center"
            style={{
              gap: 8,
              fontSize: 13,
              color: '#fbbf24',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              marginBottom: 8,
            }}
          >
            <AlertCircle style={{ width: 14, height: 14 }} />
            {scanResult!.unrecognized.length} unrecognized sheet
            {scanResult!.unrecognized.length !== 1 ? 's' : ''} (will stay at root)
            <ChevronRight
              style={{
                width: 12,
                height: 12,
                transition: 'transform 0.15s ease',
                transform: showUnrecognized ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            />
          </button>
          {showUnrecognized && (
            <div
              className="flex flex-col"
              style={{ gap: 4, marginLeft: 22 }}
            >
              {scanResult!.unrecognized.map((sheet) => (
                <div
                  key={sheet.id}
                  className="flex items-center cloud-text-muted"
                  style={{ gap: 8, fontSize: 11 }}
                >
                  <FileSpreadsheet
                    style={{ width: 12, height: 12, flexShrink: 0 }}
                  />
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {sheet.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {}
      {scanResult!.existing_folders.length > 0 && (
        <div
          className="cloud-text-muted"
          style={{ marginBottom: 18, fontSize: 11 }}
        >
          <span>
            {scanResult!.existing_folders.length} existing folder
            {scanResult!.existing_folders.length !== 1 ? 's' : ''} will be
            preserved:{' '}
          </span>
          <span>
            {scanResult!.existing_folders.map((f) => f.name).join(', ')}
          </span>
        </div>
      )}

      {}
      {applyMutation.isPending && progress && (
        <div
          style={{
            marginBottom: 14,
            padding: '12px 14px',
            borderRadius: 8,
            backgroundColor: 'var(--cloud-surface-raised)',
            border: '1px solid var(--cloud-border)',
            fontSize: 13,
          }}
        >
          <div
            className="flex items-center justify-between"
            style={{ gap: 12, marginBottom: 8 }}
          >
            <div className="flex items-center" style={{ gap: 8, minWidth: 0 }}>
              <Loader2
                className="animate-spin"
                style={{
                  width: 14,
                  height: 14,
                  color: '#fb923c',
                  flexShrink: 0,
                }}
              />
              <span className="cloud-text" style={{ fontWeight: 500 }}>
                {progress.total > 0
                  ? `Moving ${progress.completed} of ${progress.total} files`
                  : 'Preparing…'}
              </span>
            </div>
            {progress.total > 0 && (
              <span className="cloud-text-muted" style={{ fontSize: 11 }}>
                {Math.round((progress.completed / progress.total) * 100)}%
              </span>
            )}
          </div>
          {progress.total > 0 && (
            <div
              style={{
                height: 4,
                borderRadius: 2,
                backgroundColor: 'var(--cloud-border)',
                overflow: 'hidden',
                marginBottom: progress.currentFilename ? 8 : 0,
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(
                    100,
                    (progress.completed / progress.total) * 100
                  )}%`,
                  backgroundColor: '#fb923c',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
          )}
          {progress.currentFilename && (
            <div
              className="flex items-center cloud-text-muted"
              style={{ gap: 6, fontSize: 11, minWidth: 0 }}
            >
              <FileSpreadsheet
                style={{
                  width: 11,
                  height: 11,
                  color: '#4ade80',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {progress.currentFilename}
                {progress.currentAthlete ? ` → ${progress.currentAthlete}` : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {}
      <div
        className="flex items-center flex-wrap"
        style={{
          gap: 12,
          paddingTop: 14,
          borderTop: '1px solid var(--cloud-border)',
        }}
      >
        <button
          onClick={() => applyMutation.mutate()}
          disabled={
            applyMutation.isPending ||
            editedGroups.every((g) => g.file_ids.length === 0)
          }
          className="cloud-btn cloud-btn-primary"
        >
          {applyMutation.isPending ? (
            <>
              <Loader2
                className="animate-spin"
                style={{ width: 14, height: 14, marginRight: 8 }}
              />
              Organizing…
            </>
          ) : (
            <>
              <FolderPlus
                style={{ width: 14, height: 14, marginRight: 8 }}
              />
              Create folders &amp; move files
            </>
          )}
        </button>
        <button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="cloud-btn cloud-btn-ghost"
        >
          {scanMutation.isPending && (
            <Loader2
              className="animate-spin"
              style={{ width: 14, height: 14, marginRight: 8 }}
            />
          )}
          Re-scan
        </button>
        {applyMutation.isError && (
          <p style={{ color: '#fca5a5', fontSize: 13, margin: 0 }}>
            {(applyMutation.error as Error)?.message || 'Organization failed'}
          </p>
        )}
      </div>
    </div>
  );
}
