"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Home,
  Users,
  CheckCircle,
  LayoutGrid,
  Inbox,
  Trophy,
  CreditCard,
  HardDrive,
  Settings,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import apiClient from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";

function tabActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavTab({
  href,
  icon: Icon,
  label,
  active,
  badge,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="cloud-bottom-nav-tab"
      data-active={active ? "true" : undefined}
    >
      <span className="cloud-bottom-nav-icon-wrap">
        <Icon className="cloud-bottom-nav-icon" />
        {badge !== undefined && badge > 0 && (
          <span className="cloud-bottom-nav-badge">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span>{label}</span>
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const { features } = useAuth();
  const { data: notificationCount = 0 } = useQuery({
    queryKey: ["notification-count"],
    queryFn: () => apiClient.getNotificationCount(),
    refetchInterval: 30000,
    staleTime: 5000,
    refetchOnWindowFocus: true,
  });

  const showBilling = features.includes("billing");

  return (
    <>
      <nav className="cloud-bottom-nav md:hidden" aria-label="Primary">
        <NavTab
          href="/"
          icon={Home}
          label="Home"
          active={tabActive(pathname, "/")}
        />
        <NavTab
          href="/athletes"
          icon={Users}
          label="Athletes"
          active={tabActive(pathname, "/athletes")}
        />
        <NavTab
          href="/queue"
          icon={CheckCircle}
          label="Queue"
          active={tabActive(pathname, "/queue")}
        />
        <button
          type="button"
          className="cloud-bottom-nav-tab"
          data-active={moreOpen ? "true" : undefined}
          onClick={() => setMoreOpen(true)}
        >
          <span className="cloud-bottom-nav-icon-wrap">
            <LayoutGrid className="cloud-bottom-nav-icon" />
          </span>
          <span>More</span>
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="cloud-more-grid">
            <Link
              href="/inbox"
              onClick={() => setMoreOpen(false)}
              className="cloud-more-item"
            >
              <Inbox className="cloud-more-icon" />
              <span>Inbox</span>
              {notificationCount > 0 && (
                <span className="cloud-more-badge">
                  {notificationCount > 99 ? "99+" : notificationCount}
                </span>
              )}
            </Link>
            <Link
              href="/meets"
              onClick={() => setMoreOpen(false)}
              className="cloud-more-item"
            >
              <Trophy className="cloud-more-icon" />
              <span>Meets</span>
            </Link>
            <Link
              href="/integrations/google-drive"
              onClick={() => setMoreOpen(false)}
              className="cloud-more-item"
            >
              <HardDrive className="cloud-more-icon" />
              <span>Integrations</span>
            </Link>
            <Link
              href="/configuration"
              onClick={() => setMoreOpen(false)}
              className="cloud-more-item"
            >
              <Settings className="cloud-more-icon" />
              <span>Settings</span>
            </Link>
            {showBilling && (
              <Link
                href="/billing"
                onClick={() => setMoreOpen(false)}
                className="cloud-more-item"
              >
                <CreditCard className="cloud-more-icon" />
                <span>Billing</span>
              </Link>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
