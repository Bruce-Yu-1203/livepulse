import type { DistributedRealtimeEvent } from '@livepulse/contracts';

export interface RealtimeEventBus {
  publish(event: DistributedRealtimeEvent): Promise<void>;
  subscribe(listener: (event: DistributedRealtimeEvent) => void): () => void;
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
