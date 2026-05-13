import type { LucideIcon } from "lucide-react";

const ICON_TONE: Record<string, { color: string; bg: string; border: string }> = {
  primary: {
    color: "var(--cloud-primary-text)",
    bg: "rgba(12, 92, 171, 0.18)",
    border: "rgba(12, 92, 171, 0.30)",
  },
  success: {
    color: "var(--cloud-success-text)",
    bg: "rgba(16, 185, 129, 0.12)",
    border: "rgba(16, 185, 129, 0.25)",
  },
  warning: {
    color: "var(--cloud-warning-text)",
    bg: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.25)",
  },
  danger: {
    color: "var(--cloud-danger-text)",
    bg: "rgba(239, 68, 68, 0.12)",
    border: "rgba(239, 68, 68, 0.25)",
  },
  muted: {
    color: "var(--cloud-text-dim)",
    bg: "rgba(255, 255, 255, 0.04)",
    border: "rgba(255, 255, 255, 0.10)",
  },
};

interface EmptyStateProps {
  icon?: LucideIcon;
  iconTone?: keyof typeof ICON_TONE;
  title?: string;
  body: string;
  action?: React.ReactNode;
  compact?: boolean;
  /**
   * If true, the panel picks up a faint brand-blue scrim. Use sparingly:
   * a calm "all caught up" beat usually reads better against the plain
   * cloud-panel surface. Tinting suggests "active" state, not "calm".
   */
  tinted?: boolean;
}

export function EmptyState({
  icon: Icon,
  iconTone = "muted",
  title,
  body,
  action,
  compact = false,
  tinted = false,
}: EmptyStateProps) {
  const tone = ICON_TONE[iconTone];
  return (
    <div
      className={tinted ? "cloud-panel-primary" : "cloud-panel"}
      style={{
        padding: compact ? 16 : 32,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        position: "relative",
      }}
    >
      {Icon && (
        <div
          style={{
            width: compact ? 32 : 44,
            height: compact ? 32 : 44,
            borderRadius: 10,
            background: tone.bg,
            border: `1px solid ${tone.border}`,
            color: tone.color,
            display: "grid",
            placeItems: "center",
            position: "relative",
          }}
        >
          <Icon style={{ width: compact ? 16 : 20, height: compact ? 16 : 20, strokeWidth: 1.8 }} />
        </div>
      )}
      {title && (
        <p
          className="cloud-text"
          style={{
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "-0.005em",
            margin: 0,
            position: "relative",
          }}
        >
          {title}
        </p>
      )}
      <p
        className="cloud-text-muted"
        style={{ fontSize: 13, margin: 0, maxWidth: 360, position: "relative" }}
      >
        {body}
      </p>
      {action && <div style={{ marginTop: 4, position: "relative" }}>{action}</div>}
    </div>
  );
}
