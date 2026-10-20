'use client';

import { CurrentUserResponseSchema } from '@livepulse/contracts';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { AuthSessionSnapshot } from '../lib/auth-session';
import {
  ClientApiError,
  clientApiRequest,
  clientApiVoidRequest,
} from '../lib/client-api';

interface AuthSessionContextValue {
  session: AuthSessionSnapshot;
  signOut(): Promise<void>;
  signingOut: boolean;
  signOutError?: string;
}

const AuthSessionContext = createContext<AuthSessionContextValue | undefined>(
  undefined,
);

export function AuthSessionProvider({
  children,
  initialSession = { status: 'loading' },
}: {
  children: ReactNode;
  initialSession?: AuthSessionSnapshot;
}) {
  const [session, setSession] = useState<AuthSessionSnapshot>(initialSession);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string>();

  const refreshSession = useCallback(async () => {
    try {
      const response = await clientApiRequest(
        '/api/v1/auth/me',
        CurrentUserResponseSchema,
      );
      setSession({ status: 'authenticated', user: response.user });
    } catch (error) {
      setSession((current) =>
        error instanceof ClientApiError &&
        error.status !== 401 &&
        current.status === 'authenticated'
          ? current
          : { status: 'anonymous' },
      );
    }
  }, []);

  useEffect(() => {
    void refreshSession();

    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') {
        void refreshSession();
      }
    }

    window.addEventListener('focus', refreshSession);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.removeEventListener('focus', refreshSession);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refreshSession]);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    setSignOutError(undefined);

    try {
      await clientApiVoidRequest('/api/v1/auth/sign-out', { method: 'POST' });
      setSession({ status: 'anonymous' });
      window.location.assign('/');
    } catch (error) {
      setSignOutError(
        error instanceof Error ? error.message : 'Sign out failed. Try again.',
      );
    } finally {
      setSigningOut(false);
    }
  }, []);

  const value = useMemo(
    () => ({ session, signOut, signingOut, signOutError }),
    [session, signOut, signingOut, signOutError],
  );

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession(): AuthSessionContextValue {
  const context = useContext(AuthSessionContext);

  if (!context) {
    throw new Error('useAuthSession must be used within AuthSessionProvider');
  }

  return context;
}
