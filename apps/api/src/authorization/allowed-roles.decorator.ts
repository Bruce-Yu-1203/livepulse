import { SetMetadata } from '@nestjs/common';

import type { AuthenticatedPrincipal } from '../auth/authenticated-request.js';

export type AuthenticatedRole = AuthenticatedPrincipal['role'];

export const allowedRolesMetadataKey = Symbol('allowedRoles');

export const AllowedRoles = (...roles: AuthenticatedRole[]) =>
  SetMetadata(allowedRolesMetadataKey, roles);
