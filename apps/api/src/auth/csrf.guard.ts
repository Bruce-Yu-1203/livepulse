import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ApiErrorCode } from '@livepulse/contracts';
import type { FastifyRequest } from 'fastify';

import { BetterAuthService } from './better-auth.service.js';

@Injectable()
export class CsrfGuard implements CanActivate {
  public constructor(private readonly authentication: BetterAuthService) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    if (request.headers.origin !== this.authentication.trustedWebOrigin) {
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
