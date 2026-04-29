'use client';

import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import {
  ChevronRight,
  Server,
  Shield,
  SlidersHorizontal,
  User,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-provider';
import { PageShell } from './_shared';

const CARD_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: 20,
  borderRadius: 12,
  border: '1px solid var(--cloud-border)',
  backgroundColor: 'var(--cloud-surface)',
  textDecoration: 'none',
  transition: 'border-color 150ms ease, transform 150ms ease',
};

function HubCard({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <Link href={href} className="cloud-panel" style={CARD_STYLE}>
      <div
        style={{
          flexShrink: 0,
          width: 40,
          height: 40,
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--cloud-surface-raised)',
          border: '1px solid var(--cloud-border)',
          color: '#67e8f9',
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          className="cloud-text"
          style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}
        >
          {title}
        </p>
        <p
          className="cloud-text-muted"
          style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}
        >
          {description}
        </p>
      </div>
      <ChevronRight
        style={{ width: 16, height: 16, color: 'var(--cloud-text-muted)' }}
      />
    </Link>
  );
}

export default function ConfigurationPage() {
  const { deploymentMode } = useAuth();

  return (
    <PageShell
      title="Configuration"
      subtitle="Manage your workspace, behavior, access, and connection"
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 12,
        }}
      >
        <HubCard
          href="/configuration/profile"
          title="Profile"
          description="Team name, coach display name, and weather location."
          icon={<User style={{ width: 18, height: 18 }} />}
        />
        <HubCard
          href="/configuration/features"
          title="Features"
          description="Default weight unit, RPE tracking, and other behavior toggles."
          icon={<SlidersHorizontal style={{ width: 18, height: 18 }} />}
        />
        {deploymentMode === 'cloud' && (
          <HubCard
            href="/configuration/access"
            title="Access"
            description="Allowed Google accounts that can sign into this workspace."
            icon={<Shield style={{ width: 18, height: 18 }} />}
          />
        )}
        <HubCard
          href="/configuration/system"
          title="System"
          description="API connection, workspace/database details, and version info."
          icon={<Server style={{ width: 18, height: 18 }} />}
        />
      </div>
    </PageShell>
  );
}
