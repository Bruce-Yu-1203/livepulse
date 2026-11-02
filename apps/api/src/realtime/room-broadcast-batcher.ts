import { randomUUID } from 'node:crypto';

import { maxMessageBatchSize } from '@livepulse/contracts';
import type {
  MessageBatchEvent,
  MessageCreatedEvent,
} from '@livepulse/contracts';

export type RoomBroadcastFrame = MessageBatchEvent | MessageCreatedEvent;

export interface BatchTimers {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

interface RoomWindow {
  pending: MessageCreatedEvent[];
  timer: unknown;
}

const nodeTimers: BatchTimers = {
  setTimeout: (callback, delayMs) => {
    const handle = setTimeout(callback, delayMs);
    handle.unref();
    return handle;
  },
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export const broadcastBatchWindowLimitMs = 1_000;

/**
 * Reads REALTIME_BROADCAST_BATCH_MS. Zero, or an unset value, disables
 * coalescing so every message is written to sockets as soon as it arrives.
 */
export function readBroadcastBatchWindowMs(value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    return 0;
  }

  const windowMs = Number(value);
  if (
    !Number.isInteger(windowMs) ||
    windowMs < 0 ||
    windowMs > broadcastBatchWindowLimitMs
  ) {
    throw new Error(
      `REALTIME_BROADCAST_BATCH_MS must be an integer from 0 to ${broadcastBatchWindowLimitMs}`,
    );
  }

  return windowMs;
}

/**
 * Coalesces message.created broadcasts per room so each socket receives at
 * most about one frame per window, however many messages the room produces.
 *
 * The first message in a quiet room is emitted immediately and opens a
 * window. Messages that arrive while the window is open are held and emitted
 * together when it closes; the window then reopens until a window passes with
 * no new messages. Low-traffic rooms therefore see no added latency, while busy
 * rooms trade at most one window of delay for far fewer socket writes.
 */
export class RoomBroadcastBatcher {
  private readonly windows = new Map<string, RoomWindow>();

  public constructor(
    private readonly emit: (roomId: string, frame: RoomBroadcastFrame) => void,
    private readonly windowMs: number,
    private readonly timers: BatchTimers = nodeTimers,
  ) {}

  public get enabled(): boolean {
    return this.windowMs > 0;
  }

  public add(event: MessageCreatedEvent): void {
    const roomId = event.payload.roomId;

    if (!this.enabled) {
      this.emit(roomId, event);
      return;
    }

    const window = this.windows.get(roomId);
    if (!window) {
      this.emit(roomId, event);
      this.openWindow(roomId);
      return;
    }

    window.pending.push(event);
    if (window.pending.length >= maxMessageBatchSize) {
      this.emitPending(roomId, window);
    }
  }

  /** Emits held messages now, so a following room event keeps its order. */
  public flush(roomId: string): void {
    const window = this.windows.get(roomId);
    if (window) {
      this.emitPending(roomId, window);
    }
  }

  /** Emits every held message and stops all timers. */
  public close(): void {
    for (const [roomId, window] of this.windows) {
      this.timers.clearTimeout(window.timer);
      this.emitPending(roomId, window);
    }
    this.windows.clear();
  }

  public pendingCount(roomId: string): number {
    return this.windows.get(roomId)?.pending.length ?? 0;
  }

  private openWindow(roomId: string): void {
    const window: RoomWindow = { pending: [], timer: undefined };
    window.timer = this.timers.setTimeout(
      () => this.closeWindow(roomId),
      this.windowMs,
    );
    this.windows.set(roomId, window);
  }

  private closeWindow(roomId: string): void {
    const window = this.windows.get(roomId);
    if (!window) {
      return;
    }

    if (window.pending.length === 0) {
      this.windows.delete(roomId);
      return;
    }

    this.emitPending(roomId, window);
    window.timer = this.timers.setTimeout(
      () => this.closeWindow(roomId),
      this.windowMs,
    );
  }

  private emitPending(roomId: string, window: RoomWindow): void {
    const messages = window.pending.splice(0);
    const [first] = messages;
    if (!first) {
      return;
    }

    if (messages.length === 1) {
      this.emit(roomId, first);
      return;
    }

    this.emit(roomId, {
      payload: { messages, roomId },
      requestId: randomUUID(),
      type: 'message.batch',
      v: 1,
    });
  }
}
