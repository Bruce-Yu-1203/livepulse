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
import { accessCookieName, AuthTokenService } from './auth-token.service.js';

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
      const principal = await this.tokens.verifyAccessPrincipal(token);

      if (!principal) {
        this.throwUnauthorized();
      }

      (request as AuthenticatedRequest).auth = principal;
      return true;
    } catch {
      this.throwUnauthorized();
    }
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
