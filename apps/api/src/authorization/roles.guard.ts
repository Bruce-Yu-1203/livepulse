import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiErrorCode } from '@livepulse/contracts';

import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import {
  allowedRolesMetadataKey,
  type AuthenticatedRole,
} from './allowed-roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  public constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const allowedRoles = this.reflector.getAllAndOverride<
      readonly AuthenticatedRole[]
    >(allowedRolesMetadataKey, [context.getHandler(), context.getClass()]);

    if (!allowedRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!allowedRoles.includes(request.auth.role)) {
      throw new HttpException(
        {
          code: ApiErrorCode.Forbidden,
          message: 'The current role cannot perform this action',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
