'use client';

import Link from 'next/link';

import {
  accountDestinationForRole,
  displayNameFromEmail,
} from '../lib/auth-session';
import { useAuthSession } from './auth-session-provider';

const actionClassName =
  'rounded-full border border-white/12 px-6 py-3 font-semibold text-white transition hover:border-white/25 hover:bg-white/5';

export function HomeAccountAction() {
  const { session } = useAuthSession();

  if (session.status === 'loading') {
    return (
      <span
        aria-label="Preparing account action"
        className="h-12 w-36 animate-pulse rounded-full bg-white/8 motion-reduce:animate-none"
      />
    );
  }

  if (session.status === 'anonymous') {
    return (
      <Link className={actionClassName} href="/auth">
        Join LivePulse
      </Link>
    );
  }

  if (session.user.role === 'VIEWER' || session.user.role === 'GUEST') {
    return (
      <a className={actionClassName} href="#rooms">
        Browse as {displayNameFromEmail(session.user.email)}
      </a>
    );
  }

  const destination = accountDestinationForRole(session.user.role);
  return (
    <Link className={actionClassName} href={destination.href}>
      Open {destination.label}
    </Link>
  );
}
