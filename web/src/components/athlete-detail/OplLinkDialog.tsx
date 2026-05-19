"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, X, Search, ExternalLink } from "lucide-react";
import apiClient from "@/lib/api";
import * as Types from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";


// OPL link dialog - single entry point for the OpenPowerlifting integration.
// Coaches open it from the three-dot menu. Renders the search-and-pick flow
// when no profile is linked, or the linked-state metadata + refresh/unlink
// actions when one is. The actual meets land in meet_results on the server,
// so on success this dialog only invalidates the meet-results query for the
// athlete and the linked component reflects the new rows automatically.
export function OplLinkDialog({
  open,
  onOpenChange,
  athleteId,
  athleteName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  athleteId: number;
  athleteName: string | null | undefined;
}) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchSubmitted, setSearchSubmitted] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const statusQuery = useQuery<Types.OplStatusResponse>({
    queryKey: ["opl", "status", athleteId],
    queryFn: () => apiClient.getOpenPowerliftingStatus(athleteId),
    enabled: open,
  });

  // Prefill the search field with the athlete's name when the dialog opens
  // for an unlinked athlete, and auto-submit so the candidate list shows up
  // without an extra click. Adjusted during render (per React docs) instead
  // of in an effect to avoid cascading renders.
  const linkedSlug = statusQuery.data?.linked === true ? statusQuery.data.link?.slug : null;
  const isNotApplicable = statusQuery.data?.not_applicable === true && !linkedSlug;
  const seedKey = open && !linkedSlug && !isNotApplicable ? (athleteName ?? "").trim() : "";
  const [seededFor, setSeededFor] = useState("");
  if (seedKey && seedKey !== seededFor) {
    setSeededFor(seedKey);
    setSearchTerm((prev) => prev || seedKey);
    setSearchSubmitted((prev) => prev || seedKey);
  }

  const searchQuery = useQuery({
    queryKey: ["opl", "search", searchSubmitted],
    queryFn: () => apiClient.searchOpenPowerlifting(searchSubmitted),
    enabled: open && !isNotApplicable && searchSubmitted.length >= 2,
  });

  const invalidateAthlete = () => {
    queryClient.invalidateQueries({ queryKey: ["opl", "status", athleteId] });
    queryClient.invalidateQueries({ queryKey: ["opl-coverage"] });
    queryClient.invalidateQueries({ queryKey: ["meet-results", athleteId] });
    queryClient.invalidateQueries({ queryKey: ["competition-maxes", athleteId] });
    queryClient.invalidateQueries({ queryKey: ["athlete", athleteId] });
  };

  const linkMutation = useMutation({
    mutationFn: ({ slug, displayName }: { slug: string; displayName?: string }) =>
      apiClient.linkOpenPowerlifting(athleteId, slug, displayName),
    onSuccess: () => {
      setActionError(null);
      invalidateAthlete();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to link profile.";
      setActionError(msg);
    },
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiClient.refreshOpenPowerlifting(athleteId),
    onSuccess: () => {
      setActionError(null);
      invalidateAthlete();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to refresh.";
      setActionError(msg);
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: () => apiClient.unlinkOpenPowerlifting(athleteId),
    onSuccess: () => {
      setActionError(null);
      setSearchTerm("");
      setSearchSubmitted("");
      invalidateAthlete();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to unlink.";
      setActionError(msg);
    },
  });

  const notApplicableMutation = useMutation({
    mutationFn: (value: boolean) =>
      apiClient.setOplNotApplicable(athleteId, value),
    onSuccess: (data) => {
      setActionError(null);
      queryClient.setQueryData(["opl", "status", athleteId], data);
      invalidateAthlete();
      if (data.not_applicable) {
        onOpenChange(false);
      }
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof Error
          ? e.message
          : "Failed to update OpenPowerlifting status.";
      setActionError(msg);
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setSearchSubmitted(searchTerm.trim());
  };

  const handlePick = (c: Types.OplCandidate) => {
    setActionError(null);
    linkMutation.mutate({ slug: c.slug, displayName: c.name });
  };

  const handleUnlink = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Remove the OpenPowerlifting link and clear imported meet rows?"
      )
    ) {
      return;
    }
    setActionError(null);
    unlinkMutation.mutate();
  };

  const status = statusQuery.data;
  const linked = status?.linked === true && status.link;
  const link = status?.link;
  const notApplicable = status?.not_applicable === true && !linked;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] max-w-lg">
        <DialogHeader>
          <DialogTitle style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
            OpenPowerlifting profile
          </DialogTitle>
          <DialogDescription className="cloud-text-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
            {linked
              ? "Linked. Refreshing pulls the latest meet history; unlinking removes the imported rows from this athlete's meet history."
              : notApplicable
                ? "This athlete is marked as not on OpenPowerlifting. Clear the mark if you want to search for a profile."
              : "Search OpenPowerlifting by name, then pick the right lifter. Their meet history will appear under Meet History on this profile."}
          </DialogDescription>
        </DialogHeader>

        {actionError && (
          <div
            className="cloud-panel"
            style={{
              padding: 10,
              borderColor: "rgba(248, 113, 113, 0.3)",
              color: "var(--cloud-danger-text)",
              fontSize: 12,
            }}
          >
            {actionError}
          </div>
        )}

        {statusQuery.isLoading ? (
          <p className="cloud-text-muted" style={{ fontSize: 13 }}>Loading…</p>
        ) : linked && link ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="cloud-panel" style={{ padding: 14 }}>
              <div className="cloud-text" style={{ fontSize: 14, fontWeight: 600 }}>
                {link.display_name || athleteName || link.slug}
              </div>
              <a
                href={link.profile_url}
                target="_blank"
                rel="noopener noreferrer"
                className="cloud-text-muted"
                style={{
                  fontSize: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 4,
                }}
              >
                openpowerlifting.org/u/{link.slug}
                <ExternalLink style={{ width: 12, height: 12 }} />
              </a>
              <div className="cloud-text-dim" style={{ fontSize: 11, marginTop: 6 }}>
                Last synced:{" "}
                {link.last_synced_at
                  ? new Date(link.last_synced_at).toLocaleString()
                  : "Never"}
                {link.last_sync_error && (
                  <span style={{ color: "#f87171" }}> · {link.last_sync_error}</span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="cloud-btn cloud-btn-ghost"
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending || unlinkMutation.isPending}
              >
                <RefreshCw style={{ width: 14, height: 14, marginRight: 6 }} />
                {refreshMutation.isPending ? "Refreshing…" : "Refresh now"}
              </button>
              <button
                type="button"
                className="cloud-btn cloud-btn-ghost"
                onClick={handleUnlink}
                disabled={refreshMutation.isPending || unlinkMutation.isPending}
              >
                <X style={{ width: 14, height: 14, marginRight: 6 }} />
                {unlinkMutation.isPending ? "Unlinking…" : "Unlink"}
              </button>
            </div>
          </div>
        ) : notApplicable ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="cloud-panel" style={{ padding: 14 }}>
              <div className="cloud-text" style={{ fontSize: 14, fontWeight: 600 }}>
                Marked as not on OpenPowerlifting
              </div>
              <p className="cloud-text-muted" style={{ fontSize: 12, lineHeight: 1.55, marginTop: 6 }}>
                This athlete is out of the OPL linking queue. You can clear the mark and search again if that changes.
              </p>
            </div>
            <button
              type="button"
              className="cloud-btn cloud-btn-primary"
              onClick={() => notApplicableMutation.mutate(false)}
              disabled={notApplicableMutation.isPending}
              style={{ alignSelf: "flex-start" }}
            >
              <Search style={{ width: 14, height: 14, marginRight: 6 }} />
              {notApplicableMutation.isPending
                ? "Clearing..."
                : "This athlete is on OpenPowerlifting"}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <form
              onSubmit={handleSearch}
              style={{ display: "flex", gap: 8, alignItems: "center" }}
            >
              <input
                type="text"
                placeholder="e.g. Brandon Lilly"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="cloud-input"
                style={{ flex: 1 }}
              />
              <button
                type="submit"
                className="cloud-btn cloud-btn-primary"
                disabled={searchTerm.trim().length < 2 || linkMutation.isPending}
              >
                <Search style={{ width: 14, height: 14, marginRight: 6 }} />
                Search
              </button>
            </form>

            {searchQuery.isFetching && (
              <p className="cloud-text-muted" style={{ fontSize: 12 }}>Searching…</p>
            )}

            {searchQuery.data && !searchQuery.isFetching && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
                {searchQuery.data.candidates.length === 0 ? (
                  <p className="cloud-text-muted" style={{ fontSize: 12 }}>
                    No lifters matched &ldquo;{searchSubmitted}&rdquo;.
                  </p>
                ) : (
                  searchQuery.data.candidates.map((c) => {
                    const meta = [
                      c.federation,
                      c.state || c.country,
                      c.equipment,
                      c.weight_class_lbs ? `${c.weight_class_lbs} lbs` : null,
                      c.last_meet_date ? `last: ${c.last_meet_date}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <div
                        key={c.slug}
                        className="cloud-panel"
                        style={{
                          padding: 10,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div className="cloud-text" style={{ fontWeight: 600, fontSize: 13 }}>
                            {c.name}
                          </div>
                          <div
                            className="cloud-text-muted"
                            style={{
                              fontSize: 11,
                              marginTop: 2,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {meta || c.slug}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          {c.best_total_lbs != null && (
                            <span
                              className="cloud-text-muted"
                              style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
                            >
                              {Math.round(c.best_total_lbs)} lbs
                            </span>
                          )}
                          <button
                            type="button"
                            className="cloud-btn cloud-btn-primary"
                            style={{ padding: "4px 10px", fontSize: 12 }}
                            disabled={linkMutation.isPending}
                            onClick={() => handlePick(c)}
                          >
                            {linkMutation.isPending ? "Linking…" : "Link"}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            <div
              className="cloud-panel"
              style={{
                padding: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div className="cloud-text" style={{ fontSize: 13, fontWeight: 600 }}>
                  Not on OpenPowerlifting
                </div>
                <div className="cloud-text-muted" style={{ fontSize: 12, lineHeight: 1.45, marginTop: 2 }}>
                  Mark this athlete as N/A so they stop showing up in OPL coverage.
                </div>
              </div>
              <button
                type="button"
                className="cloud-btn cloud-btn-ghost cloud-btn-sm"
                disabled={notApplicableMutation.isPending || linkMutation.isPending}
                onClick={() => notApplicableMutation.mutate(true)}
              >
                <X style={{ width: 12, height: 12, marginRight: 4 }} />
                {notApplicableMutation.isPending ? "Marking..." : "Mark N/A"}
              </button>
            </div>
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            className="cloud-btn cloud-btn-ghost"
            onClick={() => onOpenChange(false)}
          >
            Close
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
