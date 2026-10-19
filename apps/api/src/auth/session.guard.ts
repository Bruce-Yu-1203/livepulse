import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ApiErrorCode } from '@livepulse/contracts';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest } from 'fastify';

import type { AuthenticatedRequest } from './authenticated-request.js';
import { BetterAuthService } from './better-auth.service.js';

@Injectable()
export class SessionGuard implements CanActivate {
  public constructor(private readonly authentication: BetterAuthService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    try {
      const principal = await this.authentication.principalFromHeaders(
        fromNodeHeaders(request.headers),
      );

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
