"use client";

import * as Types from "@/lib/types";
import { formatWeight, type WeightUnit } from "@/lib/units";


export function CompMaxLine({
  cm,
  unit,
}: {
  cm: Types.CompetitionMaxForLift | undefined;
  unit: WeightUnit;
}) {
  if (!cm) return null;
  if (cm.weight_lbs == null) {
    return (
      <div className="mt-2 pt-2 border-t border-[color:var(--cloud-border)] text-[11px] cloud-text-dim">
        Comp: <span className="italic">no results</span>
      </div>
    );
  }
  const meetLabel = cm.meet_name
    ? `${cm.meet_name}${cm.meet_date ? ` · ${cm.meet_date}` : ""}`
    : cm.meet_date ?? "—";
  return (
    <div
      className="mt-2 pt-2 border-t border-[color:var(--cloud-border)]"
      title={cm.federation ? `${meetLabel} (${cm.federation})` : meetLabel}
    >
      <div className="text-sm font-medium cloud-text-muted">
        Comp: <span className="cloud-text">{formatWeight(cm.weight_lbs, unit)}</span>
      </div>
      <div className="text-[11px] cloud-text-dim truncate">{meetLabel}</div>
    </div>
  );
}
