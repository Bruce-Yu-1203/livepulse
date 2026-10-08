import { describe, expect, it } from 'vitest';

import {
  RoomStatus,
  RoomStatusSchema,
  UserRole,
  UserRoleSchema,
} from './roles-and-rooms.js';

describe('UserRoleSchema', () => {
  it('accepts every supported role', () => {
    expect(UserRoleSchema.options).toEqual([
      'GUEST',
      'VIEWER',
      'HOST',
      'ADMIN',
    ]);
    expect(UserRole.HOST).toBe('HOST');
  });

  it('rejects an unknown role', () => {
    expect(UserRoleSchema.safeParse('OWNER').success).toBe(false);
  });
});

describe('RoomStatusSchema', () => {
  it('accepts every supported room status', () => {
    expect(RoomStatusSchema.options).toEqual(['DRAFT', 'LIVE', 'ENDED']);
    expect(RoomStatus.LIVE).toBe('LIVE');
  });

  it('rejects an unknown room status', () => {
    expect(RoomStatusSchema.safeParse('PAUSED').success).toBe(false);
  });
});
