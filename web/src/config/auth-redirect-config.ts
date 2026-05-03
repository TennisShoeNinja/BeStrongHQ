/**
 * Path prefixes that should NOT trigger an automatic redirect to
 * /login when the auth status returns "not signed in."
 *
 * Use this for routes that handle their own auth flow (different
 * cookie, different identity model) and don't want to bounce visitors
 * to the coach sign-in page.
 *
 * Plugins can extend this list via the build-time overlay sync.
 */
export const EXTRA_REDIRECT_EXEMPT_PREFIXES: string[] = [];
