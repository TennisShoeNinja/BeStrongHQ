'use client';

import { forwardRef } from 'react';
import {
  SHARE_BRAND,
  ShareCardLockup,
  CardEyebrow,
} from '@/components/share-card-brand';
import type { MeetSummary } from '@/components/share-comp-history-card';

export type RecapMode = 'card' | 'sticker';
export type RecapOrientation = 'vertical' | 'horizontal';

const CARD_DIMS = { width: 1080, height: 1620 };
const STICKER_DIMS = {
  vertical: { width: 720, height: 1080 },
  horizontal: { width: 1280, height: 480 },
};

export const RECAP_DIMENSIONS = {
  card: CARD_DIMS,
  sticker: STICKER_DIMS,
};

interface ShareMeetRecapCardProps {
  meet: MeetSummary;
  athleteName: string;
  teamName: string;
  mode: RecapMode;
  orientation?: RecapOrientation;
}

function formatLbs(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return `${Math.round(value)}`;
}

function formatMeetDate(date: string | null): string {
  if (!date) return '';
  const parts = date.split('-');
  if (parts.length !== 3) return date;
  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d) return date;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function placeBadge(n: number | null): { text: string; medal: boolean } {
  if (n == null) return { text: '', medal: false };
  if (n === 1) return { text: '🥇 1st place', medal: true };
  if (n === 2) return { text: '🥈 2nd place', medal: true };
  if (n === 3) return { text: '🥉 3rd place', medal: true };
  const mod100 = n % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? 'th'
      : ['st', 'nd', 'rd'][(n % 10) - 1] ?? 'th';
  return { text: `${n}${suffix} place`, medal: false };
}

function subline(meet: MeetSummary): string {
  return [
    formatMeetDate(meet.meet_date),
    meet.federation,
    meet.weight_class,
  ]
    .filter(Boolean)
    .join(' · ');
}

export const ShareMeetRecapCard = forwardRef<
  HTMLDivElement,
  ShareMeetRecapCardProps
>(function ShareMeetRecapCard(
  { meet, athleteName, teamName, mode, orientation = 'vertical' },
  ref,
) {
  if (mode === 'sticker') {
    return (
      <RecapSticker
        ref={ref}
        meet={meet}
        athleteName={athleteName}
        teamName={teamName}
        orientation={orientation}
      />
    );
  }
  return (
    <RecapFullCard
      ref={ref}
      meet={meet}
      athleteName={athleteName}
      teamName={teamName}
    />
  );
});

const RecapFullCard = forwardRef<
  HTMLDivElement,
  Omit<ShareMeetRecapCardProps, 'mode' | 'orientation'>
