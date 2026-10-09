import { timingSafeEqual } from 'node:crypto';

import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ApiErrorCode } from '@livepulse/contracts';
import type { FastifyRequest } from 'fastify';

import type { AuthenticatedRequest } from './authenticated-request.js';
import {
  anonymousCsrfContext,
  AuthTokenService,
  csrfCookieName,
  refreshCookieName,
} from './auth-token.service.js';

export const csrfHeaderName = 'x-csrf-token';

@Injectable()
export class CsrfGuard implements CanActivate {
  public constructor(
    @Inject(AuthTokenService) private readonly tokens: AuthTokenService,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const cookieToken = request.cookies[csrfCookieName];
    const headerToken = request.headers[csrfHeaderName];
    const origin = request.headers.origin;
    const sessionContext =
      (request as Partial<AuthenticatedRequest>).auth?.sessionId ??
      this.tokens.readRefreshSessionId(request.cookies[refreshCookieName]) ??
      anonymousCsrfContext;

    if (
      typeof headerToken !== 'string' ||
      typeof cookieToken !== 'string' ||
      origin !== this.tokens.trustedWebOrigin ||
      !constantTimeEqual(cookieToken, headerToken) ||
      !this.tokens.verifyCsrfToken(cookieToken, sessionContext)
    ) {
      throw new HttpException(
        {
          code: ApiErrorCode.CsrfValidationFailed,
          message: 'CSRF validation failed',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}

function constantTimeEqual(first: string, second: string): boolean {
  const firstBuffer = Buffer.from(first, 'utf8');
  const secondBuffer = Buffer.from(second, 'utf8');

  return (
    firstBuffer.length === secondBuffer.length &&
    timingSafeEqual(firstBuffer, secondBuffer)
  );
}
