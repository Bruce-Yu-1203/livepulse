import { isIP } from 'node:net';

import type { FastifyRequest } from 'fastify';

export function getHttpClientIp(
  request: Pick<FastifyRequest, 'headers' | 'ip'>,
): string {
  if (process.env.RAILWAY_ENVIRONMENT_ID) {
    const railwayClientIp = request.headers['x-real-ip'];
    if (typeof railwayClientIp === 'string') {
      const normalizedIp = railwayClientIp.trim();
      if (isIP(normalizedIp)) return normalizedIp;
    }
  }

  return request.ip;
}
