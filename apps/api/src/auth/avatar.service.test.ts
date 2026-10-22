import { S3Client } from '@aws-sdk/client-s3';
import { HttpException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service.js';
import type { BetterAuthService } from './better-auth.service.js';
import {
  AvatarService,
  decodeAvatar,
  maximumAvatarBytes,
} from './avatar.service.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('decodeAvatar', () => {
  it('accepts image bytes that match the declared format', () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    expect(decodeAvatar(png.toString('base64'), 'image/png')).toEqual(png);
    const jpeg = Buffer.from([255, 216, 255, 224, 1]);
    expect(decodeAvatar(jpeg.toString('base64'), 'image/jpeg')).toEqual(jpeg);
    const webp = Buffer.from('RIFF0000WEBP', 'ascii');
    expect(decodeAvatar(webp.toString('base64'), 'image/webp')).toEqual(webp);
  });

  it('rejects renamed or oversized files and invalid base64', () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(() => decodeAvatar(png.toString('base64'), 'image/jpeg')).toThrow(
      HttpException,
    );
    expect(() => decodeAvatar('not base64', 'image/png')).toThrow(
      HttpException,
    );
    const oversized = Buffer.concat([
      png,
      Buffer.alloc(maximumAvatarBytes - png.length + 1),
    ]);
    expect(() =>
      decodeAvatar(oversized.toString('base64'), 'image/png'),
    ).toThrow(HttpException);
  });
});

describe('AvatarService', () => {
  const userId = '295d5bd9-d9da-44b2-8f5d-8839f13a4437';
  const key = `avatars/${userId}/avatar`;
  const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function createService() {
    vi.stubEnv('AWS_REGION', 'ca-central-1');
    vi.stubEnv('S3_BUCKET', 'livepulse-assets-bruce-2026');
    const update = vi.fn().mockResolvedValue({
      updatedAt: new Date('2026-10-22T12:00:00.000Z'),
    });
    const findUnique = vi.fn().mockResolvedValue({ avatarKey: key });
    const database = {
      client: { user: { findUnique, update } },
    } as unknown as DatabaseService;
    const authentication = {
      apiOrigin: 'https://api.livepulse.tech',
    } as BetterAuthService;
    return { service: new AvatarService(database, authentication), update };
  }

  it('uploads only to the current user avatar key and returns a versioned URL', async () => {
    const send = vi
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({} as never);
    const { service, update } = createService();

    const avatarUrl = await service.upload(userId, {
      contentType: 'image/png',
      data: image.toString('base64'),
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Body: image,
          Bucket: 'livepulse-assets-bruce-2026',
          ContentType: 'image/png',
          Key: key,
        }),
      }),
    );
    expect(update).toHaveBeenCalledWith({
      data: { avatarKey: key },
      select: { updatedAt: true },
      where: { id: userId },
    });
    expect(avatarUrl).toBe(
      `https://api.livepulse.tech/api/v1/users/${userId}/avatar?v=1792670400000`,
    );
  });

  it('reads a private object through the API', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      Body: { transformToByteArray: async () => image },
      ContentLength: image.length,
      ContentType: 'image/png',
    } as never);
    const { service } = createService();

    expect(await service.read(userId)).toEqual({
      body: image,
      contentType: 'image/png',
    });
  });
});
