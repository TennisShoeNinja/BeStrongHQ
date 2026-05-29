"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import apiClient from "@/lib/api";

/**
 * Compact pill surfacing how many of an athlete's competition top sets carry
 * an out-of-range RPE (and so aren't counting toward their maxes). Renders
 * nothing when there's nothing to review; otherwise links to the athlete's
 * dedicated review page. Shares the ["rpe-review", id] query cache with it.
 */
export function NeedsReviewPill({ athleteId }: { athleteId: number }) {
  const { data: issues } = useQuery({
    queryKey: ["rpe-review", athleteId],
    queryFn: () => apiClient.getRpeReview(athleteId),
  });

  const count = issues?.length ?? 0;
  if (count === 0) return null;

  return (
    <Link
      href={`/athletes/${athleteId}/review`}
      title={`${count} set${count === 1 ? "" : "s"} with an out-of-range RPE need review`}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors hover:brightness-110"
      style={{
        background: "rgba(245, 158, 11, 0.1)",
        border: "1px solid rgba(245, 158, 11, 0.35)",
        color: "var(--cloud-warning-text)",
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
    >
      <AlertCircle style={{ width: 11, height: 11, strokeWidth: 1.8 }} />
      <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1 }}>Needs Review</span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          lineHeight: 1,
          minWidth: 13,
          textAlign: "center",
          padding: "1px 4px",
          borderRadius: 999,
          background: "rgba(245, 158, 11, 0.22)",
        }}
      >
        {count}
      </span>
    </Link>
  );
}
