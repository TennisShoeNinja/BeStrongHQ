"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  LogOut,
  Search,
  Settings,
  Trophy,
  User,
} from "lucide-react";
import apiClient from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { FeedbackDialog } from "@/components/feedback-dialog";

function humanize(segment: string): string {
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getPageCrumbs(pathname: string): string[] {
  if (pathname === "/") return ["Home"];
  const segments = pathname.split("/").filter(Boolean);
  return segments
    .map((s) => (/^\d+$/.test(s) ? null : humanize(s)))
    .filter((s): s is string => s !== null);
}


const SEARCHABLE_PAGES: { label: string; href: string; keywords: string[] }[] = [
  { label: "Athletes", href: "/athletes", keywords: ["athletes", "roster", "lifters"] },
  { label: "Meets", href: "/meets", keywords: ["meets", "competitions"] },
  { label: "Queue", href: "/queue", keywords: ["queue", "jobs", "imports"] },
  { label: "Inbox", href: "/inbox", keywords: ["inbox", "notifications"] },
  {
    label: "Settings",
    href: "/configuration",
    keywords: [
      "settings",
      "configuration",
      "config",
      "preferences",
      "defaults",
      "units",
      "coach profile",
      "api",
      "workspace",
      "about",
    ],
  },
  {
    label: "Google Drive",
    href: "/integrations/google-drive",
    keywords: ["google drive", "drive", "integrations", "sync"],
  },
  {
    label: "Calendar",
    href: "/integrations/calendar",
    keywords: ["calendar", "integrations", "ical"],
  },
];

function matchPages(query: string) {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  return SEARCHABLE_PAGES.filter(
    (p) =>
      p.label.toLowerCase().includes(term) ||
      p.keywords.some((k) => k.includes(term))
  );
}

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, authEnabled, logout } = useAuth();
  const searchWrapRef = useRef<HTMLDivElement>(null);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiClient.getSettings(),
    staleTime: 60000,
  });
  const teamName = settings?.team_name || "BeStrong";

  const { data: notificationCount = 0 } = useQuery({
    queryKey: ["notification-count"],
    queryFn: () => apiClient.getNotificationCount(),
    refetchInterval: 30000,
    staleTime: 5000,
    refetchOnWindowFocus: true,
  });

  const [localSearch, setLocalSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setLocalSearch(searchParams.get("q") ?? "");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [searchParams]);

  
  
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(localSearch), 250);
    return () => clearTimeout(handle);
  }, [localSearch]);

  
  useEffect(() => {
    if (!searchOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [searchOpen]);

  const { data: searchResults } = useQuery({
    queryKey: ["search", debouncedSearch],
    queryFn: () => apiClient.search(debouncedSearch, 6),
    enabled: debouncedSearch.trim().length > 0,
    staleTime: 10_000,
  });

  const handleSearchChange = (value: string) => {
    setLocalSearch(value);
    setSearchOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("q", value);
    else params.delete("q");
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const crumbs = getPageCrumbs(pathname);

  const pageHits = matchPages(debouncedSearch);
  const hasResults =
    (searchResults &&
      (searchResults.athletes.length > 0 || searchResults.meets.length > 0)) ||
    pageHits.length > 0;

  const dismissSearch = () => setSearchOpen(false);

  
  
  
  
  const avatarInitial = (
    user?.name ||
    user?.email ||
    settings?.coach_display_name ||
    teamName ||
    "U"
  ).toString().trim()[0]?.toUpperCase() ?? "U";

  const avatarNode = user?.picture ? (
    <Image
      src={user.picture}
      alt=""
      width={30}
      height={30}
      className="w-[30px] h-[30px] rounded-full"
      referrerPolicy="no-referrer"
    />
  ) : (
    <div className="cloud-topbar-avatar" title={user?.email || settings?.coach_display_name || teamName}>
      {avatarInitial}
    </div>
  );

  return (
    <header className="cloud-topbar">
      <nav className="cloud-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/" className="cloud-breadcrumb-home">{teamName}</Link>
        {crumbs.map((c, i) => (
          <Fragment key={`${c}-${i}`}>
            <span className="cloud-text-dim">/</span>
            <span className={i === crumbs.length - 1 ? "cloud-text font-medium" : "cloud-text-muted"}>
              {c}
            </span>
          </Fragment>
        ))}
      </nav>

      <div className="cloud-topbar-search relative" ref={searchWrapRef}>
        <Search className="w-3.5 h-3.5 cloud-text-muted" />
        <input
          type="text"
          placeholder="Search athletes, meets, pages…"
          value={localSearch}
          onFocus={() => localSearch.trim() && setSearchOpen(true)}
          onChange={(e) => handleSearchChange(e.target.value)}
          aria-label="Search"
        />
        <kbd className="cloud-kbd">⌘K</kbd>

        {searchOpen && debouncedSearch.trim() && (
          <div
            className="cloud-panel-raised"
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              right: 0,
              maxHeight: 440,
              overflowY: "auto",
              boxShadow: "0 20px 40px -16px rgba(0,0,0,0.6), 0 8px 16px -4px rgba(0,0,0,0.4)",
              zIndex: 30,
            }}
          >
            {!searchResults && pageHits.length === 0 ? (
              <div className="cloud-text-muted" style={{ padding: "var(--cloud-s3) var(--cloud-s4)", fontSize: 13 }}>
                Searching…
              </div>
            ) : !hasResults ? (
              <div className="cloud-text-muted" style={{ padding: "var(--cloud-s3) var(--cloud-s4)", fontSize: 13 }}>
                No matches for &ldquo;{debouncedSearch}&rdquo;
              </div>
            ) : (
              <>
                {searchResults && searchResults.athletes.length > 0 && (
                  <SearchGroup title="Athletes">
                    {searchResults.athletes.map((a) => (
                      <Link
                        key={`ath-${a.id}`}
                        href={`/athletes/${a.id}`}
                        onClick={dismissSearch}
                        className="cloud-search-hit"
                      >
                        <User className="w-3.5 h-3.5 cloud-text-muted" />
                        <span className="cloud-text">{a.name}</span>
                      </Link>
                    ))}
                  </SearchGroup>
                )}
                {searchResults && searchResults.meets.length > 0 && (
                  <SearchGroup title="Meets">
                    {searchResults.meets.map((m) => (
                      <Link
                        key={`meet-${m.id}`}
                        href={`/meets/${m.id}`}
                        onClick={dismissSearch}
                        className="cloud-search-hit"
                      >
                        <Trophy className="w-3.5 h-3.5 cloud-text-muted" />
                        <span className="cloud-text flex-1 truncate">{m.name}</span>
                        {m.meet_date && (
                          <span className="cloud-text-dim" style={{ fontSize: 11 }}>
                            {m.meet_date}
                          </span>
                        )}
                      </Link>
                    ))}
                  </SearchGroup>
                )}
                {pageHits.length > 0 && (
                  <SearchGroup title="Pages">
                    {pageHits.map((p) => (
                      <Link
                        key={`page-${p.href}`}
                        href={p.href}
                        onClick={dismissSearch}
                        className="cloud-search-hit"
                      >
                        <Settings className="w-3.5 h-3.5 cloud-text-muted" />
                        <span className="cloud-text">{p.label}</span>
                      </Link>
                    ))}
                  </SearchGroup>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="cloud-topbar-actions">
        <Link
          href="/inbox"
          className="cloud-icon-btn"
          title="Inbox"
          aria-label={`Inbox${notificationCount > 0 ? ` (${notificationCount} unread)` : ""}`}
        >
          <Bell className="w-4 h-4" />
          {notificationCount > 0 && <span className="cloud-icon-dot" />}
        </Link>
        <FeedbackDialog />
        {authEnabled && user ? (
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Account menu">
              {avatarNode}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="cloud-panel-raised min-w-48">
              <div className="px-3 py-2">
                <p className="text-xs cloud-text font-medium truncate">
                  {user.name || user.email}
                </p>
                {user.name && user.email && (
                  <p className="text-[11px] cloud-text-muted truncate">{user.email}</p>
                )}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          avatarNode
        )}
      </div>
    </header>
  );
}

function SearchGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="cloud-text-dim"
        style={{
          padding: "10px var(--cloud-s4) 6px",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 500,
          background: "rgba(0,0,0,0.15)",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
