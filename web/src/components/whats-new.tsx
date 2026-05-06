"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import {
  WHATS_NEW_ENTRIES,
  getLatestEntryId,
  hasUnseenEntries,
  writeLastSeenId,
} from "@/lib/whats-new";

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function WhatsNewButton() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setUnread(hasUnseenEntries());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      const latest = getLatestEntryId();
      if (latest) writeLastSeenId(latest);
      setUnread(false);
    }
  };

  if (WHATS_NEW_ENTRIES.length === 0) return null;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger
        className="cloud-icon-btn"
        title="What's new"
        aria-label={unread ? "What's new (unread)" : "What's new"}
      >
        <Sparkles className="w-4 h-4" />
        {unread && <span className="cloud-icon-dot" />}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="bottom" align="end" sideOffset={8}>
          <PopoverPrimitive.Popup
            className="cloud-panel-raised z-50 w-[360px] origin-[var(--transform-origin)] rounded-xl p-4 text-sm outline-none ring-1 ring-foreground/10 transition-[transform,opacity] duration-150 ease-out data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-top-1 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-top-1"
            style={{
              boxShadow:
                "0 20px 40px -16px rgba(0,0,0,0.6), 0 8px 16px -4px rgba(0,0,0,0.4)",
            }}
          >
            <PopoverPrimitive.Title className="font-heading text-base leading-none font-medium">
              What&apos;s new
            </PopoverPrimitive.Title>
            <PopoverPrimitive.Description className="text-xs cloud-text-muted mt-1">
              Recent changes to BeStrong HQ.
            </PopoverPrimitive.Description>
            <ul className="flex flex-col gap-4 mt-3">
              {WHATS_NEW_ENTRIES.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium cloud-text">
                      {entry.title}
                    </span>
                    <span
                      className="cloud-text-dim shrink-0"
                      style={{ fontSize: 11 }}
                    >
                      {formatDate(entry.date)}
                    </span>
                  </div>
                  <p className="text-xs cloud-text-muted leading-relaxed">
                    {entry.body}
                  </p>
                  {entry.cta && (
                    <Link
                      href={entry.cta.href}
                      onClick={() => setOpen(false)}
                      className="hover:underline self-start mt-1"
                      style={{
                        color: "var(--cloud-primary-text)",
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      {entry.cta.label} →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
