import { describe, expect, it } from 'vitest';

import {
  MuteRoomUserRequestSchema,
  MuteRoomUserResponseSchema,
} from './moderation.js';

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('room moderation contracts', () => {
  it('accepts a bounded mute request and response', () => {
    expect(
      MuteRoomUserRequestSchema.parse({ durationMinutes: 10, userId }),
    ).toEqual({ durationMinutes: 10, userId });

    const response = {
      mute: {
        effectiveAt: '2026-10-10T20:00:00.000Z',
        expiresAt: '2026-10-10T20:10:00.000Z',
        mutedBy: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        roomId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        userId,
      },
      requestId: 'request-mute-1',
    };

    expect(MuteRoomUserResponseSchema.parse(response)).toEqual(response);
  });

  it.each([
    { durationMinutes: 0, userId },
    { durationMinutes: 1_441, userId },
    { durationMinutes: 1.5, userId },
    { durationMinutes: 10, userId: 'not-a-uuid' },
    { durationMinutes: 10, extra: true, userId },
  ])('rejects an invalid mute request: %o', (request) => {
    expect(MuteRoomUserRequestSchema.safeParse(request).success).toBe(false);
  });
});
