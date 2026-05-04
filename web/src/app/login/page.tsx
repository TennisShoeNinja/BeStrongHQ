'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Image from 'next/image';
import apiClient from '@/lib/api';
import { useAuth } from '@/lib/auth-provider';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

function LoginContent() {
  const searchParams = useSearchParams();
  const { instance, loading: authLoading } = useAuth();
  const error = searchParams.get('error');
  const email = searchParams.get('email');
  const setup = searchParams.get('setup');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [teamName, setTeamName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/auth/branding`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setTeamName(data?.team_name || 'BeStrong');
      })
      .catch(() => {
        if (!cancelled) setTeamName('BeStrong');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (setup === 'complete') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuccessMessage(
        'Authentication is now enabled. Sign in with your Google account to continue.'
      );
    }

    if (error === 'not_allowed' && email) {
      setErrorMessage(
        `${email} is not on the allowed users list. Contact your admin to get access.`
      );
    } else if (error === 'instance_mismatch') {
      setErrorMessage(
        'Signed out for safety: a response was received from a different instance than expected. Please sign in again.'
      );
    } else if (error === 'invalid_state' || error === 'state_expired') {
      setErrorMessage('Login session expired. Please try again.');
    } else if (error === 'token_exchange_failed') {
      setErrorMessage('Failed to authenticate with Google. Please try again.');
    } else if (error === 'no_credentials') {
      setErrorMessage(
        'Google OAuth is not configured yet. Upload credentials.json on the Integrations page first, then add an allowed user on the Configuration page.'
      );
    } else if (error) {
      setErrorMessage(`Authentication error: ${error}`);
    }
  }, [error, email, setup]);

  const handleLogin = () => {
    window.location.href = `${API_BASE}/api/auth/login`;
  };

  
  
  
  if (authLoading || teamName === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="cloud-text-muted" style={{ fontSize: 13 }}>
          Loading…
        </p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ padding: 24 }}
    >
      <div className="login-stack">
        <div className="login-lockup-wrap">
          <Image
            src="/logo-lockup.svg"
            alt="BeStrong HQ"
            width={220}
            height={32}
            className="login-lockup"
            priority
          />
        </div>
        <div
        className="w-full max-w-sm cloud-panel-raised"
        style={{ padding: 32 }}
      >
        <div className="text-center" style={{ marginBottom: 28 }}>
          <h1
            className="cloud-text font-semibold"
            style={{ fontSize: 26, letterSpacing: '-0.03em', lineHeight: 1.1 }}
          >
            {teamName}
          </h1>
        </div>

        {}
        {successMessage && (
          <div
            className="rounded-lg"
            style={{
              marginBottom: 20,
              padding: '10px 14px',
              fontSize: 13,
              lineHeight: 1.45,
              backgroundColor: 'rgba(34, 197, 94, 0.08)',
              border: '1px solid rgba(34, 197, 94, 0.28)',
              color: '#86efac',
            }}
          >
            {successMessage}
          </div>
        )}

        {}
        {errorMessage && (
          <div
            className="rounded-lg"
            style={{
              marginBottom: 20,
              padding: '10px 14px',
              fontSize: 13,
              lineHeight: 1.45,
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.28)',
              color: '#fca5a5',
            }}
          >
            {errorMessage}
          </div>
        )}

        <button
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-3 rounded-lg font-medium transition-opacity hover:opacity-90"
          style={{
            padding: '11px 16px',
            fontSize: 14,
            backgroundColor: '#ffffff',
            color: '#1f2937',
            border: '1px solid #e5e7eb',
          }}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Sign in with Google
        </button>

        <p
          className="cloud-text-dim text-center"
          style={{ fontSize: 11, marginTop: 20, letterSpacing: '0.02em' }}
        >
          Only authorized accounts can sign in.
        </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="cloud-text-muted" style={{ fontSize: 13 }}>Loading…</p>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
