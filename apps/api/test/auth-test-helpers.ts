import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { DatabaseClient } from '@livepulse/db';

import { ScryptPasswordHasher } from '../src/auth/password-hasher.js';
import { sessionCookieName } from '../src/auth/better-auth.service.js';

interface CredentialUserInput {
  email: string;
  id?: string;
  password: string;
  role?: 'ADMIN' | 'HOST' | 'VIEWER';
}

let nextSignInClient = 1;

export async function createCredentialUser(
  database: DatabaseClient,
  input: CredentialUserInput,
) {
  const user = await database.user.create({
    data: {
      email: input.email,
      ...(input.id ? { id: input.id } : {}),
      name: input.email.split('@')[0] ?? input.email,
      role: input.role ?? 'VIEWER',
    },
  });

  await database.account.create({
    data: {
      accountId: user.id,
      password: await new ScryptPasswordHasher().hash(input.password),
      providerId: 'credential',
      userId: user.id,
    },
  });

  return user;
}

export function signIn(
  app: NestFastifyApplication,
  email: string,
  password: string,
) {
  const clientAddress = `198.51.100.${nextSignInClient}`;
  nextSignInClient = (nextSignInClient % 254) + 1;
  return app
    .getHttpAdapter()
    .getInstance()
    .inject({
      headers: { origin: 'http://localhost:3000' },
      method: 'POST',
      payload: { email, password },
      remoteAddress: clientAddress,
      url: '/api/v1/auth/sign-in/email',
    });
}

export function sessionCookie(response: {
  headers: Record<string, number | string | string[] | undefined>;
}): string {
  const header = response.headers['set-cookie'];
  const cookies = Array.isArray(header)
    ? header
    : typeof header === 'string'
      ? [header]
      : [];
  const cookie = cookies.find((candidate) =>
    candidate.startsWith(`${sessionCookieName}=`),
  );

  if (!cookie) {
    throw new Error(`Expected the ${sessionCookieName} cookie`);
  }

  return cookie;
}

export function cookiePair(setCookie: string): string {
  return setCookie.split(';', 1)[0] ?? '';
}
