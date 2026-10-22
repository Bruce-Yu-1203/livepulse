'use client';

import Link from 'next/link';

import {
  accountDestinationForRole,
  displayNameFromEmail,
} from '../lib/auth-session';
import { AuthEntryLink } from './auth-dialog-provider';
import { useAuthSession } from './auth-session-provider';

const actionClassName = 'home-secondary-action';

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
      <AuthEntryLink className={actionClassName} mode="register">
        Join LivePulse
      </AuthEntryLink>
    );
  }

  if (session.user.role === 'VIEWER' || session.user.role === 'GUEST') {
    return (
      <a className={actionClassName} href="#rooms">
        Browse as{' '}
        {session.user.username ?? displayNameFromEmail(session.user.email)}
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
