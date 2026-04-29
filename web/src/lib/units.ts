/**
 * Weight-unit preferences for the UI.
 *
 * The database stores everything in pounds. The UI converts for display
 * based on a per-browser preference, which falls back to a global
 * `default_unit` setting from the backend when unset locally. The
 * preference is read via useSyncExternalStore so it updates live across
 * components and tabs.
 */

import { useSyncExternalStore } from "react";

export type WeightUnit = "lbs" | "kg";

export const LBS_PER_KG = 2.20462;

const LOCAL_KEY = "bestrong.weightUnit";
const CHANGE_EVENT = "bestrong:weightUnitChanged";

export function lbsToKg(lbs: number): number {
  return lbs / LBS_PER_KG;
}

export function kgToLbs(kg: number): number {
  return kg * LBS_PER_KG;
}


export function roundToPlateKg(kg: number): number {
  return Math.round(kg / 2.5) * 2.5;
}
export function roundToPlateLbs(lbs: number): number {
  return Math.round(lbs / 5) * 5;
}

type FormatOpts = {
  
  plate?: boolean;
  
  unitless?: boolean;
  
  decimals?: number;
};


export function convertWeight(lbs: number, unit: WeightUnit): number {
  return unit === "kg" ? lbsToKg(lbs) : lbs;
}


export function formatWeight(
  lbs: number | null | undefined,
  unit: WeightUnit,
  opts: FormatOpts = {}
): string {
  if (lbs == null || !Number.isFinite(lbs)) return "—";
  const raw = convertWeight(lbs, unit);
  const value = opts.plate
    ? unit === "kg"
      ? roundToPlateKg(raw)
      : roundToPlateLbs(raw)
    : Number(raw.toFixed(opts.decimals ?? 0));
  return opts.unitless ? String(value) : `${value} ${unit}`;
}


export function unitLabel(unit: WeightUnit): string {
  return unit;
}


function subscribeToUnit(cb: () => void): () => void {
  if (typeof window === "undefined") return () => { };
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function getUnitSnapshot(): WeightUnit | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(LOCAL_KEY);
  return v === "kg" || v === "lbs" ? v : null;
}
function getUnitSnapshotServer(): WeightUnit | null {
  return null;
}


export function useLocalWeightUnit(): WeightUnit | null {
  return useSyncExternalStore(
    subscribeToUnit,
    getUnitSnapshot,
    getUnitSnapshotServer
  );
}

/**
 * Resolve the effective display unit, given the browser preference and an
 * optional global fallback (typically from the `default_unit` setting).
 * Defaults to "lbs" if nothing is set anywhere.
 */
export function resolveWeightUnit(
  local: WeightUnit | null,
  fallback: string | null | undefined
): WeightUnit {
  if (local) return local;
  if (fallback === "kg" || fallback === "lbs") return fallback;
  return "lbs";
}


export function setWeightUnit(unit: WeightUnit): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_KEY, unit);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Clear the local preference so the global default takes over again. */
export function clearWeightUnit(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LOCAL_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
