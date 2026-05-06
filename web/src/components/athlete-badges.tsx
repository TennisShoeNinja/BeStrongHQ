'use client';

interface AthleteBadgesProps {
  athleteId: number;
}

// Badges hidden in production until the custom medallion design lands.
// The evaluator and BadgeRow components still exist and can be re-enabled
// by restoring the original implementation once the bespoke badge artwork
// is in place. Keep this file as the single switch.
export function AthleteBadges(_: AthleteBadgesProps) {
  return null;
}
