"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Home,
  Inbox,
  Users,
  Trophy,
  CreditCard,
  ChevronDown,
  ChevronRight,
  Menu,
  Calendar,
  HardDrive,
  CheckCircle,
  Shield,
  User,
  SlidersHorizontal,
  Server,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth-provider";
import { DISPLAY_VERSION } from "@/lib/version";

interface SidebarProps {
  notificationCount?: number;
  features?: string[];
}

interface SidebarContentProps {
  notificationCount: number;
  features: string[];
  integrationsOpen: boolean;
  setIntegrationsOpen: (open: boolean) => void;
  configurationOpen: boolean;
  setConfigurationOpen: (open: boolean) => void;
  isActive: (href: string) => boolean;
}

function NavLink({
  href,
  icon: Icon,
  label,
  badge,
  isActive,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: number;
  isActive: (href: string) => boolean;
}) {
  const active = isActive(href);
  return (
    <Link
      href={href}
      className="cloud-nav-item"
      data-active={active ? "true" : undefined}
    >
      <Icon className="w-4 h-4 shrink-0 cloud-nav-icon" />
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="cloud-nav-badge">{badge}</span>
      )}
    </Link>
  );
}

function SidebarContent({
  notificationCount,
  features,
  integrationsOpen,
  setIntegrationsOpen,
  configurationOpen,
  setConfigurationOpen,
  isActive,
}: SidebarContentProps) {
  const { deploymentMode, tenant } = useAuth();
  return (
    <div className="flex flex-col h-full cloud-sidebar">
      {}
      <div className="cloud-sidebar-brand">
        <div className="cloud-brand-name">
          BeStrong<span className="cloud-brand-brace">{"{"}</span>
          <span className="cloud-brand-hq">HQ</span>
          <span className="cloud-brand-brace">{"}"}</span>
        </div>
        {tenant?.org_name && (
          <div className="cloud-brand-sub">{tenant.org_name}</div>
        )}
      </div>

      {}
      <nav className="flex-1 overflow-y-auto px-3 cloud-thin-scroll">
        <div className="cloud-nav-section">
          <div className="cloud-nav-label">Workspace</div>
          <NavLink href="/" icon={Home} label="Home" isActive={isActive} />
          <NavLink
            href="/inbox"
            icon={Inbox}
            label="Inbox"
            badge={notificationCount}
            isActive={isActive}
          />
          <NavLink
            href="/queue"
            icon={CheckCircle}
            label="Work Queue"
            isActive={isActive}
          />
          <NavLink
            href="/athletes"
            icon={Users}
            label="Athletes"
            isActive={isActive}
          />
          <NavLink
            href="/meets"
            icon={Trophy}
            label="Meets"
            isActive={isActive}
          />
          {features.includes("billing") && (
            <NavLink
              href="/billing"
              icon={CreditCard}
              label="Billing"
              isActive={isActive}
            />
          )}
        </div>

        <div className="cloud-nav-section">
          <div className="cloud-nav-label">Data</div>
          <button
            type="button"
            className="cloud-nav-item w-full"
            data-active={integrationsOpen ? "true" : undefined}
            onClick={() => setIntegrationsOpen(!integrationsOpen)}
          >
            {integrationsOpen ? (
              <ChevronDown className="w-4 h-4 shrink-0 cloud-nav-icon" />
            ) : (
              <ChevronRight className="w-4 h-4 shrink-0 cloud-nav-icon" />
            )}
            <span className="flex-1 text-left">Integrations</span>
          </button>

          {integrationsOpen && (
            <div className="ml-5 mt-1 space-y-0.5">
              <Link
                href="/integrations/google-drive"
                className="cloud-nav-item cloud-nav-item-sub"
                data-active={isActive("/integrations/google-drive") ? "true" : undefined}
              >
                <HardDrive className="w-3.5 h-3.5 shrink-0 cloud-nav-icon" />
                <span>Google Drive Sync</span>
              </Link>
              <Link
                href="/integrations/calendar"
                className="cloud-nav-item cloud-nav-item-sub"
                data-active={isActive("/integrations/calendar") ? "true" : undefined}
              >
                <Calendar className="w-3.5 h-3.5 shrink-0 cloud-nav-icon" />
                <span>Google Calendar</span>
              </Link>
              {features.includes("billing") && (
                <Link
                  href="/integrations/stripe"
                  className="cloud-nav-item cloud-nav-item-sub"
                  data-active={isActive("/integrations/stripe") ? "true" : undefined}
                >
                  <CreditCard className="w-3.5 h-3.5 shrink-0 cloud-nav-icon" />
                  <span>Stripe</span>
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="cloud-nav-section">
          <div className="cloud-nav-label">Account</div>
          <button
            type="button"
            className="cloud-nav-item w-full"
            data-active={configurationOpen ? "true" : undefined}
            onClick={() => setConfigurationOpen(!configurationOpen)}
          >
            {configurationOpen ? (
              <ChevronDown className="w-4 h-4 shrink-0 cloud-nav-icon" />
            ) : (
              <ChevronRight className="w-4 h-4 shrink-0 cloud-nav-icon" />
            )}
            <span className="flex-1 text-left">Configuration</span>
          </button>

          {configurationOpen && (
            <div className="ml-5 mt-1 space-y-0.5">
              <Link
                href="/configuration/profile"
                className="cloud-nav-item cloud-nav-item-sub"
                data-active={isActive("/configuration/profile") ? "true" : undefined}
              >
                <User className="w-3.5 h-3.5 shrink-0 cloud-nav-icon" />
                <span>Profile</span>
              </Link>
              <Link
                href="/configuration/features"
                className="cloud-nav-item cloud-nav-item-sub"
                data-active={isActive("/configuration/features") ? "true" : undefined}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 shrink-0 cloud-nav-icon" />
                <span>Features</span>
              </Link>
              {deploymentMode === "cloud" && (
                <Link
                  href="/configuration/access"
                  className="cloud-nav-item cloud-nav-item-sub"
                  data-active={isActive("/configuration/access") ? "true" : undefined}
                >
                  <Shield className="w-3.5 h-3.5 shrink-0 cloud-nav-icon" />
                  <span>Access</span>
                </Link>
              )}
              <Link
                href="/configuration/system"
                className="cloud-nav-item cloud-nav-item-sub"
                data-active={isActive("/configuration/system") ? "true" : undefined}
              >
                <Server className="w-3.5 h-3.5 shrink-0 cloud-nav-icon" />
                <span>System</span>
              </Link>
            </div>
          )}
        </div>
      </nav>

      <div className="cloud-sidebar-footer">
        <p className="text-xs cloud-text-dim">{DISPLAY_VERSION}</p>
      </div>
    </div>
  );
}

export function Sidebar({
  notificationCount = 0,
  features = [],
}: SidebarProps) {
  const pathname = usePathname();
  const [integrationsOpen, setIntegrationsOpen] = useState(
    () => pathname?.startsWith("/integrations") ?? false,
  );
  const [configurationOpen, setConfigurationOpen] = useState(
    () => pathname?.startsWith("/configuration") ?? false,
  );

  const isActive = (href: string) => pathname === href;

  return (
    <>
      {}
      <aside className="hidden md:block w-60 h-screen sticky top-0 z-20">
        <SidebarContent
          notificationCount={notificationCount}
          features={features}
          integrationsOpen={integrationsOpen}
          setIntegrationsOpen={setIntegrationsOpen}
          configurationOpen={configurationOpen}
          setConfigurationOpen={setConfigurationOpen}
          isActive={isActive}
        />
      </aside>

      {}
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger className="fixed top-4 left-4 z-40 inline-flex items-center justify-center rounded-md p-2 cloud-text-hover hover:bg-white/[0.06]">
            <Menu className="w-6 h-6" />
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-60">
            <SidebarContent
              notificationCount={notificationCount}
              features={features}
              integrationsOpen={integrationsOpen}
              setIntegrationsOpen={setIntegrationsOpen}
              configurationOpen={configurationOpen}
              setConfigurationOpen={setConfigurationOpen}
              isActive={isActive}
            />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
