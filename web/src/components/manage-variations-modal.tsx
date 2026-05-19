"use client";


import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2, X } from "lucide-react";

import apiClient from "@/lib/api";
import type { ExerciseAliasGroup } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;

  athleteId: number;
  candidatesByLift: Record<string, string[]>;
}

export function ManageVariationsModal({
  open,
  onClose,
  athleteId,
  candidatesByLift,
}: Props) {
  const queryClient = useQueryClient();
  const groupsQuery = useQuery({
    queryKey: ["exercise-aliases", athleteId],
    queryFn: () => apiClient.listExerciseAliases(athleteId),
    enabled: open,
  });


  // Whether a new merge applies to just this athlete or every athlete.
  const [scope, setScope] = useState<"athlete" | "instance">("athlete");

  
  const liftOrder = useMemo(
    () => Object.keys(candidatesByLift).filter((l) => candidatesByLift[l]?.length),
    [candidatesByLift],
  );
  const [activeLift, setActiveLift] = useState<string>(liftOrder[0] ?? "squat");

  
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [primary, setPrimary] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: ({ primary_name, aliases }: { primary_name: string; aliases: string[] }) =>
      apiClient.createExerciseAlias(
        primary_name,
        aliases,
        scope === "athlete" ? athleteId : undefined,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercise-aliases"] });
      
      queryClient.invalidateQueries({ queryKey: ["e1rm"] });
      queryClient.invalidateQueries({ queryKey: ["prs"] });
      queryClient.invalidateQueries({ queryKey: ["max-history"] });
      queryClient.invalidateQueries({ queryKey: ["pr-events"] });
      setSelected(new Set());
      setPrimary("");
      setError(null);
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e.response?.data?.detail || e.message || "Merge failed");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (aliasId: number) => apiClient.deleteExerciseAlias(aliasId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercise-aliases"] });
      queryClient.invalidateQueries({ queryKey: ["e1rm"] });
      queryClient.invalidateQueries({ queryKey: ["prs"] });
      queryClient.invalidateQueries({ queryKey: ["max-history"] });
      queryClient.invalidateQueries({ queryKey: ["pr-events"] });
    },
  });

  if (!open) return null;

  const candidates = candidatesByLift[activeLift] ?? [];
  
  
  const alreadyAliased = new Set<string>();
  for (const g of groupsQuery.data ?? []) {
    for (const a of g.aliases) alreadyAliased.add(a.alias_name);
  }

  const toggle = (name: string) => {
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    
    if (primary === name && selected.has(name)) setPrimary("");
  };

  const handleMerge = () => {
    setError(null);
    if (selected.size < 2) {
      setError("Select at least two variations to merge.");
      return;
    }
    if (!primary || !selected.has(primary)) {
      setError("Pick which name should be the primary.");
      return;
    }
    const aliases = Array.from(selected).filter((n) => n !== primary);
    createMutation.mutate({ primary_name: primary, aliases });
  };

  const microLabelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="cloud-panel-raised w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
        style={{
          boxShadow: "0 20px 40px -16px rgba(0,0,0,0.6), 0 8px 16px -4px rgba(0,0,0,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--cloud-border)" }}
        >
          <div>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                color: "var(--cloud-text)",
                margin: 0,
              }}
            >
              Manage Variations
            </h2>
            <p
              style={{
                fontSize: 12,
                color: "var(--cloud-text-muted)",
                margin: "4px 0 0",
                lineHeight: 1.45,
              }}
            >
              Merge differently-spelled names into a single lift. Raw names stay
              in the data; only PR tracking and dropdowns fold them. A merge can
              apply to just this athlete or to every athlete.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cloud-btn cloud-btn-ghost"
            style={{ padding: 6, minWidth: 0, height: "auto", flexShrink: 0 }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto cloud-thin-scroll px-6 py-5 space-y-6">
          {}
          <section>
            <h3 style={{ ...microLabelStyle, color: "var(--cloud-text-dim)", marginBottom: 10 }}>
              Existing merges
            </h3>
            {groupsQuery.isLoading ? (
              <div
                className="flex items-center gap-2"
                style={{ fontSize: 12, color: "var(--cloud-text-muted)" }}
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
              </div>
            ) : (groupsQuery.data ?? []).length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--cloud-text-muted)", margin: 0 }}>
                No merges yet. Pick two or more variations below and merge them
                under a primary name.
              </p>
            ) : (
              <div className="space-y-3">
                {(groupsQuery.data ?? []).map((group: ExerciseAliasGroup) => (
                  <div
                    key={group.primary_name}
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid var(--cloud-border)",
                      borderRadius: "var(--cloud-r-sm)",
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "var(--cloud-text)",
                        marginBottom: 6,
                      }}
                    >
                      {group.primary_name}
                    </div>
                    <div className="space-y-1.5">
                      {group.aliases.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between"
                          style={{ fontSize: 12, color: "var(--cloud-text-muted)" }}
                        >
                          <span
                            className="truncate flex-1 min-w-0"
                            title={a.alias_name}
                          >
                            ↳ {a.alias_name}
                          </span>
                          {a.athlete_id == null && (
                            <span
                              className="ml-2 flex-shrink-0"
                              style={{
                                ...microLabelStyle,
                                color: "#93c5fd",
                              }}
                            >
                              all athletes
                            </span>
                          )}
                          <button
                            onClick={() => deleteMutation.mutate(a.id)}
                            disabled={deleteMutation.isPending}
                            aria-label={`Un-merge ${a.alias_name}`}
                            className="ml-2 flex-shrink-0 transition-colors"
                            style={{ color: "var(--cloud-text-dim)" }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = "#fca5a5";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = "var(--cloud-text-dim)";
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {}
          <section>
            <h3 style={{ ...microLabelStyle, color: "var(--cloud-text-dim)", marginBottom: 10 }}>
              Merge new variations
            </h3>

            {}
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span style={{ fontSize: 11, color: "var(--cloud-text-muted)" }}>
                Apply merge to
              </span>
              <div className="flex gap-2">
                {(
                  [
                    ["athlete", "This athlete"],
                    ["instance", "All athletes"],
                  ] as const
                ).map(([value, label]) => {
                  const isActive = scope === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setScope(value)}
                      className="transition-colors"
                      style={{
                        padding: "5px 11px",
                        borderRadius: "var(--cloud-r-sm)",
                        fontSize: 12,
                        fontWeight: 500,
                        border: "1px solid",
                        borderColor: isActive
                          ? "rgba(12, 92, 171, 0.4)"
                          : "var(--cloud-border)",
                        background: isActive
                          ? "rgba(12, 92, 171, 0.18)"
                          : "transparent",
                        color: isActive ? "#93c5fd" : "var(--cloud-text-muted)",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {}
            <div className="flex gap-2 mb-3 flex-wrap">
              {liftOrder.map((lift) => {
                const isActive = activeLift === lift;
                return (
                  <button
                    key={lift}
                    onClick={() => setActiveLift(lift)}
                    className="capitalize transition-colors"
                    style={{
                      padding: "6px 12px",
                      borderRadius: "var(--cloud-r-sm)",
                      fontSize: 12,
                      fontWeight: 500,
                      border: "1px solid",
                      borderColor: isActive
                        ? "rgba(12, 92, 171, 0.4)"
                        : "var(--cloud-border)",
                      background: isActive
                        ? "rgba(12, 92, 171, 0.18)"
                        : "transparent",
                      color: isActive ? "#93c5fd" : "var(--cloud-text-muted)",
                    }}
                  >
                    {lift}
                  </button>
                );
              })}
            </div>

            {candidates.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--cloud-text-muted)", margin: 0 }}>
                No logged variations for {activeLift}.
              </p>
            ) : (
              <div
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid var(--cloud-border)",
                  borderRadius: "var(--cloud-r-sm)",
                  overflow: "hidden",
                }}
              >
                {candidates.map((name, idx) => {
                  const checked = selected.has(name);
                  const isAliased = alreadyAliased.has(name);
                  return (
                    <label
                      key={name}
                      className="flex items-center gap-3 transition-colors"
                      style={{
                        padding: "8px 12px",
                        fontSize: 13,
                        color: "var(--cloud-text)",
                        borderTop: idx === 0 ? "none" : "1px solid var(--cloud-border)",
                        cursor: isAliased ? "default" : "pointer",
                        opacity: isAliased ? 0.5 : 1,
                        background: checked ? "rgba(12, 92, 171, 0.1)" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!isAliased && !checked) {
                          e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isAliased && !checked) {
                          e.currentTarget.style.background = "transparent";
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isAliased}
                        onChange={() => toggle(name)}
                        className="cursor-pointer"
                      />
                      <span className="flex-1 truncate" title={name}>
                        {name}
                      </span>
                      {checked && (
                        <label
                          className="flex items-center gap-1 cursor-pointer"
                          style={{
                            fontSize: 11,
                            color: "var(--cloud-text-muted)",
                          }}
                        >
                          <input
                            type="radio"
                            name="primary-picker"
                            checked={primary === name}
                            onChange={() => setPrimary(name)}
                            className="cursor-pointer"
                          />
                          primary
                        </label>
                      )}
                      {isAliased && (
                        <span
                          style={{
                            ...microLabelStyle,
                            color: "#fcd34d",
                          }}
                        >
                          already merged
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}

            {error && (
              <p style={{ fontSize: 12, color: "#fca5a5", marginTop: 10, margin: "10px 0 0" }}>
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 mt-4">
              <span
                className="mr-auto"
                style={{ fontSize: 11, color: "var(--cloud-text-muted)" }}
              >
                {selected.size > 0
                  ? `${selected.size} selected${primary ? `, primary: "${primary}"` : ""}`
                  : "Pick two or more, then choose the primary."}
              </span>
              <button
                type="button"
                className="cloud-btn cloud-btn-ghost"
                onClick={() => {
                  setSelected(new Set());
                  setPrimary("");
                  setError(null);
                }}
                disabled={selected.size === 0}
              >
                Clear
              </button>
              <button
                type="button"
                className="cloud-btn cloud-btn-primary"
                onClick={handleMerge}
                disabled={createMutation.isPending || selected.size < 2 || !primary}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Merging…
                  </>
                ) : (
                  "Merge selected"
                )}
              </button>
            </div>
          </section>
        </div>

        <div
          className="flex justify-end px-6 py-3"
          style={{ borderTop: "1px solid var(--cloud-border)" }}
        >
          <button type="button" className="cloud-btn cloud-btn-ghost" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
