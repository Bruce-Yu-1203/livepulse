import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import {
  httpRateLimitPolicyForRequest,
  registerHttpRateLimitHook,
  resolveTrustedProxyCidrs,
} from './http-rate-limit-hook.js';

describe('HTTP rate limit routing', () => {
  it.each([
    ['/api/v1/auth/registration/start', 'registrationStart'],
    ['/api/v1/auth/registration/complete', 'registrationComplete'],
    ['/api/v1/auth/sign-in/email', 'signIn'],
    ['/api/v1/auth/sign-in/social?callback=x', 'signIn'],
    ['/api/v1/users/me/avatar', 'avatarUpload'],
    ['/api/v1/reports', 'reportCreate'],
  ] as const)('covers POST %s', (url, policy) => {
    expect(httpRateLimitPolicyForRequest('POST', url)).toBe(policy);
  });

  it.each([
    ['GET', '/api/v1/auth/sign-in/email'],
    ['POST', '/api/v1/auth/sign-up/email'],
    ['POST', '/api/v1/auth/sign-in/'],
    ['POST', '/api/v1/reports/anything'],
    ['GET', '/health/live'],
  ])('leaves %s %s outside these policies', (method, url) => {
    expect(httpRateLimitPolicyForRequest(method, url)).toBeUndefined();
  });

  it('accepts only explicit trusted proxy IPs and CIDRs', () => {
    expect(resolveTrustedProxyCidrs(undefined)).toBe(false);
    expect(resolveTrustedProxyCidrs('')).toBe(false);
    expect(resolveTrustedProxyCidrs('10.0.0.0/8, 127.0.0.1')).toBe(
      '10.0.0.0/8, 127.0.0.1',
    );
    expect(() => resolveTrustedProxyCidrs('all')).toThrow(
      'HTTP_TRUST_PROXY_CIDRS',
    );
    expect(() => resolveTrustedProxyCidrs('0.0.0.0/0')).toThrow(
      'HTTP_TRUST_PROXY_CIDRS',
    );
  });
});

describe('Fastify rate limit hook', () => {
  it('uses the trusted client IP and returns 429 before the handler', async () => {
    const consume = vi.fn().mockResolvedValue(2_100);
    const server = Fastify({ trustProxy: '10.0.0.0/8' });
    registerHttpRateLimitHook(server, { consume });
    server.post('/*', () => ({ reached: true }));

    try {
      const response = await server.inject({
        headers: { 'x-forwarded-for': '203.0.113.42' },
        method: 'POST',
        remoteAddress: '10.0.0.5',
        url: '/api/v1/auth/sign-in/email',
      });
      expect(response.statusCode).toBe(429);
      expect(response.headers['retry-after']).toBe('3');
      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.json()).toMatchObject({
        code: 'REQUEST_RATE_LIMITED',
        retryAfterMs: 2_100,
      });
      expect(consume).toHaveBeenCalledWith('signIn', '203.0.113.42');
    } finally {
      await server.close();
    }
  });

  it('rejects a protected request when Redis is unavailable', async () => {
    const server = Fastify();
    registerHttpRateLimitHook(server, {
      consume: vi.fn().mockRejectedValue(new Error('Redis offline')),
    });
    server.post('/*', () => ({ reached: true }));

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/reports',
      });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({
        code: 'SERVICE_UNAVAILABLE',
      });
    } finally {
      await server.close();
    }
  });

  it('ignores spoofed forwarding headers from an untrusted peer', async () => {
    const consume = vi.fn().mockResolvedValue(undefined);
    const server = Fastify({ trustProxy: '10.0.0.0/8' });
    registerHttpRateLimitHook(server, { consume });
    server.route({
      handler: () => ({ reached: true }),
      method: ['GET', 'POST'],
      url: '/*',
    });

    try {
      const protectedResponse = await server.inject({
        headers: { 'x-forwarded-for': '203.0.113.42' },
        method: 'POST',
        remoteAddress: '198.51.100.5',
        url: '/api/v1/auth/registration/start',
      });
      expect(protectedResponse.statusCode).toBe(200);
      expect(protectedResponse.json()).toEqual({ reached: true });
      expect(consume).toHaveBeenCalledWith('registrationStart', '198.51.100.5');

      consume.mockClear();
      const unprotectedResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/auth/providers',
      });
      expect(unprotectedResponse.statusCode).toBe(200);
      expect(consume).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });
});
