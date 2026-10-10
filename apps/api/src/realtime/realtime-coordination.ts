import type { DistributedRealtimeEvent } from '@livepulse/contracts';

export interface RealtimeEventBus {
  publish(event: DistributedRealtimeEvent): Promise<void>;
  subscribe(listener: (event: DistributedRealtimeEvent) => void): () => void;
}

export interface RealtimePresence {
  join(roomId: string, connectionId: string): Promise<number>;
  leave(roomId: string, connectionId: string): Promise<number>;
  refresh(
    connections: ReadonlyArray<{ connectionId: string; roomId: string }>,
  ): Promise<Map<string, number>>;
}
