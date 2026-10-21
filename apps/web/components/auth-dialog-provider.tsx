'use client';

import Link from 'next/link';
import {
  createContext,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { AuthPanel, type AuthMode } from '../app/auth/auth-panel';
import { useAuthSession } from './auth-session-provider';

interface AuthDialogContextValue {
  openAuth(mode: AuthMode): void;
}

const AuthDialogContext = createContext<AuthDialogContextValue | null>(null);

export function AuthDialogProvider({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<AuthMode>('login');
  const [opening, setOpening] = useState(0);
  const { refreshSession } = useAuthSession();

  const openAuth = useCallback((nextMode: AuthMode) => {
    setMode(nextMode);
    setOpening((current) => current + 1);
  }, []);

  const closeAuth = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  useEffect(() => {
    if (opening === 0) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!dialog.open) dialog.showModal();
    const frame = requestAnimationFrame(() => {
      dialog.querySelector<HTMLInputElement>('input[name="email"]')?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [opening]);

  async function authenticated() {
    await refreshSession();
    window.dispatchEvent(new Event('livepulse:auth-changed'));
    closeAuth();
  }

  function closeFromBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) closeAuth();
  }

  return (
    <AuthDialogContext.Provider value={{ openAuth }}>
      {children}
      <dialog
        aria-label="Sign in or create an account"
        className="auth-modal"
        onClose={() => setOpening(0)}
        onClick={closeFromBackdrop}
        ref={dialogRef}
      >
        <div className="auth-modal-content">
          <button
            aria-label="Close sign-in dialog"
            className="auth-modal-close"
            onClick={closeAuth}
            type="button"
          >
            ×
          </button>
          {opening > 0 ? (
            <AuthPanel
              initialMode={mode}
              key={`${mode}-${opening}`}
              onAuthenticated={authenticated}
            />
          ) : null}
        </div>
      </dialog>
    </AuthDialogContext.Provider>
  );
}

export function AuthEntryLink({
  children,
  className,
  label,
  mode = 'login',
}: {
  children: ReactNode;
  className?: string;
  label?: string;
  mode?: AuthMode;
}) {
  const dialog = useContext(AuthDialogContext);

  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (
      !dialog ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    dialog.openAuth(mode);
  }

  return (
    <Link aria-label={label} className={className} href="/auth" onClick={open}>
      {children}
    </Link>
  );
}
