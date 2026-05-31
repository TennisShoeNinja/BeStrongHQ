"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

/**
 * App-wide "back to where I came from" navigation.
 *
 * Origin pages build a link with `withReturn(...)`, which stashes the return
 * path + a human label in the URL query (`from` / `fromLabel`). Destination
 * pages render a back button via `useBackTarget(...)`, falling back to a fixed
 * default when no `from` is present (direct loads, deep links).
 *
 * `from` always holds an internal app path that we construct ourselves, never
 * user input, so there is no open-redirect surface.
 */

export const FROM_PARAM = "from";
export const FROM_LABEL_PARAM = "fromLabel";

/**
 * Append `from`/`fromLabel` to a target path so the destination can render a
 * labeled back button. `returnTo` is the path (optionally with its own query,
 * e.g. `/queue?focus=12`) to come back to.
 */
export function withReturn(
  targetPath: string,
  returnTo: string,
  returnLabel: string,
): string {
  const [pathAndQuery, hash = ""] = targetPath.split("#");
  const [path, existingQuery = ""] = pathAndQuery.split("?");
  const params = new URLSearchParams(existingQuery);
  params.set(FROM_PARAM, returnTo);
  params.set(FROM_LABEL_PARAM, returnLabel);
  return `${path}?${params.toString()}${hash ? `#${hash}` : ""}`;
}

export interface BackTarget {
  href: string;
  label: string;
}

/**
 * Read the back target from the current URL. Returns the explicit
 * `from`/`fromLabel` when present, otherwise the supplied default.
 */
export function useBackTarget(
  defaultHref: string,
  defaultLabel: string,
): BackTarget {
  const searchParams = useSearchParams();
  const from = searchParams.get(FROM_PARAM);
  const fromLabel = searchParams.get(FROM_LABEL_PARAM);
  return useMemo(
    () => ({
      href: from || defaultHref,
      label: (from && fromLabel) || defaultLabel,
    }),
    [from, fromLabel, defaultHref, defaultLabel],
  );
}

/**
 * The current `from`/`fromLabel` as a query suffix (e.g. `?from=%2Fqueue...`),
 * or "" when absent. Use this to thread the back target through internal links
 * (e.g. tab navigation) so switching tabs doesn't drop it.
 */
export function useReturnQuery(): string {
  const searchParams = useSearchParams();
  const from = searchParams.get(FROM_PARAM);
  const fromLabel = searchParams.get(FROM_LABEL_PARAM);
  return useMemo(() => {
    if (!from) return "";
    const params = new URLSearchParams();
    params.set(FROM_PARAM, from);
    if (fromLabel) params.set(FROM_LABEL_PARAM, fromLabel);
    return `?${params.toString()}`;
  }, [from, fromLabel]);
}
