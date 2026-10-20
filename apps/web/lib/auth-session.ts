import type { CurrentUserResponse, UserRole } from '@livepulse/contracts';

export type AuthenticatedUser = CurrentUserResponse['user'];

export type AuthSessionSnapshot =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: AuthenticatedUser };

export interface AccountDestination {
  href: '/' | '/admin' | '/studio';
  label: 'Home' | 'Moderation' | 'Studio';
}

export function accountDestinationForRole(role: UserRole): AccountDestination {
  if (role === 'ADMIN') {
    return { href: '/admin', label: 'Moderation' };
  }

  if (role === 'HOST') {
    return { href: '/studio', label: 'Studio' };
  }

  return { href: '/', label: 'Home' };
}

export function displayNameFromEmail(email: string): string {
  const localPart = email.split('@')[0]?.trim();

  if (!localPart) {
    return 'Account';
  }

  return localPart
    .split(/[._-]+/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function accountInitial(email: string): string {
  return displayNameFromEmail(email).charAt(0).toUpperCase() || 'A';
}
