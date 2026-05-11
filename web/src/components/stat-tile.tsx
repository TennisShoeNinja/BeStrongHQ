"use client";

import Link from "next/link";
import { Spark } from "@/components/spark";

const MICRO_LABEL: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--cloud-text-muted)",
  fontWeight: 500,
};

const BIG_STAT: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 600,
  letterSpacing: "-0.02em",
  color: "var(--cloud-text)",
  lineHeight: 1.05,
};

interface StatTileProps {
  href?: string;
  label: string;
  value: number | string;
  icon: React.ReactNode;
  iconTint: string;
  sparkPoints?: number[];
  sparkTone?: "primary" | "success" | "danger" | "warning";
}

export function StatTile({
  href,
  label,
  value,
  icon,
  iconTint,
  sparkPoints,
  sparkTone = "primary",
}: StatTileProps) {
  const body = (
    <div
      className="cloud-panel"
      style={{
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        position: "relative",
        transition: "border-color 0.15s, background 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--cloud-border-strong)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--cloud-border)";
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={MICRO_LABEL}>{label}</div>
        <div style={{ ...BIG_STAT, marginTop: 4 }}>{value}</div>
      </div>
      {sparkPoints && sparkPoints.length >= 2 && (
        <div
          style={{
            position: "absolute",
            bottom: 10,
            right: 56,
            opacity: 0.85,
            pointerEvents: "none",
          }}
        >
          <Spark
            points={sparkPoints}
            tone={sparkTone}
            width={64}
            height={18}
            strokeWidth={1.6}
          />
        </div>
      )}
      <div
        style={{
          flexShrink: 0,
          width: 32,
          height: 32,
          borderRadius: 8,
          display: "grid",
          placeItems: "center",
          background: iconTint,
        }}
      >
        {icon}
      </div>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block">
        {body}
      </Link>
    );
  }
  return body;
}

export function StatTileSkeleton() {
  return (
    <div
      className="cloud-panel"
      style={{
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          className="animate-pulse"
          style={{
            height: 10,
            width: 80,
            borderRadius: 2,
            background: "var(--cloud-panel-hover)",
            marginBottom: 6,
          }}
        />
        <div
          className="animate-pulse"
          style={{
            height: 28,
            width: 40,
            borderRadius: 4,
            background: "var(--cloud-panel-hover)",
          }}
        />
      </div>
      <div
        className="animate-pulse"
        style={{
          flexShrink: 0,
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "var(--cloud-panel-hover)",
        }}
      />
    </div>
  );
}
