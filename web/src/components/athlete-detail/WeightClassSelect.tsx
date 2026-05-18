"use client";

import { useState } from "react";
import { combinedWeightClasses, type AthleteSex } from "@/lib/weight-classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";


export function WeightClassSelect({
  sex,
  customRaw,
  value,
  onChange,
  onAddCustom,
}: {
  sex: AthleteSex;
  customRaw: string | null | undefined;
  value: string | null | undefined;
  onChange: (next: string) => void;
  onAddCustom: (value: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const options = combinedWeightClasses(sex, customRaw, value);

  const commitCustom = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setAdding(false);
      return;
    }
    onAddCustom(trimmed);
    setDraft("");
    setAdding(false);
  };

  if (adding) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitCustom();
            } else if (e.key === "Escape") {
              setAdding(false);
              setDraft("");
            }
          }}
          placeholder="e.g. 67.5 KG"
          style={{
            backgroundColor: "rgba(255,255,255,0.03)",
            borderColor: "var(--cloud-border)",
            color: "var(--cloud-text)",
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={commitCustom}
        >
          Add
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setAdding(false);
            setDraft("");
          }}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <select
      value={value || ""}
      onChange={(e) => {
        if (e.target.value === "__add__") {
          setAdding(true);
          return;
        }
        onChange(e.target.value);
      }}
      style={{
        backgroundColor: "rgba(255,255,255,0.03)",
        borderColor: "var(--cloud-border)",
        color: "var(--cloud-text)",
      }}
      className="border rounded px-3 py-2 text-sm w-full cursor-pointer"
    >
      <option value="">Select weight class</option>
      {options.map((wc) => (
        <option key={wc} value={wc}>
          {wc}
        </option>
      ))}
      <option value="__add__">+ Add custom…</option>
    </select>
  );
}
