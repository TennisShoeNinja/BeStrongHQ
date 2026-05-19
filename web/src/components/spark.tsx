type SparkTone = "primary" | "success" | "danger" | "warning";

const STROKE: Record<SparkTone, string> = {
  primary: "#7cb4ed",
  success: "#34d399",
  danger: "#f87171",
  warning: "#fbbf24",
};

interface SparkProps {
  points: number[];
  tone?: SparkTone;
  width?: number;
  height?: number;
  strokeWidth?: number;
  className?: string;
  /** fixed [min, max] y-range; when omitted, auto-scales to the data */
  domain?: [number, number];
}

export function Spark({
  points,
  tone = "primary",
  width = 44,
  height = 14,
  strokeWidth = 1.5,
  className,
  domain,
}: SparkProps) {
  if (points.length < 2) return null;
  const min = domain ? domain[0] : Math.min(...points);
  const max = domain ? domain[1] : Math.max(...points);
  const range = max - min || 1;
  const stepX = points.length === 1 ? 0 : width / (points.length - 1);
  const pad = 2;
  const usableH = height - pad * 2;
  const coords = points
    .map((v, i) => {
      const x = i * stepX;
      const clamped = Math.min(max, Math.max(min, v));
      const y = pad + usableH - ((clamped - min) / range) * usableH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      stroke={STROKE[tone]}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <polyline points={coords} />
    </svg>
  );
}
