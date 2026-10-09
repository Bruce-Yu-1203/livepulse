import type { FastifyRequest } from 'fastify';

export interface AuthenticatedPrincipal {
  role: 'ADMIN' | 'HOST' | 'VIEWER';
  sessionId: string;
  userId: string;
}

export interface AuthenticatedRequest extends FastifyRequest {
  auth: AuthenticatedPrincipal;
}
