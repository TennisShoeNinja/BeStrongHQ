import * as Types from "@/lib/types";
import { convertWeight, type WeightUnit } from "@/lib/units";
import { safeHttpUrl } from "@/lib/safe-url";

/**
 * Tabular list of plot-eligible top sets that need a coach's eyes, shared by
 * the Progression-Charts data-quality banner and the per-athlete review page.
 * Renders each issue with its location, set, reason, and a deep link to the
 * source workbook.
 */
export function DataQualityTable({
  title,
  issues,
  unit,
}: {
  title: string;
  issues: Types.DataQualityIssue[];
  unit: WeightUnit;
}) {
  return (
    <div>
      <div
        style={{
          color: "var(--cloud-text-dim)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            textAlign: "left",
            borderCollapse: "collapse",
            fontSize: 12,
          }}
        >
          <thead>
            <tr style={{ color: "var(--cloud-text-dim)" }}>
              {["Where", "Lift", "Set", "Reason", "Source"].map((heading) => (
                <th
                  key={heading}
                  style={{
                    padding: "4px 12px 4px 0",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {issues.map((issue, index) => {
              const where = [
                issue.program_number != null ? `P${issue.program_number}` : null,
                issue.week_number != null ? `W${issue.week_number}` : null,
                issue.day_name ??
                  (issue.day_number != null ? `D${issue.day_number}` : null),
              ]
                .filter(Boolean)
                .join(", ");
              const setDesc =
                issue.weight_lbs != null && issue.reps != null
                  ? `${Math.round(convertWeight(issue.weight_lbs, unit)).toLocaleString("en-US")} ${unit} x ${issue.reps}${
                      issue.actual_rpe != null ? ` @ ${issue.actual_rpe}` : ""
                    }`
                  : "-";
              const sourceUrl = safeHttpUrl(issue.google_sheet_url);
              return (
                <tr
                  key={`${issue.category}-${index}`}
                  style={{
                    borderTop: "1px solid var(--cloud-border)",
                    color: "var(--cloud-text)",
                  }}
                >
                  <td style={{ padding: "5px 12px 5px 0", whiteSpace: "nowrap" }}>
                    {where || "-"}
                  </td>
                  <td style={{ padding: "5px 12px 5px 0" }}>
                    <span style={{ textTransform: "capitalize" }}>
                      {issue.lift_category ?? "-"}
                    </span>
                    {issue.exercise_name && (
                      <span style={{ color: "var(--cloud-text-dim)", marginLeft: 5 }}>
                        ({issue.exercise_name})
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "5px 12px 5px 0", whiteSpace: "nowrap" }}>
                    {setDesc}
                  </td>
                  <td style={{ padding: "5px 12px 5px 0" }}>{issue.reason}</td>
                  <td style={{ padding: "5px 0" }}>
                    {sourceUrl ? (
                      <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "var(--cloud-primary-text)",
                          textDecoration: "none",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Open source
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