>(function RecapFullCard({ meet, athleteName, teamName }, ref) {
  const place = placeBadge(meet.place_numeric);
  const isWin = meet.place_numeric === 1;
  return (
    <div
      ref={ref}
      style={{
        width: CARD_DIMS.width,
        height: CARD_DIMS.height,
        background: SHARE_BRAND.bgGradient,
        color: SHARE_BRAND.paper,
        fontFamily: SHARE_BRAND.fontSans,
        fontVariantNumeric: 'tabular-nums',
        padding: 64,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${SHARE_BRAND.cardBorder}`,
        borderRadius: 20,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <CardEyebrow size="lg">{teamName}</CardEyebrow>
          <div
            style={{
              fontSize: 13,
              color: SHARE_BRAND.fgDim,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              marginTop: 6,
              fontWeight: 500,
            }}
          >
            Meet recap
          </div>
        </div>
        <div style={{ fontSize: 22, color: SHARE_BRAND.fgMuted, fontWeight: 500 }}>
          {athleteName}
        </div>
      </div>

      <div style={{ marginTop: 56 }}>
        <h1
          style={{
            fontSize: 72,
            lineHeight: 1.05,
            fontWeight: 600,
            letterSpacing: '-0.035em',
            margin: 0,
          }}
        >
          {meet.meet_name ?? 'Untitled meet'}
        </h1>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            marginTop: 20,
            alignItems: 'center',
          }}
        >
          {place.text && (
            <div
              style={{
                fontSize: 24,
                fontWeight: 600,
                padding: '8px 16px',
                borderRadius: 999,
                background: isWin
                  ? SHARE_BRAND.blueGlowSoft
                  : SHARE_BRAND.panelHover,
                border: isWin
                  ? `1px solid ${SHARE_BRAND.blueGlowRim}`
                  : `1px solid ${SHARE_BRAND.borderStrong}`,
                color: isWin ? SHARE_BRAND.blueText : SHARE_BRAND.paper,
              }}
            >
              {place.text}
            </div>
          )}
          <div style={{ fontSize: 18, color: SHARE_BRAND.fgMuted }}>
            {subline(meet)}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 56,
          background: `linear-gradient(135deg, ${SHARE_BRAND.blueGlowSoft} 0%, rgba(12,92,171,0.02) 100%)`,
          border: `1px solid ${SHARE_BRAND.blueGlowRim}`,
          borderRadius: 14,
          padding: '40px 48px',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 32,
            bottom: 32,
            width: 4,
            background: SHARE_BRAND.blue,
            borderRadius: 2,
          }}
        />
        <CardEyebrow>Meet total</CardEyebrow>
        <div
          style={{
            fontSize: 144,
            fontWeight: 600,
            letterSpacing: '-0.04em',
            lineHeight: 1.0,
            marginTop: 12,
          }}
        >
          {formatLbs(meet.total_lbs)} lbs
        </div>
        {meet.dots_score != null && (
          <div
            style={{
              fontSize: 22,
              color: SHARE_BRAND.fgMuted,
              marginTop: 16,
            }}
          >
            {meet.dots_score.toFixed(2)} DOTS
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 32,
          display: 'flex',
          gap: 20,
        }}
      >
        <LiftTile label="Squat" value={meet.squat_lbs} />
        <LiftTile label="Bench" value={meet.bench_lbs} />
        <LiftTile label="Deadlift" value={meet.deadlift_lbs} />
      </div>

      <div
        style={{
          marginTop: 'auto',
          paddingTop: 32,
          borderTop: `1px solid ${SHARE_BRAND.border}`,
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
        }}
      >
        <ShareCardLockup />
        <span style={{ fontSize: 16, color: SHARE_BRAND.fgMuted }}>
          powerlifting analytics
        </span>
      </div>
    </div>
  );
});

function LiftTile({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        flex: 1,
        background: SHARE_BRAND.panel,
        border: `1px solid ${SHARE_BRAND.border}`,
        borderRadius: 14,
        padding: '24px 28px',
      }}
    >
      <CardEyebrow size="sm">{label}</CardEyebrow>
      <div
        style={{
          fontSize: 56,
          fontWeight: 600,
          letterSpacing: '-0.03em',
          lineHeight: 1.0,
          marginTop: 8,
        }}
      >
        {formatLbs(value)}
        <span
          style={{
            fontSize: 24,
            fontWeight: 500,
            color: SHARE_BRAND.fgMuted,
            marginLeft: 6,
          }}
        >
          lbs
        </span>
      </div>
    </div>
  );
}

const RecapSticker = forwardRef<
  HTMLDivElement,
  Omit<ShareMeetRecapCardProps, 'mode'>
>(function RecapSticker(
  { meet, athleteName, teamName, orientation = 'vertical' },
  ref,
) {
  const dims = STICKER_DIMS[orientation];
  const place = placeBadge(meet.place_numeric);
  const isVertical = orientation === 'vertical';

  return (
    <div
      ref={ref}
      style={{
        width: dims.width,
        height: dims.height,
        background: 'transparent',
        color: SHARE_BRAND.paper,
        fontFamily: SHARE_BRAND.fontSans,
        fontVariantNumeric: 'tabular-nums',
        padding: isVertical ? '56px 48px' : '40px 56px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: isVertical ? 'column' : 'row',
        alignItems: isVertical ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        gap: isVertical ? 24 : 32,
        textShadow: '0 2px 12px rgba(0, 0, 0, 0.45)',
      }}
    >
      {isVertical ? (
        <VerticalStickerBody
          meet={meet}
          athleteName={athleteName}
          teamName={teamName}
          place={place}
        />
      ) : (
        <HorizontalStickerBody
          meet={meet}
          athleteName={athleteName}
          teamName={teamName}
          place={place}
        />
      )}
    </div>
  );
});

function VerticalStickerBody({
  meet,
  athleteName,
  teamName,
  place,
}: {
  meet: MeetSummary;
  athleteName: string;
  teamName: string;
  place: { text: string; medal: boolean };
}) {
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: SHARE_BRAND.blueText,
          }}
        >
          {teamName} · Meet recap
        </div>
        <div
          style={{
            fontSize: 38,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            color: SHARE_BRAND.paper,
          }}
        >
          {meet.meet_name ?? 'Untitled meet'}
        </div>
        <div style={{ fontSize: 16, color: SHARE_BRAND.fgMuted }}>
          {athleteName}
          {place.text && <span style={{ marginLeft: 12 }}>{place.text}</span>}
        </div>
      </div>

      <div
        style={{
          fontSize: 168,
          fontWeight: 600,
          letterSpacing: '-0.04em',
          lineHeight: 1.0,
          color: SHARE_BRAND.paper,
        }}
      >
        {formatLbs(meet.total_lbs)}
        <span style={{ fontSize: 56, color: SHARE_BRAND.fgMuted, marginLeft: 12 }}>
          lbs
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 18,
          alignSelf: 'stretch',
          justifyContent: 'space-between',
        }}
      >
        <StickerLiftCell label="Squat" value={meet.squat_lbs} />
        <StickerLiftCell label="Bench" value={meet.bench_lbs} />
        <StickerLiftCell label="Deadlift" value={meet.deadlift_lbs} />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
        }}
      >
        <ShareCardLockup />
        {meet.dots_score != null && (
          <span style={{ fontSize: 14, color: SHARE_BRAND.fgMuted }}>
            {meet.dots_score.toFixed(2)} DOTS
          </span>
        )}
      </div>
    </>
  );
}

function HorizontalStickerBody({
  meet,
  athleteName,
  teamName,
  place,
}: {
  meet: MeetSummary;
  athleteName: string;
  teamName: string;
  place: { text: string; medal: boolean };
}) {
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: SHARE_BRAND.blueText,
          }}
        >
          {teamName} · Meet recap
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            color: SHARE_BRAND.paper,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {meet.meet_name ?? 'Untitled meet'}
        </div>
        <div style={{ fontSize: 16, color: SHARE_BRAND.fgMuted }}>
          {athleteName}
          {place.text && <span style={{ marginLeft: 10 }}>{place.text}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            alignItems: 'flex-end',
          }}
        >
          <StickerSmallCell label="Squat" value={meet.squat_lbs} />
          <StickerSmallCell label="Bench" value={meet.bench_lbs} />
          <StickerSmallCell label="Deadlift" value={meet.deadlift_lbs} />
        </div>
        <div
          style={{
            fontSize: 144,
            fontWeight: 600,
            letterSpacing: '-0.04em',
            lineHeight: 1.0,
            color: SHARE_BRAND.paper,
            whiteSpace: 'nowrap',
          }}
        >
          {formatLbs(meet.total_lbs)}
          <span style={{ fontSize: 40, color: SHARE_BRAND.fgMuted, marginLeft: 8 }}>
            lbs
          </span>
        </div>
      </div>
    </>
  );
}

function StickerLiftCell({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: SHARE_BRAND.fgDim,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 44,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          lineHeight: 1.0,
          color: SHARE_BRAND.paper,
        }}
      >
        {formatLbs(value)}
      </div>
    </div>
  );
}

function StickerSmallCell({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: SHARE_BRAND.fgDim,
          minWidth: 64,
          textAlign: 'right',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: SHARE_BRAND.paper,
        }}
      >
        {formatLbs(value)}
      </span>
    </div>
  );
}
