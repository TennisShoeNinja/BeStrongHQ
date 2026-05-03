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
