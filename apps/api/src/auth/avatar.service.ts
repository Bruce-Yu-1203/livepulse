import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ApiErrorCode, AvatarUploadRequestSchema } from '@livepulse/contracts';

import { DatabaseService } from '../database/database.service.js';
import { BetterAuthService } from './better-auth.service.js';

export const maximumAvatarBytes = 2 * 1024 * 1024;
const avatarContentTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;

@Injectable()
export class AvatarService {
  private readonly bucket = process.env.S3_BUCKET?.trim();
  private readonly client = process.env.AWS_REGION?.trim()
    ? new S3Client({ region: process.env.AWS_REGION.trim() })
    : undefined;

  public constructor(
    private readonly database: DatabaseService,
    private readonly authentication: BetterAuthService,
  ) {}

  public async upload(userId: string, input: unknown): Promise<string> {
    const parsed = AvatarUploadRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw invalidAvatar('Choose a JPEG, PNG, or WebP image up to 2 MB.');
    }

    const image = decodeAvatar(parsed.data.data, parsed.data.contentType);
    const { client, bucket } = this.storage();
    const key = `avatars/${userId}/avatar`;

    try {
      await client.send(
        new PutObjectCommand({
          Body: image,
          Bucket: bucket,
          ContentType: parsed.data.contentType,
          Key: key,
        }),
      );
    } catch {
      throw storageUnavailable();
    }

    const user = await this.database.client.user.update({
      data: { avatarKey: key },
      select: { updatedAt: true },
      where: { id: userId },
    });
    return this.avatarUrl(userId, user.updatedAt);
  }

  public async read(userId: string): Promise<{
    body: Buffer;
    contentType: (typeof avatarContentTypes)[number];
  }> {
    const user = await this.database.client.user.findUnique({
      select: { avatarKey: true },
      where: { id: userId },
    });
    if (!user?.avatarKey) {
      throw new HttpException(
        { code: ApiErrorCode.NotFound, message: 'Avatar not found' },
        HttpStatus.NOT_FOUND,
      );
    }

    const { client, bucket } = this.storage();
    try {
      const object = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: user.avatarKey }),
      );
      const contentType = object.ContentType;
      if (
        !object.Body ||
        !avatarContentTypes.some((type) => type === contentType) ||
        (object.ContentLength ?? 0) > maximumAvatarBytes
      ) {
        throw storageUnavailable();
      }
      const body = Buffer.from(await object.Body.transformToByteArray());
      if (body.length > maximumAvatarBytes) throw storageUnavailable();
      return {
        body,
        contentType: contentType as (typeof avatarContentTypes)[number],
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw storageUnavailable();
    }
  }

  public avatarUrl(userId: string, updatedAt: Date): string {
    return new URL(
      `/api/v1/users/${encodeURIComponent(userId)}/avatar?v=${updatedAt.getTime()}`,
      this.authentication.apiOrigin,
    ).toString();
  }

  private storage(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucket) throw storageUnavailable();
    return { client: this.client, bucket: this.bucket };
  }
}

export function decodeAvatar(data: string, contentType: string): Buffer {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      data,
    )
  ) {
    throw invalidAvatar('The selected image could not be read.');
  }
  const image = Buffer.from(data, 'base64');
  if (image.length === 0 || image.length > maximumAvatarBytes) {
    throw invalidAvatar('Choose an image up to 2 MB.');
  }
  const valid =
    (contentType === 'image/jpeg' &&
      image.length >= 3 &&
      image[0] === 0xff &&
      image[1] === 0xd8 &&
      image[2] === 0xff) ||
    (contentType === 'image/png' &&
      image
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (contentType === 'image/webp' &&
      image.subarray(0, 4).toString() === 'RIFF' &&
      image.subarray(8, 12).toString() === 'WEBP');
  if (!valid) throw invalidAvatar('The selected file is not a valid image.');
  return image;
}

function invalidAvatar(message: string): HttpException {
  return new HttpException(
    { code: ApiErrorCode.ValidationError, message },
    HttpStatus.BAD_REQUEST,
  );
}

function storageUnavailable(): HttpException {
  return new HttpException(
    {
      code: ApiErrorCode.ServiceUnavailable,
      message: 'Avatar storage is unavailable. Please try again later.',
    },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}
