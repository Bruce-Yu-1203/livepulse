import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AccessToken, TrackSource } from 'livekit-server-sdk';

import { BroadcastConfigurationError } from './broadcast.errors.js';

interface LiveKitEnvironment {
  apiKey: string | undefined;
  apiSecret: string | undefined;
  serverUrl: string | undefined;
}

export interface BroadcastCredentials {
  participantToken: string;
  serverUrl: string;
}

@Injectable()
export class BroadcastService {
  public createHostCredentials(
    roomId: string,
    userId: string,
  ): Promise<BroadcastCredentials> {
    return this.createCredentials({
      canPublish: true,
      identity: `host-${userId}`,
      metadata: JSON.stringify({ role: 'host', userId }),
      roomId,
    });
  }

  public createViewerCredentials(
    roomId: string,
  ): Promise<BroadcastCredentials> {
    return this.createCredentials({
      canPublish: false,
      identity: `viewer-${randomUUID()}`,
      metadata: JSON.stringify({ role: 'viewer' }),
      roomId,
    });
  }

  private async createCredentials(input: {
    canPublish: boolean;
    identity: string;
    metadata: string;
    roomId: string;
  }): Promise<BroadcastCredentials> {
    const config = resolveLiveKitConfig({
      apiKey: process.env.LIVEKIT_API_KEY,
      apiSecret: process.env.LIVEKIT_API_SECRET,
      serverUrl: process.env.LIVEKIT_URL,
    });
    const token = new AccessToken(config.apiKey, config.apiSecret, {
      identity: input.identity,
      metadata: input.metadata,
      ttl: '10m',
    });

    token.addGrant({
      canPublish: input.canPublish,
      canPublishData: false,
      canPublishSources: input.canPublish
        ? [
            TrackSource.CAMERA,
            TrackSource.MICROPHONE,
            TrackSource.SCREEN_SHARE,
            TrackSource.SCREEN_SHARE_AUDIO,
          ]
        : [],
      canSubscribe: true,
      room: broadcastRoomName(input.roomId),
      roomJoin: true,
    });

    return {
      participantToken: await token.toJwt(),
      serverUrl: config.serverUrl,
    };
  }
}

export function broadcastRoomName(roomId: string): string {
  return `livepulse-${roomId}`;
}

export function resolveLiveKitConfig(environment: LiveKitEnvironment): {
  apiKey: string;
  apiSecret: string;
  serverUrl: string;
} {
  const apiKey = environment.apiKey?.trim();
  const apiSecret = environment.apiSecret?.trim();
  const serverUrl = environment.serverUrl?.trim();

  if (!apiKey || !apiSecret || !serverUrl) {
    throw new BroadcastConfigurationError();
  }

  try {
    const parsed = new URL(serverUrl);

    if (!['ws:', 'wss:'].includes(parsed.protocol)) {
      throw new BroadcastConfigurationError();
    }
  } catch (error) {
    if (error instanceof BroadcastConfigurationError) {
      throw error;
    }

    throw new BroadcastConfigurationError();
  }

  return { apiKey, apiSecret, serverUrl };
}
