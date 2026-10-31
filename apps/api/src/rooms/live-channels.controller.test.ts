import type { FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import type { BetterAuthService } from '../auth/better-auth.service.js';
import { LiveChannelsController } from './live-channels.controller.js';
import type { LiveChannelsService } from './live-channels.service.js';

describe('LiveChannelsController', () => {
  it('uses the viewer identity when available and includes the request ID', async () => {
    const list = vi.fn().mockResolvedValue([]);
    const principalFromHeaders = vi
      .fn()
      .mockResolvedValue({ userId: 'viewer' });
    const controller = new LiveChannelsController(
      { list } as unknown as LiveChannelsService,
      { principalFromHeaders } as unknown as BetterAuthService,
    );
    const request = { headers: {}, id: 'request-1' } as FastifyRequest;

    expect(await controller.list(request)).toEqual({
      items: [],
      requestId: 'request-1',
    });
    expect(list).toHaveBeenCalledWith('viewer');
  });

  it('shows public channels when there is no valid session', async () => {
    const list = vi.fn().mockResolvedValue([]);
    const principalFromHeaders = vi
      .fn()
      .mockRejectedValue(new Error('No session'));
    const controller = new LiveChannelsController(
      { list } as unknown as LiveChannelsService,
      { principalFromHeaders } as unknown as BetterAuthService,
    );
    await controller.list({ headers: {}, id: 'request-2' } as FastifyRequest);
    expect(list).toHaveBeenCalledWith(undefined);
  });
});
