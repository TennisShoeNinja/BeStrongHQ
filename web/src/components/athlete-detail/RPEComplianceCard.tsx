"use client";

import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api";
import { LIFT_COLORS } from "./utils";


export function RPEComplianceCard({ athleteId }: { athleteId: number }) {
  const { data: rpeData, isLoading } = useQuery({
    queryKey: ["rpe-compliance", athleteId],
    queryFn: () => apiClient.getRPECompliance(athleteId),
  });

  
  
  if (rpeData && rpeData.enabled === false) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
        <div className="cloud-panel-head">
          <h2>RPE Compliance</h2>
        </div>
        <div className="cloud-text-muted" style={{ padding: "var(--cloud-s4)", fontSize: 13 }}>
          Loading RPE compliance data...
        </div>
      </div>
    );
  }

  if (!rpeData || rpeData.total_prescribed === 0) {
    return (
      <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
        <div className="cloud-panel-head">
          <h2>RPE Compliance</h2>
        </div>
        <div className="cloud-text-muted" style={{ padding: "var(--cloud-s4)", fontSize: 13 }}>
          No RPE targets have been prescribed yet.
        </div>
      </div>
    );
  }

  if (rpeData.total_entries === 0) {
    return (
      <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
        <div className="cloud-panel-head">
          <h2>RPE Compliance</h2>
        </div>
        <div style={{ padding: "var(--cloud-s4)" }}>
          <div className="cloud-text-muted" style={{ fontSize: 13, marginBottom: 4 }}>
            {rpeData.total_prescribed} RPE targets prescribed — athlete hasn&apos;t logged actual RPEs yet.
          </div>
          <div className="cloud-text-dim" style={{ fontSize: 12 }}>
            Compliance stats will appear once actual RPEs are recorded.
          </div>
        </div>
      </div>
    );
  }

  
  
  
  const getColorByDiff = (diff: number): string => {
    const absDiff = Math.abs(diff);
    if (absDiff < 0.25) return "#86efac"; 
    if (absDiff < 0.5) return "#93c5fd";  
    if (absDiff < 1.0) return "#fcd34d";  
    return "#fca5a5";                     
  };

  const getStatusByDiff = (diff: number) => {
    const absDiff = Math.abs(diff);
    if (diff > 0) {
      if (absDiff < 0.5) return "slight overshoot";
      if (absDiff < 1.0) return "moderate overshoot";
      return "significant overshoot";
    } else if (diff < 0) {
      if (absDiff < 0.5) return "slight undershoot";
      if (absDiff < 1.0) return "moderate undershoot";
      return "significant undershoot";
    }
    return "on target";
  };

  
  const getConfidenceLabel = (fillRate: number): { label: string; color: string } => {
    if (fillRate >= 70) return { label: "High confidence", color: "#86efac" };
    if (fillRate >= 40) return { label: "Medium confidence", color: "#fcd34d" };
    return { label: "Low confidence", color: "#fca5a5" };
  };

  const confidence = getConfidenceLabel(rpeData.fill_rate_pct);

  const liftOrder = ["squat", "bench", "deadlift"];
  const sortedByLift = [...rpeData.by_lift].sort((a, b) => {
    const aIdx = liftOrder.indexOf(a.lift_category.toLowerCase());
    const bIdx = liftOrder.indexOf(b.lift_category.toLowerCase());
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  return (
    <div className="cloud-panel" style={{ marginBottom: "var(--cloud-s5)" }}>
      <div className="cloud-panel-head">
        <h2>RPE Compliance</h2>
      </div>

      <div className="space-y-6" style={{ padding: "var(--cloud-s4)" }}>
        {}
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid var(--cloud-border)",
            borderRadius: "var(--cloud-r-md)",
            padding: "var(--cloud-s4)",
          }}
        >
          <div className="flex items-baseline justify-between mb-2">
            <span
              className="cloud-text-dim"
              style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}
            >
              Average RPE Difference
            </span>
            <span
              className="font-semibold"
              style={{
                fontSize: 24,
                letterSpacing: "-0.02em",
                color: getColorByDiff(rpeData.avg_rpe_diff),
              }}
            >
              {rpeData.avg_rpe_diff > 0 ? "+" : ""}{rpeData.avg_rpe_diff.toFixed(2)}
            </span>
          </div>
          <p className="cloud-text-muted" style={{ fontSize: 12, marginBottom: 4 }}>
            {rpeData.total_entries} of {rpeData.total_prescribed} prescribed sets logged ({rpeData.fill_rate_pct}% fill rate)
          </p>
          <p className="cloud-text-muted" style={{ fontSize: 12 }}>
            {rpeData.on_target_count} on target, {rpeData.overshoot_count} overshoot, {rpeData.undershoot_count} undershoot
          </p>
          <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
            <div className="cloud-text-muted" style={{ fontSize: 12 }}>
              Tends to {getStatusByDiff(rpeData.avg_rpe_diff)} prescribed RPE targets.
            </div>
            <div className="font-medium" style={{ fontSize: 11, color: confidence.color }}>
              {confidence.label}
            </div>
          </div>
        </div>

        {}
        {sortedByLift.length > 0 && (
          <div className="space-y-2">
            <h3
              className="cloud-text-dim"
              style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}
            >
              By Lift
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {sortedByLift.map((lift) => {
                const liftLower = lift.lift_category.toLowerCase();
                const liftColor = LIFT_COLORS[liftLower] || "var(--cloud-text-dim)";
                const liftConf = getConfidenceLabel(lift.fill_rate_pct);
                return (
                  <div
                    key={lift.lift_category}
                    className="flex items-center justify-between"
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid var(--cloud-border)",
                      borderRadius: "var(--cloud-r-sm)",
                      padding: "var(--cloud-s3)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-2.5 h-2.5 rounded-sm"
                        style={{ backgroundColor: liftColor }}
                      />
                      <div>
                        <div
                          className="font-medium capitalize"
                          style={{ fontSize: 13, color: liftColor }}
                        >
                          {lift.lift_category}
                        </div>
                        <div className="cloud-text-muted" style={{ fontSize: 11 }}>
                          {lift.total_entries}/{lift.total_prescribed} filled &middot; {lift.fill_rate_pct}%
                          <span className="ml-2" style={{ color: liftConf.color }}>{liftConf.label}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className="font-semibold"
                        style={{ fontSize: 14, color: getColorByDiff(lift.avg_rpe_diff) }}
                      >
                        {lift.avg_rpe_diff > 0 ? "+" : ""}{lift.avg_rpe_diff.toFixed(2)}
                      </div>
                      <div className="cloud-text-muted" style={{ fontSize: 11 }}>
                        {getStatusByDiff(lift.avg_rpe_diff)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
