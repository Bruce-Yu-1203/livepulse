import { describe, expect, it } from 'vitest';

import {
  accountDestinationForRole,
  accountInitial,
  displayNameFromEmail,
} from './auth-session';

describe('accountDestinationForRole', () => {
  it('routes each authenticated role to a useful landing page', () => {
    expect(accountDestinationForRole('VIEWER')).toEqual({
      href: '/',
      label: 'Home',
    });
    expect(accountDestinationForRole('HOST')).toEqual({
      href: '/studio',
      label: 'Studio',
    });
    expect(accountDestinationForRole('ADMIN')).toEqual({
      href: '/admin',
      label: 'Moderation',
    });
  });
});

describe('account presentation', () => {
  it('turns an email address into a concise account identity', () => {
    expect(displayNameFromEmail('bruce.yu@example.com')).toBe('Bruce Yu');
    expect(accountInitial('bruce.yu@example.com')).toBe('B');
  });
});
