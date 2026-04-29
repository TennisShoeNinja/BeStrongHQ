'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-provider';
import { SidebarWithNotifications } from '@/components/sidebar-with-notifications';
import { DriveStatusBanner } from '@/components/drive-status-banner';
import { Topbar } from '@/components/topbar';

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

  
  
  if (pathname === '/login') {
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
      <SidebarWithNotifications />
      <main className="flex-1 overflow-auto flex flex-col min-w-0">
        <Topbar />
        <DriveStatusBanner />
        <div className="flex-1">{children}</div>
      </main>
    </>
  );
}
