import {
  EXTRA_BARE_LAYOUT_PREFIXES,
  EXTRA_BARE_LAYOUT_PATTERNS,
} from "@/config/auth-layout-config";

const BARE_LAYOUT_PREFIXES = ["/login", ...EXTRA_BARE_LAYOUT_PREFIXES];

/**
 * Whether a path should render with bare chrome (no standard sidebar,
 * topbar, bottom nav, or assistant widget), decided synchronously from
 * the URL. Prefixes cover static routes; patterns cover routes nested
 * under a dynamic segment. Plugins extend both lists via the overlay sync.
 */
export function isBareLayoutPath(pathname: string): boolean {
  const prefixMatch = BARE_LAYOUT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
  if (prefixMatch) return true;
  return EXTRA_BARE_LAYOUT_PATTERNS.some((re) => re.test(pathname));
}
