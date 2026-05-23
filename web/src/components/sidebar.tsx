"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Home,
  Inbox,
  Users,
  Trophy,
  CreditCard,
  ChevronDown,
  ChevronRight,
  Calendar,
  HardDrive,
  CheckCircle,
  Shield,
  User,
  SlidersHorizontal,
  Server,
  Plug,
  Settings2,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth-provider";
import { DISPLAY_VERSION } from "@/lib/version";
import {
  ACCOUNT_EXTRAS,
  CONFIGURATION_EXTRAS,
  DATA_INTEGRATION_EXTRAS,
  SidebarExtra,
  WORKSPACE_EXTRAS,
} from "@/config/sidebar-config";

const COLLAPSE_KEY = "bs-sidebar-collapsed";

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

// Wraps a collapsed-rail item in a tooltip so its label is still discoverable.
function RailTip({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  if (!collapsed) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger render={children as React.ReactElement} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function ExtraItem({
  item,
  features,
  isActive,
}: {
  item: SidebarExtra;
  features: string[];
  isActive: (href: string) => boolean;
}) {
  if (item.feature && !features.includes(item.feature)) return null;
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="cloud-nav-item cloud-nav-item-sub"
      data-active={isActive(item.href) ? "true" : undefined}
    >
      <Icon className="w-3.5 h-3.5 shrink-0 cloud-nav-icon" />
      <span>{item.label}</span>
    </Link>
  );
}


function ExtraTopLevelItem({
  item,
  features,
  isActive,
  collapsed,
}: {
  item: SidebarExtra;
  features: string[];
  isActive: (href: string) => boolean;
  collapsed: boolean;
}) {
  if (item.feature && !features.includes(item.feature)) return null;
  const Icon = item.icon;
  const active = isActive(item.href);
  return (
    <RailTip label={item.label} collapsed={collapsed}>
      <Link
        href={item.href}
        className="cloud-nav-item"
        data-active={active ? "true" : undefined}
        aria-label={collapsed ? item.label : undefined}
      >
        <Icon className="w-4 h-4 shrink-0 cloud-nav-icon" />
        {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
      </Link>
    </RailTip>
  );
}

interface SidebarProps {
  notificationCount?: number;
  features?: string[];
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}

interface SidebarContentProps {
  notificationCount: number;
  features: string[];
  integrationsOpen: boolean;
  setIntegrationsOpen: (open: boolean) => void;
  configurationOpen: boolean;
  setConfigurationOpen: (open: boolean) => void;
  isActive: (href: string) => boolean;
  isSectionActive: (prefix: string) => boolean;
  collapsed: boolean;
  onToggleCollapse?: () => void;
}

function NavLink({
  href,
  icon: Icon,
  label,
  badge,
  isActive,
  collapsed,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: number;
  isActive: (href: string) => boolean;
  collapsed: boolean;
}) {
  const active = isActive(href);
  const showBadge = badge !== undefined && badge > 0;
  return (
    <RailTip label={label} collapsed={collapsed}>
      <Link
        href={href}
        className="cloud-nav-item"
        data-active={active ? "true" : undefined}
        aria-label={collapsed ? label : undefined}
      >
        <Icon className="w-4 h-4 shrink-0 cloud-nav-icon" />
        {!collapsed && <span className="flex-1 text-left">{label}</span>}
        {!collapsed && showBadge && (
          <span className="cloud-nav-badge">{badge}</span>
        )}
        {collapsed && showBadge && <span className="cloud-nav-dot" aria-hidden />}
      </Link>
    </RailTip>
  );
}

// A collapsed-rail stand-in for an expandable section: a single icon button
// that re-expands the sidebar and opens the section.
function RailSectionButton({
  icon: Icon,
  label,
  active,
  onActivate,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onActivate: () => void;
}) {
  return (
    <RailTip label={label} collapsed>
      <button
        type="button"
        className="cloud-nav-item w-full"
        data-active={active ? "true" : undefined}
        onClick={onActivate}
        aria-label={label}
      >
        <Icon className="w-4 h-4 shrink-0 cloud-nav-icon" />
      </button>
    </RailTip>
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
  isSectionActive,
  collapsed,
  onToggleCollapse,
}: SidebarContentProps) {
  const { deploymentMode, instance } = useAuth();

  // In the collapsed rail, expandable sections re-expand the sidebar and open.
  const expandInto = (open: (value: boolean) => void) => {
    open(true);
    onToggleCollapse?.();
  };

  return (
    <TooltipProvider delay={200} closeDelay={0}>
      <div
        className="flex flex-col h-full cloud-sidebar"
        data-collapsed={collapsed ? "true" : undefined}
      >
        {}
        <div
          className="cloud-sidebar-brand"
          data-collapsed={collapsed ? "true" : undefined}
        >
          {!collapsed && (
            <div className="cloud-brand-text">
              <div className="cloud-brand-name">
                BeStrong<span className="cloud-brand-brace">{"{"}</span>
                <span className="cloud-brand-hq">HQ</span>
                <span className="cloud-brand-brace">{"}"}</span>
              </div>
              {instance?.org_name && (
                <div className="cloud-brand-sub">{instance.org_name}</div>
              )}
            </div>
          )}
          {onToggleCollapse && (
            <button
              type="button"
              className="cloud-sidebar-collapse-btn"
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <ChevronsRight className="w-4 h-4" />
              ) : (
                <ChevronsLeft className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {}
        <nav
          className={`flex-1 overflow-y-auto cloud-thin-scroll ${collapsed ? "px-2" : "px-3"}`}
        >
          <div className="cloud-nav-section">
            {!collapsed && <div className="cloud-nav-label">Workspace</div>}
            <NavLink
              href="/"
              icon={Home}
              label="Home"
              isActive={isActive}
              collapsed={collapsed}
            />
            <NavLink
              href="/inbox"
              icon={Inbox}
              label="Inbox"
              badge={notificationCount}
              isActive={isActive}
              collapsed={collapsed}
            />
            <NavLink
              href="/queue"
              icon={CheckCircle}
              label="Work Queue"
              isActive={isActive}
              collapsed={collapsed}
            />
            <NavLink
              href="/athletes"
              icon={Users}
              label="Athletes"
              isActive={isActive}
              collapsed={collapsed}
            />
            <NavLink
              href="/meets"
              icon={Trophy}
              label="Meets"
              isActive={isActive}
              collapsed={collapsed}
            />
            {features.includes("billing") && (
              <NavLink
                href="/billing"
                icon={CreditCard}
                label="Billing"
                isActive={isActive}
                collapsed={collapsed}
              />
            )}
            {WORKSPACE_EXTRAS.map((item) => (
              <ExtraTopLevelItem
                key={item.href}
                item={item}
                features={features}
                isActive={isActive}
                collapsed={collapsed}
              />
            ))}
          </div>

          <div className="cloud-nav-section">
            {!collapsed && <div className="cloud-nav-label">Data</div>}
            {collapsed ? (
              <RailSectionButton
                icon={Plug}
                label="Integrations"
                active={isSectionActive("/integrations")}
                onActivate={() => expandInto(setIntegrationsOpen)}
              />
            ) : (
              <>
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
                    <Link
                      href="/integrations/openpowerlifting"
                      className="cloud-nav-item cloud-nav-item-sub"
                      data-active={isActive("/integrations/openpowerlifting") ? "true" : undefined}
                    >
                      <Trophy className="w-3.5 h-3.5 shrink-0 cloud-nav-icon" />
                      <span>OpenPowerlifting</span>
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
                    {DATA_INTEGRATION_EXTRAS.map((item) => (
                      <ExtraItem
                        key={item.href}
                        item={item}
                        features={features}
                        isActive={isActive}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="cloud-nav-section">
            {!collapsed && <div className="cloud-nav-label">Account</div>}
            {ACCOUNT_EXTRAS.map((item) => (
              <ExtraTopLevelItem
                key={item.href}
                item={item}
                features={features}
                isActive={isActive}
                collapsed={collapsed}
              />
            ))}
            {collapsed ? (
              <RailSectionButton
                icon={Settings2}
                label="Configuration"
                active={isSectionActive("/configuration")}
                onActivate={() => expandInto(setConfigurationOpen)}
              />
            ) : (
              <>
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
                    {CONFIGURATION_EXTRAS.map((item) => (
                      <ExtraItem
                        key={item.href}
                        item={item}
                        features={features}
                        isActive={isActive}
                      />
                    ))}
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
              </>
            )}
          </div>
        </nav>

        {!collapsed && (
          <div className="cloud-sidebar-footer">
            <p className="text-xs cloud-text-dim">{DISPLAY_VERSION}</p>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

export function Sidebar({
  notificationCount = 0,
  features = [],
  mobileOpen: mobileOpenProp,
  onMobileOpenChange,
}: SidebarProps) {
  const pathname = usePathname();
  const [integrationsOpen, setIntegrationsOpen] = useState(
    () => pathname?.startsWith("/integrations") ?? false,
  );
  const [configurationOpen, setConfigurationOpen] = useState(
    () => pathname?.startsWith("/configuration") ?? false,
  );
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const mobileOpen = mobileOpenProp ?? internalMobileOpen;
  const setMobileOpen = onMobileOpenChange ?? setInternalMobileOpen;
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // ignore unavailable storage
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  const isActive = (href: string) => pathname === href;
  const isSectionActive = (prefix: string) => pathname?.startsWith(prefix) ?? false;

  return (
    <>
      {}
      <aside
        className={`hidden md:block h-screen sticky top-0 z-20 transition-[width] duration-200 ease-in-out ${collapsed ? "w-14" : "w-60"}`}
      >
        <SidebarContent
          notificationCount={notificationCount}
          features={features}
          integrationsOpen={integrationsOpen}
          setIntegrationsOpen={setIntegrationsOpen}
          configurationOpen={configurationOpen}
          setConfigurationOpen={setConfigurationOpen}
          isActive={isActive}
          isSectionActive={isSectionActive}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />
      </aside>

      {}
      <div className="md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="p-0 w-60">
            <SidebarContent
              notificationCount={notificationCount}
              features={features}
              integrationsOpen={integrationsOpen}
              setIntegrationsOpen={setIntegrationsOpen}
              configurationOpen={configurationOpen}
              setConfigurationOpen={setConfigurationOpen}
              isActive={isActive}
              isSectionActive={isSectionActive}
              collapsed={false}
            />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
