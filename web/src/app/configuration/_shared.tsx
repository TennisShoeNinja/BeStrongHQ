'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useAuth } from '@/lib/auth-provider';

export const MICRO_LABEL: CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontWeight: 500,
};

export const FIELD_LABEL: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  marginBottom: 6,
};

export const INPUT_STYLE: CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  fontSize: 13,
  borderRadius: 8,
  backgroundColor: 'var(--cloud-surface-raised)',
  border: '1px solid var(--cloud-border)',
  color: 'var(--cloud-text)',
  outline: 'none',
};

export function SectionPanel({
  title,
  icon,
  right,
  children,
}: {
  title: string;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="cloud-panel" style={{ padding: 24 }}>
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 16 }}
      >
        <h2
          className="cloud-text flex items-center"
          style={{
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            gap: 10,
          }}
        >
          {icon}
          {title}
        </h2>
        {right}
      </div>
      {children}
    </div>
  );
}

export function PageShell({
  title,
  subtitle,
  right,
  children,
  eyebrowContext = 'Settings',
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  eyebrowContext?: string;
}) {
  const { instance } = useAuth();
  const eyebrowTeam = instance?.org_name || 'BeStrong';
  return (
    <div className="min-h-screen">
      <div
        className="mx-auto"
        style={{
          maxWidth: 880,
          padding: 'var(--cloud-s5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--cloud-s4)',
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{ gap: 16 }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              className="cloud-eyebrow"
              style={{
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
                <span>{eyebrowTeam}</span>
                <span
                  aria-hidden
                  style={{
                    width: 3,
                    height: 3,
                    borderRadius: '50%',
                    background: 'var(--cloud-text-dim)',
                    display: 'inline-block',
                  }}
                />
                <span style={{ color: 'var(--cloud-text-dim)' }}>
                  {eyebrowContext}
                </span>
              </p>
            <h1
              className="cloud-text"
              style={{
                fontSize: 32,
                fontWeight: 600,
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
              }}
            >
              {title}
            </h1>
            {subtitle && (
              <p
                className="cloud-text-muted"
                style={{ fontSize: 13, marginTop: 6 }}
              >
                {subtitle}
              </p>
            )}
          </div>
          {right}
        </div>
        {children}
      </div>
    </div>
  );
}
