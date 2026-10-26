import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { AvatarController } from '../auth/avatar.controller.js';
import type { AvatarService } from '../auth/avatar.service.js';
import { ReportsController } from '../reports/reports.controller.js';
import type { ReportsService } from '../reports/reports.service.js';
import type { HttpRateLimiter } from './http-rate-limiter.js';

describe('authenticated endpoint quotas', () => {
  const request = {
    auth: { userId: 'user-one' },
    id: 'request-1',
  } as AuthenticatedRequest;

  it('blocks avatar uploads before storage is called', async () => {
    const upload = vi.fn();
    const consumeIdentity = vi.fn().mockResolvedValue(1_000);
    const controller = new AvatarController(
      { upload } as unknown as AvatarService,
      { consumeIdentity } as unknown as HttpRateLimiter,
    );

    await expect(controller.upload({}, request)).rejects.toMatchObject({
      status: 429,
    });
    expect(consumeIdentity).toHaveBeenCalledWith(
      'avatarUploadUser',
      'user-one',
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it('blocks report creation before a database write', async () => {
    const create = vi.fn();
    const consumeIdentity = vi.fn().mockResolvedValue(1_000);
    const controller = new ReportsController(
      { create } as unknown as ReportsService,
      { consumeIdentity } as unknown as HttpRateLimiter,
    );

    await expect(
      controller.create(
        {
          messageId: '11111111-1111-4111-8111-111111111111',
          reason: 'SPAM',
          roomId: '22222222-2222-4222-8222-222222222222',
        },
        request,
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(consumeIdentity).toHaveBeenCalledWith(
      'reportCreateUser',
      'user-one',
    );
    expect(create).not.toHaveBeenCalled();
  });
});
