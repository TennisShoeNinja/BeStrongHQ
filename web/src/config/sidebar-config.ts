/**
 * Extra sidebar items contributed by plugins.
 *
 * Each list maps to one of the four sidebar sections rendered by
 * ``Sidebar`` (Workspace, Data, Account → Configuration). The base
 * items inside each section live hardcoded in ``sidebar.tsx``; the
 * lists here are appended below them.
 *
 * Plugins replace this whole file via the build-time overlay sync to
 * register their own items. Items can carry an optional ``feature``
 * gate that's checked against ``features.includes(...)`` from the
 * auth-status response, so an installed plugin can still hide an item
 * for instances where the relevant flag isn't set.
 */
import type { ComponentType } from "react";

export interface SidebarExtra {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  feature?: string;
}

export const WORKSPACE_EXTRAS: SidebarExtra[] = [];
export const DATA_INTEGRATION_EXTRAS: SidebarExtra[] = [];
export const ACCOUNT_EXTRAS: SidebarExtra[] = [];
export const CONFIGURATION_EXTRAS: SidebarExtra[] = [];
