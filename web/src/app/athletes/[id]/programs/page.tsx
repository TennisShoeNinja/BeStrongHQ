"use client";

import { useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api";
import { resolveWeightUnit, useLocalWeightUnit, type WeightUnit } from "@/lib/units";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { ArrowUpDown, Search, FileText } from "lucide-react";
import { ProgramSection } from "@/components/athlete-detail/ProgramSection";
import type { HighlightedExercise } from "@/components/athlete-detail/utils";

export default function AthleteProgramsPage() {
  const router = useRouter();
  const params = useParams();
  const athleteId = parseInt(params.id as string, 10);

  const [programSearch, setProgramSearch] = useState("");
  const [programSortNewest, setProgramSortNewest] = useState(true);

  // Deep-link target block from a "#block-<programId>" hash (e.g. an inbox
  // "RPE needs review" flag). Read once on mount via lazy init; the matching
  // ProgramSection opens and scrolls itself into view.
  const [targetBlockId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const match = window.location.hash.match(/^#block-(\d+)$/);
    return match ? Number(match[1]) : null;
  });

  const { data: settingsData } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiClient.getSettings(),
    staleTime: 60000,
  });

  const localUnit = useLocalWeightUnit();
  const unit: WeightUnit = resolveWeightUnit(localUnit, settingsData?.default_unit);

  const { data: athlete } = useQuery({
    queryKey: ["athlete", athleteId],
    queryFn: () => apiClient.getAthlete(athleteId),
  });

  const { data: programs = [], isLoading: programsLoading } = useQuery({
    queryKey: ["athlete-programs", athleteId],
    queryFn: () => apiClient.listPrograms(athleteId),
    enabled: !!athlete,
  });

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

  // Clicking an exercise navigates to the Overview tab with the highlight
  // encoded in the URL; the Overview page seeds ProgressionPanel from it.
  const handleHighlightExercise = (hl: HighlightedExercise) => {
    router.push(
      `/athletes/${athleteId}?highlight=${encodeURIComponent(JSON.stringify(hl))}`,
    );
  };

  return (
    <div className="cloud-panel">
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
                  onHighlightExercise={handleHighlightExercise}
                  autoOpen={program.id === targetBlockId}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
