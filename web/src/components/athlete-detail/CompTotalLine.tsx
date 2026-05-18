"use client";

import * as Types from "@/lib/types";
import { formatWeight, type WeightUnit } from "@/lib/units";


export function CompTotalLine({
  byLift,
  unit,
}: {
  byLift: Record<string, Types.CompetitionMaxForLift>;
  unit: WeightUnit;
}) {
  const squat = byLift.squat?.weight_lbs ?? null;
  const bench = byLift.bench?.weight_lbs ?? null;
  const deadlift = byLift.deadlift?.weight_lbs ?? null;
  if (squat == null || bench == null || deadlift == null) {
    return (
      <div className="mt-2 pt-2 border-t border-[color:var(--cloud-border)] text-[11px] cloud-text-dim">
        Comp: <span className="italic">log all three lifts</span>
      </div>
    );
  }
  const total = squat + bench + deadlift;
  
  
  const meetKey = (c: Types.CompetitionMaxForLift) =>
    c.meet_id != null ? `id:${c.meet_id}` : `nd:${c.meet_name ?? ""}|${c.meet_date ?? ""}`;
  const sameMeet =
    meetKey(byLift.squat) === meetKey(byLift.bench) &&
    meetKey(byLift.bench) === meetKey(byLift.deadlift);
  const source = sameMeet ? byLift.squat : null;
  const meetLabel = source
    ? source.meet_name
      ? `${source.meet_name}${source.meet_date ? ` · ${source.meet_date}` : ""}`
      : source.meet_date ?? "—"
    : "Best across meets";
  return (
    <div
      className="mt-2 pt-2 border-t border-[color:var(--cloud-border)]"
      title={
        source && source.federation
          ? `${meetLabel} (${source.federation})`
          : meetLabel
      }
    >
      <div className="text-sm font-medium cloud-text-muted">
        Comp: <span className="cloud-text">{formatWeight(total, unit)}</span>
      </div>
      <div className="text-[11px] cloud-text-dim truncate">{meetLabel}</div>
    </div>
  );
}
