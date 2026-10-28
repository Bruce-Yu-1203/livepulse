import type { DistributedRealtimeEvent } from '@livepulse/contracts';

export interface RealtimeEventBus {
  publish(event: DistributedRealtimeEvent): Promise<void>;
  subscribe(listener: (event: DistributedRealtimeEvent) => void): () => void;
}

export type RealtimeControlEvent =
  | { type: 'session.revoked'; sessionId: string }
  | {
      type: 'user.sessions.revoked';
      userId: string;
      exceptSessionId?: string;
    };

export interface RealtimeControl {
  publishControl(event: RealtimeControlEvent): Promise<void>;
  subscribeControl(listener: (event: RealtimeControlEvent) => void): () => void;
  subscribeReconnect(listener: () => void): () => void;
}

export interface RealtimeRateLimiter {
  consumeMessageToken(
    roomId: string,
    userId: string,
  ): Promise<number | undefined>;
}

export interface PresenceCounts {
  connections: number;
  uniqueUsers: number;
}

export interface PresenceConnection {
  connectionId: string;
  identityId: string;
  roomId: string;
}

export interface RealtimePresence {
  join(
    roomId: string,
    connectionId: string,
    identityId: string,
  ): Promise<PresenceCounts>;
  leave(roomId: string, connectionId: string): Promise<PresenceCounts>;
  refresh(
    connections: readonly PresenceConnection[],
  ): Promise<Map<string, PresenceCounts>>;
}
