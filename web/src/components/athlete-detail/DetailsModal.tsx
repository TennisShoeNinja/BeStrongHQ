"use client";

import { type ReactNode } from "react";
import * as Types from "@/lib/types";
import { ageFromDob, normalizeDateForInput } from "@/lib/weight-classes";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";


export function DetailsModal({
  open,
  onOpenChange,
  athlete,
  onEditProfile,
  onOpenMeet,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  athlete: Types.AthleteResponse;
  onEditProfile: () => void;
  onOpenMeet: (meetId: number) => void;
}) {
  const age = ageFromDob(athlete.dob) ?? athlete.age ?? null;
  const sexLabel =
    athlete.sex === "M" ? "Men's" : athlete.sex === "F" ? "Women's" : null;

  const row = (label: string, value: ReactNode) => (
    <div
      className="grid grid-cols-[104px_1fr] gap-4 py-2 border-b last:border-0"
      style={{ borderColor: "var(--cloud-border)" }}
    >
      <div
        className="cloud-text-dim pt-0.5"
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div className="cloud-text" style={{ fontSize: 13 }}>
        {value ?? <span className="cloud-text-dim">—</span>}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!bg-[var(--cloud-surface-raised)] !border !border-[var(--cloud-border-strong)] max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
            Details
          </DialogTitle>
          <DialogDescription className="cloud-text-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
            Reference info for {athlete.name}. Tap &ldquo;Edit profile&rdquo;
            to make changes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-0">
          {row("Name", athlete.name)}
          {row(
            "Age",
            age != null ? (
              <span>
                {age}
                {athlete.dob ? (
                  <span className="cloud-text-dim ml-2">
                    (DOB {normalizeDateForInput(athlete.dob) || athlete.dob})
                  </span>
                ) : null}
              </span>
            ) : null
          )}
          {row("Sex", sexLabel)}
          {row(
            "Weight class",
            athlete.weight_class ? (
              <span>
                {sexLabel ? (
                  <span className="cloud-text-dim">{sexLabel} </span>
                ) : null}
                {athlete.weight_class}
              </span>
            ) : null
          )}
          {row("Division", athlete.division)}
          {row(
            "Email",
            athlete.email ? (
              <a href={`mailto:${athlete.email}`} className="text-orange-500 hover:text-orange-400 underline">
                {athlete.email}
              </a>
            ) : null
          )}
          {row(
            "Phone",
            athlete.phone ? (
              <a href={`tel:${athlete.phone}`} className="text-orange-500 hover:text-orange-400 underline">
                {athlete.phone}
              </a>
            ) : null
          )}
          {row(
            "Goal",
            athlete.goal ? (
              <span className="whitespace-pre-wrap">{athlete.goal}</span>
            ) : null
          )}
          {row(
            "Availability",
            athlete.out_from || athlete.out_through ? (
              <span>
                {athlete.out_from || "?"} &rarr; {athlete.out_through || "?"}
                {athlete.availability_status ? (
                  <span className="cloud-text-dim ml-2">
                    ({athlete.availability_status})
                  </span>
                ) : null}
              </span>
            ) : null
          )}
          {row(
            "Next meet",
            athlete.next_meet_id && athlete.next_meet_name ? (
              <button
                onClick={() => {
                  onOpenMeet(athlete.next_meet_id as number);
                  onOpenChange(false);
                }}
                className="text-orange-500 hover:text-orange-400 underline"
              >
                {athlete.next_meet_name}
                {athlete.meet_date ? (
                  <span className="cloud-text-dim ml-2">
                    · {athlete.meet_date}
                  </span>
                ) : null}
              </button>
            ) : null
          )}
        </div>

        <DialogFooter className="!mt-2 !-mx-4 !-mb-4 !p-4 !border-t !bg-transparent" style={{ borderColor: "var(--cloud-border)" }}>
          <button
            type="button"
            className="cloud-btn cloud-btn-ghost"
            onClick={() => onOpenChange(false)}
          >
            Close
          </button>
          <button
            type="button"
            className="cloud-btn cloud-btn-primary"
            onClick={() => {
              onOpenChange(false);
              onEditProfile();
            }}
          >
            Edit profile
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
