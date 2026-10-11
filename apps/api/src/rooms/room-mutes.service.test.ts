import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedPrincipal } from '../auth/authenticated-request.js';
import type {
  RoomMuteRecord,
  RoomMutesRepository,
} from './room-mutes.repository.js';
import { RoomMutesService } from './room-mutes.service.js';
import {
  RoomForbiddenError,
  RoomMuteSelfError,
  RoomMuteTargetNotFoundError,
  RoomNotFoundError,
} from './rooms.errors.js';
import type { RoomsRepository } from './rooms.repository.js';

const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const hostId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const viewerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('RoomMutesService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T20:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('lets the room host create an expiring audited mute', async () => {
    const stored = muteRecord();
    const mutes = muteRepository({
      mute: vi.fn().mockResolvedValue(stored),
      userExists: vi.fn().mockResolvedValue(true),
    });
    const service = new RoomMutesService(mutes, roomRepository());

    await expect(
      service.mute(principal(hostId, 'HOST'), roomId, {
        durationMinutes: 10,
        userId: viewerId,
      }),
    ).resolves.toEqual(stored);
    expect(mutes.mute).toHaveBeenCalledWith({
      effectiveAt: new Date('2026-10-10T20:00:00.000Z'),
      expiresAt: new Date('2026-10-10T20:10:00.000Z'),
      mutedBy: hostId,
      roomId,
      userId: viewerId,
    });
  });

  it('lets an administrator moderate a room they do not own', async () => {
    const mutes = muteRepository({
      mute: vi.fn().mockResolvedValue(muteRecord()),
      userExists: vi.fn().mockResolvedValue(true),
    });
    const service = new RoomMutesService(mutes, roomRepository());

    await expect(
      service.mute(
        principal('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'ADMIN'),
        roomId,
        { durationMinutes: 5, userId: viewerId },
      ),
    ).resolves.toMatchObject({ roomId, userId: viewerId });
  });

  it('rejects another host and a missing room', async () => {
    const mutes = muteRepository();
    const service = new RoomMutesService(mutes, roomRepository());

    await expect(
      service.mute(
        principal('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'HOST'),
        roomId,
        { durationMinutes: 10, userId: viewerId },
      ),
    ).rejects.toBeInstanceOf(RoomForbiddenError);

    const missing = new RoomMutesService(
      mutes,
      roomRepository({ findById: vi.fn().mockResolvedValue(undefined) }),
    );
    await expect(
      missing.mute(principal(hostId, 'HOST'), roomId, {
        durationMinutes: 10,
        userId: viewerId,
      }),
    ).rejects.toBeInstanceOf(RoomNotFoundError);
  });

  it('rejects self-mutes and unknown target users', async () => {
    const service = new RoomMutesService(
      muteRepository({ userExists: vi.fn().mockResolvedValue(false) }),
      roomRepository(),
    );

    await expect(
      service.mute(principal(hostId, 'HOST'), roomId, {
        durationMinutes: 10,
        userId: hostId,
      }),
    ).rejects.toBeInstanceOf(RoomMuteSelfError);
    await expect(
      service.mute(principal(hostId, 'HOST'), roomId, {
        durationMinutes: 10,
        userId: viewerId,
      }),
    ).rejects.toBeInstanceOf(RoomMuteTargetNotFoundError);
  });
});

function muteRecord(): RoomMuteRecord {
  return {
    effectiveAt: new Date('2026-10-10T20:00:00.000Z'),
    expiresAt: new Date('2026-10-10T20:10:00.000Z'),
    mutedBy: hostId,
    roomId,
    userId: viewerId,
  };
}

function principal(
  userId: string,
  role: AuthenticatedPrincipal['role'],
): AuthenticatedPrincipal {
  return {
    role,
    sessionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    userId,
  };
}

function muteRepository(
  overrides: Partial<RoomMutesRepository> = {},
): RoomMutesRepository {
  return {
    mute: vi.fn(),
    userExists: vi.fn(),
    ...overrides,
  };
}

function roomRepository(
  overrides: Partial<RoomsRepository> = {},
): RoomsRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue({
      coverImageUrl: 'https://cdn.example.com/cover.jpg',
      createdAt: new Date('2026-10-10T19:00:00.000Z'),
      demoVideoUrl: 'https://video.example.com/demo.mp4',
      description: 'A moderated room',
      hostId,
      id: roomId,
      likeCount: 0,
      status: 'LIVE',
      title: 'Moderation lab',
      updatedAt: new Date('2026-10-10T19:00:00.000Z'),
      version: 1,
    }),
    findVisibleById: vi.fn(),
    listOwned: vi.fn(),
    listVisible: vi.fn(),
    update: vi.fn(),
    ...overrides,
  };
}
