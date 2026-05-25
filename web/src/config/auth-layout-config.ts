/**
 * Path prefixes that bypass the standard auth-aware layout (sidebar +
 * topbar wrap) and render their children bare.
 *
 * The bare-render is decided synchronously from the URL, before the
 * auth status comes back, so each prefix here lets a caller render
 * its own layout chrome without flashing the spinner.
 *
 * Plugins can extend this list via the build-time overlay sync.
 */
export const EXTRA_BARE_LAYOUT_PREFIXES: string[] = [];

/**
 * Regex patterns that also bypass the standard layout, for routes that
 * cannot be expressed as a static prefix (e.g. a section nested under a
 * dynamic path segment). Plugins extend this via the build-time overlay sync.
 */
export const EXTRA_BARE_LAYOUT_PATTERNS: RegExp[] = [];
