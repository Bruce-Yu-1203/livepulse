'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { accountInitial, displayNameFromEmail } from '../lib/auth-session';
import { AuthEntryLink } from './auth-dialog-provider';
import { useAuthSession } from './auth-session-provider';

export function AuthNavigation() {
  const { session, signOut, signingOut, signOutError } = useAuthSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  if (session.status === 'loading') {
    return (
      <span
        aria-label="Checking your session"
        className="h-10 w-24 animate-pulse rounded-full bg-fg/8 motion-reduce:animate-none"
      />
    );
  }

  if (session.status === 'anonymous') {
    return (
      <AuthEntryLink className="site-signin rounded-lg px-4 py-2.5 font-bold transition">
        Sign in
      </AuthEntryLink>
    );
  }

  const displayName =
    session.user.username ?? displayNameFromEmail(session.user.email);

  return (
    <div className="account-control" ref={menuRef}>
      <button
        aria-controls={menuOpen ? 'account-menu' : undefined}
        aria-expanded={menuOpen}
        aria-haspopup="true"
        aria-label={`Account menu for ${session.user.email}`}
        className="account-trigger"
        onClick={() => setMenuOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <AccountAvatar
          email={session.user.email}
          name={displayName}
          url={session.user.avatarUrl}
        />
        <span className="account-trigger-name">{displayName}</span>
        <span aria-hidden="true" className="account-chevron">
          ⌄
        </span>
      </button>

      {menuOpen ? (
        <div className="account-menu" id="account-menu">
          <div className="account-menu-identity">
            <AccountAvatar
              email={session.user.email}
              large
              name={displayName}
              url={session.user.avatarUrl}
            />
            <div>
              <strong>{displayName}</strong>
              <span>{session.user.email}</span>
            </div>
          </div>
          <div className="account-menu-links">
            <Link href="/" onClick={() => setMenuOpen(false)}>
              <AccountIcon name="rooms" /> Browse rooms
            </Link>
            {['ADMIN', 'HOST'].includes(session.user.role) ? (
              <Link href="/studio" onClick={() => setMenuOpen(false)}>
                <AccountIcon name="studio" /> Creator studio
              </Link>
            ) : null}
            {session.user.role === 'ADMIN' ? (
              <Link href="/admin" onClick={() => setMenuOpen(false)}>
                <AccountIcon name="moderation" /> Moderation
              </Link>
            ) : null}
            <Link href="/settings" onClick={() => setMenuOpen(false)}>
              <AccountIcon name="settings" /> Settings
            </Link>
          </div>
          <div className="account-menu-footer">
            <button
              disabled={signingOut}
              onClick={() => void signOut()}
              type="button"
            >
              <AccountIcon name="signout" />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
            {signOutError ? <p role="status">{signOutError}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AccountIcon({
  name,
}: {
  name: 'rooms' | 'studio' | 'moderation' | 'settings' | 'signout';
}) {
  const paths = {
    rooms: 'M3 10.5 12 3l9 7.5M5 9v11h14V9M9 20v-7h6v7',
    studio: 'M4 5h16v14H4zM8 9h8m-8 4h5',
    moderation:
      'M12 3 4 6v6c0 5 3.2 8 8 10 4.8-2 8-5 8-10V6l-8-3Zm-3 9 2 2 4-4',
    settings:
      'M12 3v2m0 14v2M4.2 7.5l1.7 1m12.2 7 1.7 1M3 12h2m14 0h2M4.2 16.5l1.7-1m12.2-7 1.7-1M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
    signout: 'M10 4H5v16h5m4-4 4-4-4-4m4 4H9',
  };

  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function AccountAvatar({
  email,
  large = false,
  name,
  url,
}: {
  email: string;
  large?: boolean;
  name: string;
  url?: string | null;
}) {
  return (
    <span
      aria-hidden="true"
      className={`account-avatar ${large ? 'account-avatar-large' : ''}`}
    >
      {url ? (
        <img alt="" src={url} />
      ) : (
        name.charAt(0).toUpperCase() || accountInitial(email)
      )}
    </span>
  );
}
