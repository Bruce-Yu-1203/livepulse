import { Injectable } from '@nestjs/common';

export interface RoomEndedNotification {
  endedAt: Date;
  roomId: string;
}

export interface RoomLifecyclePublisher {
  publishRoomEnded(notification: RoomEndedNotification): Promise<void>;
}

@Injectable()
export class RoomLifecycleEvents implements RoomLifecyclePublisher {
  private readonly roomEndedListeners = new Set<
    (notification: RoomEndedNotification) => Promise<void>
  >();

  public async publishRoomEnded(
    notification: RoomEndedNotification,
  ): Promise<void> {
    await Promise.all(
      [...this.roomEndedListeners].map((listener) => listener(notification)),
    );
  }

  public subscribeToRoomEnded(
    listener: (notification: RoomEndedNotification) => Promise<void>,
  ): () => void {
    this.roomEndedListeners.add(listener);
    return () => this.roomEndedListeners.delete(listener);
  }
}
