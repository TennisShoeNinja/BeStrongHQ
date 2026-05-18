"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatWeight, type WeightUnit } from "@/lib/units";


export function WeightChangeStat({
  label,
  valueLbs,
  unit,
}: {
  label: string;
  valueLbs: number;
  unit: WeightUnit;
}) {
  const Icon = valueLbs > 0 ? TrendingUp : valueLbs < 0 ? TrendingDown : Minus;
  const sign = valueLbs > 0 ? "+" : valueLbs < 0 ? "−" : "";
  return (
    <div>
      <div
        className="cloud-text-dim mb-0.5"
        style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}
      >
        {label}
      </div>
      <div className="flex items-center gap-1 cloud-text font-semibold" style={{ fontSize: 18, letterSpacing: "-0.01em" }}>
        <Icon className="w-4 h-4" />
        <span>
          {sign}
          {formatWeight(Math.abs(valueLbs), unit, { decimals: 1 })}
        </span>
      </div>
    </div>
  );
}
