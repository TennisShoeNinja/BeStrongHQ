"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, CheckCircle } from "lucide-react";
import apiClient from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import {
  resolveWeightUnit,
  useLocalWeightUnit,
  type WeightUnit,
} from "@/lib/units";
import { DataQualityTable } from "@/components/data-quality-table";
import { EmptyState } from "@/components/empty-state";

export default function AthleteReviewPage() {
  const router = useRouter();
  const params = useParams();
  const athleteId = parseInt(params.id as string, 10);
  const { instance } = useAuth();
  const teamName = instance?.org_name || "BeStrong";

  const localUnit = useLocalWeightUnit();
  const { data: settingsData } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiClient.getSettings(),
    staleTime: 60000,
  });
  const unit: WeightUnit = resolveWeightUnit(localUnit, settingsData?.default_unit);

  const { data: athlete } = useQuery({
    queryKey: ["athlete", athleteId],
    queryFn: () => apiClient.getAthlete(athleteId),
  });

  const {
    data: issues = [],
    isLoading,
  } = useQuery({
    queryKey: ["rpe-review", athleteId],
    queryFn: () => apiClient.getRpeReview(athleteId),
  });

  const count = issues.length;

  return (
    <div style={{ padding: "var(--cloud-s5)" }}>
      <div className="flex flex-col" style={{ gap: "var(--cloud-s4)" }}>
        {/* Header */}
        <div className="flex items-start min-w-0" style={{ gap: "var(--cloud-s3)" }}>
          <button
            type="button"
            onClick={() => router.push(`/athletes/${athleteId}`)}
            className="cloud-icon-btn"
            title="Back to athlete"
            aria-label="Back to athlete"
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
              <span style={{ color: "var(--cloud-text-dim)" }}>
                {athlete?.name ?? "Athlete"}
              </span>
            </p>
            <h1
              className="cloud-text font-semibold"
              style={{ fontSize: 32, letterSpacing: "-0.03em", lineHeight: 1.1 }}
            >
              Needs Review
            </h1>
            <p className="cloud-text-muted" style={{ fontSize: 13, marginTop: 6, maxWidth: 620 }}>
              Competition top sets with an out-of-range RPE entry. These are held
              back from declared maxes, PR history, and estimated maxes until the
              value is corrected. Open the source sheet, fix the RPE, and re-sync
              to clear it.
            </p>
          </div>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="cloud-text-muted" style={{ fontSize: 13 }}>
            Loading flagged sets...
          </div>
        ) : count === 0 ? (
          <EmptyState
            icon={CheckCircle}
            iconTone="success"
            title="Nothing to review"
            body={`No out-of-range RPE entries for ${athlete?.name ?? "this athlete"}.`}
          />
        ) : (
          <div className="cloud-panel" style={{ padding: "var(--cloud-s4)" }}>
            <DataQualityTable
              title={`${count} flagged set${count === 1 ? "" : "s"}`}
              issues={issues}
              unit={unit}
            />
          </div>
        )}
      </div>
    </div>
  );
}
