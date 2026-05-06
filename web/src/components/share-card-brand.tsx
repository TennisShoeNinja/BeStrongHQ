'use client';

/**
 * Brand tokens for the share card surface (Profile / Recent PR / Comp
 * History / Achievements). Lifted from the BeStrong HQ design system at
 * .claude/skills/design/colors_and_type.css. The product rule is "one
 * blue does almost all the work" — these tokens enforce it.
 */
export const SHARE_BRAND = {
  // Primary brand blue: fills, borders, chart line, accent stripe.
  blue: '#0C5CAB',
  // Readable-on-dark variant: eyebrow labels, text accents.
  blueText: '#7CB4ED',
  // Near-black surface (never pure black).
  ink: '#09090B',
  // Off-white foreground.
  paper: '#FAFAFA',
  // Translucent foreground tiers.
  fgMuted: 'rgba(250, 250, 250, 0.65)',
  fgDim: 'rgba(250, 250, 250, 0.40)',
  fgFaint: 'rgba(250, 250, 250, 0.25)',
  // Card surface tints.
  panel: 'rgba(255, 255, 255, 0.03)',
  panelHover: 'rgba(255, 255, 255, 0.06)',
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.12)',
  // Blue glow rim — the brand's signature halo on hero panels.
  blueGlowRim: 'rgba(12, 92, 171, 0.30)',
  blueGlowSoft: 'rgba(12, 92, 171, 0.15)',
  // Card background gradient: subtle blue tint into near-black.
  bgGradient:
    'radial-gradient(ellipse at top, #0a1322 0%, #09090B 45%, #050507 100%)',
  // Outer card border tint (faint blue presence, not a hard line).
  cardBorder: 'rgba(12, 92, 171, 0.20)',
  // Font stacks (mirroring web/src/app/globals.css next/font setup).
  fontSans:
    'var(--font-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontMono:
    'var(--font-geist-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
};

/**
 * BeStrong{HQ} wordmark. Sentence-case `BeStrong` in IBM Plex Sans +
 * literal `{` `HQ` `}` in IBM Plex Mono with brand-blue braces. Per the
 * BeStrong HQ design skill: the lockup is `BeStrong{HQ}`, never
 * `BESTRONG HQ` and never with a colored "HQ".
 */
export function ShareCardLockup({
  size = 'md',
}: {
  size?: 'sm' | 'md';
}) {
  const fontSize = size === 'sm' ? 22 : 28;
  return (
    <div
      style={{
        fontFamily: SHARE_BRAND.fontSans,
        fontSize,
        fontWeight: 600,
        letterSpacing: '-0.01em',
        lineHeight: 1.0,
        color: SHARE_BRAND.paper,
        display: 'inline-flex',
        alignItems: 'baseline',
      }}
    >
      <span>BeStrong</span>
      <span
        style={{
          fontFamily: SHARE_BRAND.fontMono,
          fontWeight: 500,
          marginLeft: 1,
        }}
      >
        <span style={{ color: SHARE_BRAND.blueText }}>{'{'}</span>
        <span style={{ color: SHARE_BRAND.paper }}>HQ</span>
        <span style={{ color: SHARE_BRAND.blueText }}>{'}'}</span>
      </span>
    </div>
  );
}

/** Eyebrow label — UPPERCASE blue per the brand voice rule. */
export function CardEyebrow({
  children,
  size = 'md',
}: {
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const fontSize = size === 'sm' ? 11 : size === 'lg' ? 16 : 13;
  return (
    <div
      style={{
        fontFamily: SHARE_BRAND.fontSans,
        fontSize,
        fontWeight: 600,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        color: SHARE_BRAND.blueText,
      }}
    >
      {children}
    </div>
  );
}
