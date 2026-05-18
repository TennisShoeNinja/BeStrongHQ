"use client";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import apiClient from "@/lib/api";
import * as Types from "@/lib/types";
import { convertWeight, type WeightUnit } from "@/lib/units";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";


export function UpdateMaxesDialog({
  open,
  onOpenChange,
  athlete,
  unit,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  athlete: Types.AthleteResponse;
  unit: WeightUnit;
  onSaved: () => void;
}) {
  type MaxField = "squat_max_lbs" | "bench_max_lbs" | "deadlift_max_lbs" | "total_lbs";
  const [draft, setDraft] = useState<Record<MaxField, string>>({
    squat_max_lbs: "",
    bench_max_lbs: "",
    deadlift_max_lbs: "",
    total_lbs: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    
    
    const toDisplay = (lbs: number | null | undefined): string => {
      if (lbs == null) return "";
      if (unit === "kg") {
        return String(Math.round(convertWeight(lbs, "kg") * 10) / 10);
      }
      return String(lbs);
    };
    setDraft({
      squat_max_lbs: toDisplay(athlete.squat_max_lbs),
      bench_max_lbs: toDisplay(athlete.bench_max_lbs),
      deadlift_max_lbs: toDisplay(athlete.deadlift_max_lbs),
      total_lbs: toDisplay(athlete.total_lbs),
    });
    setError(null);
  }, [open, athlete, unit]);

  const parseField = (raw: string): number | null | undefined => {
    const trimmed = raw.trim();
    if (trimmed === "") return null; 
    const parsed = parseFloat(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return undefined; 
    return unit === "kg" ? Math.round(parsed * 2.20462 * 10) / 10 : parsed;
  };

  const handleSave = async () => {
    setError(null);
    const payload: Partial<Types.AthleteUpdate> = {};
    const fields: Array<[MaxField, string]> = [
      ["squat_max_lbs", "Squat"],
      ["bench_max_lbs", "Bench"],
      ["deadlift_max_lbs", "Deadlift"],
      ["total_lbs", "Total"],
    ];
    for (const [field, label] of fields) {
      const parsed = parseField(draft[field]);
      if (parsed === undefined) {
        setError(`${label}: enter a positive number or leave blank.`);
        return;
      }
      const currentLbs = athlete[field] ?? null;
      if (parsed === null && currentLbs === null) continue;
      if (parsed !== null && currentLbs !== null && Math.abs(parsed - currentLbs) < 0.05) continue;
      payload[field] = parsed === null ? null : parsed;
    }
    if (Object.keys(payload).length === 0) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      await apiClient.updateAthlete(athlete.id, payload);
      queryClient.invalidateQueries({ queryKey: ["athlete", athlete.id] });
      queryClient.invalidateQueries({ queryKey: ["max-history", athlete.id] });
      queryClient.invalidateQueries({ queryKey: ["estimated-max", athlete.id] });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update maxes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
            Update maxes
          </DialogTitle>
          <DialogDescription className="cloud-text-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
            Manual override for the training maxes shown on the profile.
            Changes are logged to PR History with source &ldquo;manual&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["squat_max_lbs", "Squat"],
              ["bench_max_lbs", "Bench"],
              ["deadlift_max_lbs", "Deadlift"],
              ["total_lbs", "Total"],
            ] as const
          ).map(([field, label]) => (
            <div key={field}>
              <label
                className="cloud-text-dim block"
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontWeight: 500,
                  marginBottom: 6,
                }}
              >
                {label} <span style={{ opacity: 0.6 }}>({unit})</span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={draft[field]}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, [field]: e.target.value }))
                }
                className="cloud-input w-full"
                placeholder="—"
              />
            </div>
          ))}
        </div>

        {error && (
          <div
            className="flex items-start gap-2 rounded-md px-3 py-2"
            style={{
              background: "rgba(220, 38, 38, 0.08)",
              border: "1px solid rgba(220, 38, 38, 0.3)",
              color: "var(--cloud-danger-text)",
              fontSize: 12,
            }}
          >
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter className="!mt-2 !-mx-4 !-mb-4 !p-4 !border-t !bg-transparent" style={{ borderColor: "var(--cloud-border)" }}>
          <button
            type="button"
            className="cloud-btn cloud-btn-ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="cloud-btn cloud-btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save maxes"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
