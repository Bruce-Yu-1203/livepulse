import { afterEach, describe, expect, it } from 'vitest';
import { TokenVerifier } from 'livekit-server-sdk';

import { BroadcastConfigurationError } from './broadcast.errors.js';
import {
  BroadcastService,
  broadcastRoomName,
  resolveLiveKitConfig,
} from './broadcast.service.js';

const originalEnvironment = {
  apiKey: process.env.LIVEKIT_API_KEY,
  apiSecret: process.env.LIVEKIT_API_SECRET,
  serverUrl: process.env.LIVEKIT_URL,
};

afterEach(() => {
  restoreEnvironment('LIVEKIT_API_KEY', originalEnvironment.apiKey);
  restoreEnvironment('LIVEKIT_API_SECRET', originalEnvironment.apiSecret);
  restoreEnvironment('LIVEKIT_URL', originalEnvironment.serverUrl);
});

describe('BroadcastService', () => {
  it('creates a publish-capable host token for the mapped room', async () => {
    process.env.LIVEKIT_API_KEY = 'test-key';
    process.env.LIVEKIT_API_SECRET = 'test-secret-with-enough-entropy';
    process.env.LIVEKIT_URL = 'wss://livepulse.example.livekit.cloud';
    const service = new BroadcastService();

    const credentials = await service.createHostCredentials(
      '99d30467-ed47-43b8-96b0-d36ab2ee60e0',
      '295d5bd9-d9da-44b2-8f5d-8839f13a4437',
    );
    const claims = await new TokenVerifier(
      'test-key',
      'test-secret-with-enough-entropy',
    ).verify(credentials.participantToken);

    expect(credentials.serverUrl).toBe('wss://livepulse.example.livekit.cloud');
    expect(claims.sub).toBe('host-295d5bd9-d9da-44b2-8f5d-8839f13a4437');
    expect(claims.video).toMatchObject({
      canPublish: true,
      canPublishData: false,
      canSubscribe: true,
      room: 'livepulse-99d30467-ed47-43b8-96b0-d36ab2ee60e0',
      roomJoin: true,
    });
    expect(claims.video?.canPublishSources).toEqual([
      'camera',
      'microphone',
      'screen_share',
      'screen_share_audio',
    ]);
  });

  it('creates a subscribe-only viewer token with a unique identity', async () => {
    process.env.LIVEKIT_API_KEY = 'test-key';
    process.env.LIVEKIT_API_SECRET = 'test-secret-with-enough-entropy';
    process.env.LIVEKIT_URL = 'ws://localhost:7880';
    const service = new BroadcastService();

    const first = await service.createViewerCredentials(
      '99d30467-ed47-43b8-96b0-d36ab2ee60e0',
    );
    const second = await service.createViewerCredentials(
      '99d30467-ed47-43b8-96b0-d36ab2ee60e0',
    );
    const verifier = new TokenVerifier(
      'test-key',
      'test-secret-with-enough-entropy',
    );
    const firstClaims = await verifier.verify(first.participantToken);
    const secondClaims = await verifier.verify(second.participantToken);

    expect(firstClaims.sub).toMatch(/^viewer-/u);
    expect(firstClaims.sub).not.toBe(secondClaims.sub);
    expect(firstClaims.video).toMatchObject({
      canPublish: false,
      canPublishData: false,
      canSubscribe: true,
    });
  });
});

describe('LiveKit configuration', () => {
  it('maps application room identifiers without exposing client input', () => {
    expect(broadcastRoomName('99d30467-ed47-43b8-96b0-d36ab2ee60e0')).toBe(
      'livepulse-99d30467-ed47-43b8-96b0-d36ab2ee60e0',
    );
  });

  it('requires complete WebSocket configuration', () => {
    expect(() =>
      resolveLiveKitConfig({
        apiKey: undefined,
        apiSecret: undefined,
        serverUrl: undefined,
      }),
    ).toThrow(BroadcastConfigurationError);
    expect(() =>
      resolveLiveKitConfig({
        apiKey: 'key',
        apiSecret: 'secret',
        serverUrl: 'https://example.com',
      }),
    ).toThrow(BroadcastConfigurationError);
  });
});

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
