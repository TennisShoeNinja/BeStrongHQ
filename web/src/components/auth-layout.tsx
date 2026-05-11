'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-provider';
import { SidebarWithNotifications } from '@/components/sidebar-with-notifications';
import { BottomNav } from '@/components/bottom-nav';
import { DriveStatusBanner } from '@/components/drive-status-banner';
import { Topbar } from '@/components/topbar';
import { EXTRA_BARE_LAYOUT_PREFIXES } from '@/config/auth-layout-config';


const BARE_LAYOUT_PREFIXES = ['/login', ...EXTRA_BARE_LAYOUT_PREFIXES];

function isBarePath(pathname: string): boolean {
  return BARE_LAYOUT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  );
}

function AuthSpinner() {
  return (
    <div
      className="w-full min-h-screen flex items-center justify-center"
      style={{ backgroundColor: 'var(--cloud-surface)' }}
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{
            borderColor: 'var(--cloud-border)',
            borderTopColor: 'var(--cloud-primary)',
          }}
        />
        <p className="text-sm" style={{ color: 'var(--cloud-text-muted)' }}>
          Loading...
        </p>
      </div>
    </div>
  );
}


export function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, authEnabled, loading } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);



  if (isBarePath(pathname)) {
    return <div className="w-full">{children}</div>;
  }


  if (loading) {
    return <AuthSpinner />;
  }

  
  
  
  
  
  if (authEnabled && !user) {
    if (pathname.startsWith('/configuration')) {
      return <div className="w-full">{children}</div>;
    }
    return <AuthSpinner />;
  }

  
  return (
    <>
      <SidebarWithNotifications
        mobileOpen={mobileNavOpen}
        onMobileOpenChange={setMobileNavOpen}
      />
      <main className="flex-1 overflow-auto flex flex-col min-w-0 cloud-main-with-bottom-nav">
        <div className="hidden md:contents">
          <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
        </div>
        <DriveStatusBanner />
        <div className="flex-1">{children}</div>
      </main>
      <BottomNav />
    </>
  );
}
