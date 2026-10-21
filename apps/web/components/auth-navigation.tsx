'use client';

import Link from 'next/link';

import {
  accountDestinationForRole,
  accountInitial,
  displayNameFromEmail,
} from '../lib/auth-session';
import { useAuthSession } from './auth-session-provider';

export function AuthNavigation() {
  const { session, signOut, signingOut, signOutError } = useAuthSession();

  if (session.status === 'loading') {
    return (
      <span
        aria-label="Checking your session"
        className="h-10 w-24 animate-pulse rounded-full bg-white/8 motion-reduce:animate-none"
      />
    );
  }

  if (session.status === 'anonymous') {
    return (
      <Link
        className="site-signin rounded-lg px-4 py-2.5 font-bold transition"
        href="/auth"
      >
        Sign in
      </Link>
    );
  }

  const destination = accountDestinationForRole(session.user.role);
  const displayName = displayNameFromEmail(session.user.email);

  return (
    <div className="flex items-center gap-2">
      {session.user.role === 'ADMIN' ? (
        <Link
          className="hidden rounded-full px-3 py-2 text-zinc-300 transition hover:bg-white/8 hover:text-white lg:inline-flex"
          href="/admin"
        >
          Moderation
        </Link>
      ) : null}
      {['ADMIN', 'HOST'].includes(session.user.role) ? (
        <Link
          className="hidden rounded-full px-3 py-2 text-zinc-300 transition hover:bg-white/8 hover:text-white md:inline-flex"
          href="/studio"
        >
          Studio
        </Link>
      ) : null}
      <Link
        aria-label={`${destination.label} for ${session.user.email}`}
        className="group flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] p-1 pr-2.5 transition hover:border-cyan-300/30 hover:bg-white/10 sm:pr-4"
        href={destination.href}
      >
        <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-cyan-200 to-violet-300 text-xs font-black text-zinc-950 shadow-[0_0_20px_rgba(103,232,249,0.16)]">
          {accountInitial(session.user.email)}
        </span>
        <span className="hidden max-w-28 truncate text-sm font-semibold text-white sm:inline">
          {displayName}
        </span>
      </Link>
      <button
        aria-label={signOutError ? 'Retry sign out' : 'Sign out'}
        className={`grid size-10 place-items-center rounded-full border transition disabled:cursor-wait disabled:opacity-50 ${
          signOutError
            ? 'border-rose-300/30 bg-rose-300/10 text-rose-200'
            : 'border-white/10 text-zinc-400 hover:border-white/20 hover:bg-white/8 hover:text-white'
        }`}
        disabled={signingOut}
        onClick={() => void signOut()}
        title={signOutError ?? 'Sign out'}
        type="button"
      >
        {signingOut ? (
          <span className="size-4 animate-spin rounded-full border-2 border-zinc-500 border-t-white motion-reduce:animate-none" />
        ) : (
          <SignOutIcon />
        )}
      </button>
      {signOutError ? <span className="sr-only">{signOutError}</span> : null}
    </div>
  );
}

function SignOutIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M14 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2m-4-4h11m0 0-3-3m3 3-3 3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
