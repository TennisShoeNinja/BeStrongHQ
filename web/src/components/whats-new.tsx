"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className="cloud-icon-btn"
        title="What's new"
        aria-label={unread ? "What's new (unread)" : "What's new"}
      >
        <Sparkles className="w-4 h-4" />
        {unread && <span className="cloud-icon-dot" />}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>What&apos;s new</DialogTitle>
        <DialogDescription>Recent changes to BeStrong HQ.</DialogDescription>
        <ul className="flex flex-col gap-4 mt-1">
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
      </DialogContent>
    </Dialog>
  );
}
