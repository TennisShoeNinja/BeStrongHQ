import { describe, expect, it } from "vitest";
import {
  buildLiftSeries,
  prepareProgressionChartRows,
  type ProgressionChartSeries,
} from "./progression";
import type { E1RMDataPoint, ProgramListResponse } from "./types";

function program(
  id: number,
  programNumber: number,
  dateStart: string | null,
): ProgramListResponse {
  return {
    id,
    athlete_id: 1,
    program_number: programNumber,
    program_name: `Block ${programNumber}`,
    date_start: dateStart,
    date_end: null,
    block_type: null,
    google_sheet_url: null,
    imported_at: "2026-01-01T00:00:00Z",
  };
}

function point(
  programId: number,
  programNumber: number,
  e1rm: number,
  isOutlier = false,
): E1RMDataPoint {
  return {
    exercise_name: "Squat",
    canonical_exercise_name: "squat",
    lift_category: "squat",
    weight_lbs: 315,
    reps: 1,
    actual_rpe: 8,
    e1rm,
    week_number: 1,
    day_number: 1,
    program_id: programId,
    program_number: programNumber,
    program_name: `Block ${programNumber}`,
    google_sheet_url: null,
    e1rm_method: "rpe",
    is_outlier: isOutlier,
    outlier_reason: isOutlier ? "Too far above recent work." : null,
    outlier_average: isOutlier ? 405 : null,
    outlier_reference_points: [],
  };
}

describe("progression helpers", () => {
  it("orders undated programs by program sequence instead of epoch", () => {
    const rows = buildLiftSeries(
      [
        point(1, 1, 400),
        point(2, 2, 410),
        point(3, 3, 420),
      ],
      [
        program(1, 1, "2026-01-01"),
        program(2, 2, null),
        program(3, 3, "2026-03-01"),
      ],
      {
        squat: new Set(["squat"]),
        bench: new Set(),
        deadlift: new Set(),
      },
      "block",
    ).rows;

    expect(rows.map((row) => row.label)).toEqual(["P1", "P2", "P3"]);
  });

  it("keeps outlier markers while excluding them from lines and running max", () => {
    const series: ProgressionChartSeries[] = [
      { key: "squat_1", label: "Squat", lift: "squat", color: "#7CB4ED" },
    ];
    const rows = buildLiftSeries(
      [point(1, 1, 400), point(2, 2, 900, true), point(3, 3, 420)],
      [
        program(1, 1, "2026-01-01"),
        program(2, 2, "2026-02-01"),
        program(3, 3, "2026-03-01"),
      ],
      {
        squat: new Set(["squat"]),
        bench: new Set(),
        deadlift: new Set(),
      },
      "block",
    ).rows;
    const actualSeriesKey = Object.keys(rows[0]).find((key) =>
      key.startsWith("squat_"),
    );
    expect(actualSeriesKey).toBeTruthy();

    const prepared = prepareProgressionChartRows(
      rows,
      [{ ...series[0], key: actualSeriesKey as string }],
      {
        excludeOutliersFromLine: true,
        lineValueMode: "runningMax",
      },
    );

    expect(prepared.rows.map((row) => row[actualSeriesKey as string])).toEqual([
      400,
      undefined,
      420,
    ]);
    expect(prepared.outlierMarkers).toHaveLength(1);
    expect(prepared.outlierMarkers[0]).toMatchObject({
      label: "P2",
      value: 900,
    });
  });
});
