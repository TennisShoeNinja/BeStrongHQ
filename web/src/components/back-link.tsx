"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/**
 * Shared back button used app-wide. Pair with `useBackTarget` from
 * `@/lib/back-nav` to resolve the href/label from the URL's `from` param.
 *
 * Styling matches the original hardcoded athlete-detail back button: a small,
 * muted, chevron-prefixed link that brightens on hover.
 */
export function BackLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`cloud-text-muted hover:text-[color:var(--cloud-text)] ${className ?? ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        background: "none",
        border: 0,
        cursor: "pointer",
        padding: 0,
        textDecoration: "none",
      }}
      aria-label={`Back to ${label}`}
    >
      <ChevronLeft className="w-3.5 h-3.5" />
      {label}
    </Link>
  );
}
