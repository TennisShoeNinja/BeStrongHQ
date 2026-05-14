"use client";

import Link from "next/link";
import {
  ClipboardList,
  House,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { useAuth } from "@/lib/auth-provider";

type PortalTab = "home" | "program" | "progression" | "meets";

type PortalSidebarProps = {
  athleteId: number;
  athleteName: string;
  athleteEmail?: string | null;
  lastUpdatedISO?: string | null;
  activeTab: PortalTab;
};

type PortalNavItem = {
  href: string;
  icon: typeof House;
  label: string;
  tab: PortalTab;
};

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "No update yet";

  const updatedAt = new Date(iso).getTime();
  if (Number.isNaN(updatedAt)) return "No update yet";

  const diffMs = Math.max(0, Date.now() - updatedAt);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function PortalSidebar({
  athleteId,
  athleteName,
  athleteEmail,
  lastUpdatedISO,
  activeTab,
}: PortalSidebarProps) {
  const { instance } = useAuth();
  const teamName = instance?.org_name || "BeStrong";

  const navItems: PortalNavItem[] = [
    {
      href: `/athletes/${athleteId}/portal`,
      icon: House,
      label: "Home",
      tab: "home",
    },
    {
      href: `/athletes/${athleteId}/portal/program`,
      icon: ClipboardList,
      label: "Program",
      tab: "program",
    },
    {
      href: `/athletes/${athleteId}/portal/progression`,
      icon: TrendingUp,
      label: "Progression",
      tab: "progression",
    },
    {
      href: `/athletes/${athleteId}/portal/meets`,
      icon: Trophy,
      label: "Meets",
      tab: "meets",
    },
  ];

  return (
    <aside
      className="cloud-sidebar flex h-full min-h-[640px] w-full flex-col overflow-hidden rounded-lg"
      aria-label={`${athleteName} portal navigation`}
    >
      <div className="cloud-sidebar-brand">
        <div className="cloud-brand-name">
          BeStrong<span className="cloud-brand-brace">{"{"}</span>
          <span className="cloud-brand-hq">HQ</span>
          <span className="cloud-brand-brace">{"}"}</span>
        </div>
        <div className="cloud-eyebrow-sm" style={{ marginTop: 6 }}>
          {teamName}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 cloud-thin-scroll">
        <div className="cloud-nav-section">
          <div className="cloud-eyebrow" style={{ padding: "var(--cloud-s2)" }}>
            YOUR TRAINING
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.tab}
                href={item.href}
                className="cloud-nav-item"
                data-active={activeTab === item.tab ? "true" : undefined}
              >
                <Icon
                  className="h-4 w-4 shrink-0 cloud-nav-icon"
                  strokeWidth={1.8}
                />
                <span className="flex-1 text-left">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="cloud-sidebar-footer">
        <p className="cloud-eyebrow-sm" style={{ marginBottom: 4 }}>
          LAST UPDATED
        </p>
        <p className="cloud-text" style={{ margin: 0, fontSize: 13 }}>
          {formatRelativeTime(lastUpdatedISO)}
        </p>
        {athleteEmail && (
          <p
            className="cloud-text-dim truncate"
            style={{ marginTop: 8, fontSize: 12 }}
            title={athleteEmail}
          >
            {athleteEmail}
          </p>
        )}
        <button
          type="button"
          className="cloud-btn cloud-btn-ghost w-full justify-center"
          style={{ marginTop: "var(--cloud-s3)" }}
          disabled
          title="Sign-out lands with athlete auth"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
