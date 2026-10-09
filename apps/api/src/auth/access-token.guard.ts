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

import type {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
} from './authenticated-request.js';
import { accessCookieName, AuthTokenService } from './auth-token.service.js';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const roles = new Set(['ADMIN', 'HOST', 'VIEWER']);

@Injectable()
export class AccessTokenGuard implements CanActivate {
  public constructor(
    @Inject(AuthTokenService) private readonly tokens: AuthTokenService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = request.cookies[accessCookieName];

    if (!token) {
      this.throwUnauthorized();
    }

    try {
      const verified = await this.tokens.verifyAccessToken(token);
      const principal = this.toPrincipal(verified.payload);

      if (!principal) {
        this.throwUnauthorized();
      }

      (request as AuthenticatedRequest).auth = principal;
      return true;
    } catch {
      this.throwUnauthorized();
    }
  }

  private toPrincipal(payload: {
    role?: unknown;
    sid?: unknown;
    sub?: string;
  }): AuthenticatedPrincipal | undefined {
    if (
      !payload.sub ||
      !uuidPattern.test(payload.sub) ||
      typeof payload.sid !== 'string' ||
      !uuidPattern.test(payload.sid) ||
      typeof payload.role !== 'string' ||
      !roles.has(payload.role)
    ) {
      return undefined;
    }

    return {
      role: payload.role as AuthenticatedPrincipal['role'],
      sessionId: payload.sid,
      userId: payload.sub,
    };
  }

  private throwUnauthorized(): never {
    throw new HttpException(
      {
        code: ApiErrorCode.Unauthorized,
        message: 'Authentication is required',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}
