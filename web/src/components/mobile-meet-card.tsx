"use client";

import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api";
import { Spark } from "@/components/spark";
import { formatMeetDate, groupMeetResults } from "@/components/athlete-detail/utils";
import { convertWeight, unitLabel, type WeightUnit } from "@/lib/units";
import type * as Types from "@/lib/types";

interface Props {
  athlete: Types.AthleteResponse;
  unit: WeightUnit;
  onOpen: () => void;
}

const SHELL: React.CSSProperties = {
  background: "var(--cloud-panel)",
  border: "1px solid var(--cloud-border)",
  borderRadius: "var(--cloud-r-md)",
  padding: "12px var(--cloud-s3)",
};
const LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--cloud-text-dim)",
};

/** A meet's total: best made attempt per lift, summed. */
function meetTotalLbs(rows: Types.MeetResultEntry[]): number | null {
  const best: Record<string, number> = {};
  for (const r of rows) {
    if (!r.made) continue;
    const cur = best[r.lift];
    if (cur == null || r.weight_lbs > cur) best[r.lift] = r.weight_lbs;
  }
  const total = (best.squat ?? 0) + (best.bench ?? 0) + (best.deadlift ?? 0);
  return total > 0 ? total : null;
}

export function MobileMeetCard({ athlete, unit, onOpen }: Props) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["meet-results", athlete.id],
    queryFn: () => apiClient.listMeetResults(athlete.id),
  });

  const groups = groupMeetResults(rows); // newest-first
  const meets = groups
    .map((g) => ({ g, total: meetTotalLbs(g.rows) }))
    .filter((x): x is { g: (typeof groups)[number]; total: number } =>
      x.total != null,
    );

  const nextMeet = athlete.next_meet_name?.trim() || null;

  if (isLoading) {
    return (
      <div style={{ ...SHELL, height: 84 }}>
        <span style={LABEL}>Meet history</span>
      </div>
    );
  }

  const header = (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={LABEL}>Meet history</span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: nextMeet ? "var(--cloud-text-muted)" : "var(--cloud-text-dim)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "55%",
        }}
      >
        {nextMeet ? `Next: ${nextMeet}` : "No meet scheduled"}
      </span>
    </div>
  );

  if (meets.length === 0) {
    return (
      <div style={SHELL}>
        {header}
        <p
          style={{
            fontSize: 13,
            color: "var(--cloud-text-muted)",
            margin: "6px 0 0",
          }}
        >
          No meets logged yet.
        </p>
      </div>
    );
  }

  const last = meets[0];
  const bestTotal = Math.max(...meets.map((m) => m.total));
  const series = [...meets].reverse().map((m) => m.total); // oldest to newest
  const lastDate = formatMeetDate(last.g.meet_date);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{ ...SHELL, cursor: "pointer" }}
    >
      {header}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginTop: 6,
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            color: "var(--cloud-text)",
          }}
        >
          {Math.round(convertWeight(last.total, unit))}
          <span
            style={{
              fontSize: 11,
              color: "var(--cloud-text-dim)",
              fontWeight: 500,
              marginLeft: 2,
            }}
          >
            {unitLabel(unit)} total
          </span>
        </span>
        {series.length >= 2 && (
          <Spark
            points={series}
            tone="primary"
            width={64}
            height={24}
            strokeWidth={2}
          />
        )}
      </div>

      <p
        style={{
          fontSize: 11,
          color: "var(--cloud-text-muted)",
          margin: "6px 0 0",
        }}
      >
        Best {Math.round(convertWeight(bestTotal, unit))} {unitLabel(unit)}
        {lastDate ? ` · last meet ${lastDate}` : ""}
      </p>
    </div>
  );
}
