'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import apiClient from '@/lib/api';
import * as Types from '@/lib/types';

const DEFAULT_TENANT_SETTINGS: Types.TenantSettings = {
  tracks_rpe: true,
};

interface AuthContextValue {
  user: Types.AuthUserInfo | null;
  tenant: Types.TenantInfo | null;
  tenantSettings: Types.TenantSettings;
  features: string[];
  authEnabled: boolean;
  deploymentMode: string;
  loading: boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  tenant: null,
  tenantSettings: DEFAULT_TENANT_SETTINGS,
  features: [],
  authEnabled: false,
  deploymentMode: 'local',
  loading: true,
  logout: async () => {},
  refresh: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Types.AuthUserInfo | null>(null);
  const [tenant, setTenant] = useState<Types.TenantInfo | null>(null);
  const [tenantSettings, setTenantSettings] = useState<Types.TenantSettings>(
    DEFAULT_TENANT_SETTINGS,
  );
  const [features, setFeatures] = useState<string[]>([]);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [deploymentMode, setDeploymentMode] = useState('local');
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const status = await apiClient.getAuthStatus();
      setAuthEnabled(status.auth_enabled);
      setDeploymentMode(status.deployment_mode || 'local');
      setTenant(status.tenant ?? null);
      setTenantSettings(status.tenant_settings ?? DEFAULT_TENANT_SETTINGS);
      setFeatures(status.features ?? []);

      if (status.authenticated) {
        setUser(status.user);
      } else {
        setUser(null);
      }
    } catch {
      
      setUser(null);
      setTenant(null);
      setTenantSettings(DEFAULT_TENANT_SETTINGS);
      setFeatures([]);
      setAuthEnabled(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const status = await apiClient.getAuthStatus();
        if (cancelled) return;

        setAuthEnabled(status.auth_enabled);
        setDeploymentMode(status.deployment_mode || 'local');
        setTenant(status.tenant ?? null);
        setTenantSettings(status.tenant_settings ?? DEFAULT_TENANT_SETTINGS);
        setFeatures(status.features ?? []);

        if (status.authenticated) {
          setUser(status.user);
          
          if (pathname === '/login') {
            router.replace('/');
          }
        } else {
          setUser(null);
          
          
          
          
          if (
            status.auth_enabled &&
            pathname !== '/login' &&
            !pathname.startsWith('/configuration')
          ) {
            const target =
              pathname && pathname !== '/'
                ? `/login?next=${encodeURIComponent(pathname)}`
                : '/login';
            router.replace(target);
          }
        }
      } catch {
        
        if (!cancelled) {
          setUser(null);
          setTenant(null);
          setTenantSettings(DEFAULT_TENANT_SETTINGS);
          setFeatures([]);
          setAuthEnabled(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    checkAuth();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  const logout = async () => {
    try {
      await apiClient.logout();
    } catch {
      
    }
    setUser(null);
    
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        tenantSettings,
        features,
        authEnabled,
        deploymentMode,
        loading,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
