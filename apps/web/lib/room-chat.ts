import { ApiErrorCode } from '@livepulse/contracts';
import type {
  MessageCreatedEvent,
  RoomMessage,
  RoomStatus,
} from '@livepulse/contracts';

export type RoomConnectionState =
  'connected' | 'connecting' | 'ended' | 'reconnecting';

export interface ChatMessage {
  acceptedAt?: string;
  authorId: string;
  clientMessageId: string;
  deletedAt?: string;
  id: string;
  status: 'failed' | 'pending' | 'sent';
  text: string;
}

export interface PendingDelivery {
  attempts: number;
  clientMessageId: string;
  lastAttemptAt?: number;
  queuedAt: number;
  text: string;
}

export interface DeliverySweep {
  failedClientMessageIds: string[];
  retryable: PendingDelivery[];
}

export const messageAcknowledgementTimeoutMs = 10_000;
export const pendingMessageRetentionMs = 5 * 60_000;
export const maxMessageDeliveryAttempts = 3;

export class PendingMessageTracker {
  private readonly deliveries = new Map<string, PendingDelivery>();
  private readonly clientMessageByRequest = new Map<string, string>();

  public add(
    clientMessageId: string,
    text: string,
    now = Date.now(),
  ): PendingDelivery {
    const existing = this.deliveries.get(clientMessageId);
    if (existing) {
      return existing;
    }

    const delivery: PendingDelivery = {
      attempts: 0,
      clientMessageId,
      queuedAt: now,
      text,
    };
    this.deliveries.set(clientMessageId, delivery);
    return delivery;
  }

  public beginAttempt(
    clientMessageId: string,
    requestId: string,
    now = Date.now(),
  ): PendingDelivery | undefined {
    const delivery = this.deliveries.get(clientMessageId);
    if (!delivery || delivery.attempts >= maxMessageDeliveryAttempts) {
      return undefined;
    }

    delivery.attempts += 1;
    delivery.lastAttemptAt = now;
    this.clientMessageByRequest.set(requestId, clientMessageId);
    return { ...delivery };
  }

  public acknowledge(clientMessageId: string): boolean {
    if (!this.deliveries.delete(clientMessageId)) {
      return false;
    }

    this.removeRequestsFor(clientMessageId);
    return true;
  }

  public rejectRequest(requestId: string): string | undefined {
    const clientMessageId = this.clientMessageByRequest.get(requestId);
    if (!clientMessageId) {
      return undefined;
    }

    this.deliveries.delete(clientMessageId);
    this.removeRequestsFor(clientMessageId);
    return clientMessageId;
  }

  public sweep(now = Date.now()): DeliverySweep {
    const failedClientMessageIds: string[] = [];
    const retryable: PendingDelivery[] = [];

    for (const delivery of this.deliveries.values()) {
      const acknowledgementExpired =
        delivery.lastAttemptAt === undefined ||
        now - delivery.lastAttemptAt >= messageAcknowledgementTimeoutMs;
      const retentionExpired =
        now - delivery.queuedAt >= pendingMessageRetentionMs;

      if (
        retentionExpired ||
        (delivery.attempts >= maxMessageDeliveryAttempts &&
          acknowledgementExpired)
      ) {
        failedClientMessageIds.push(delivery.clientMessageId);
        this.deliveries.delete(delivery.clientMessageId);
        this.removeRequestsFor(delivery.clientMessageId);
      } else if (acknowledgementExpired) {
        retryable.push({ ...delivery });
      }
    }

    return { failedClientMessageIds, retryable };
  }

  public clear(): void {
    this.deliveries.clear();
    this.clientMessageByRequest.clear();
  }

  public failAll(): string[] {
    const clientMessageIds = [...this.deliveries.keys()];
    this.clear();
    return clientMessageIds;
  }

  private removeRequestsFor(clientMessageId: string): void {
    for (const [requestId, mappedClientMessageId] of this
      .clientMessageByRequest) {
      if (mappedClientMessageId === clientMessageId) {
        this.clientMessageByRequest.delete(requestId);
      }
    }
  }
}

export function addPendingMessage(
  messages: ChatMessage[],
  input: {
    authorId: string;
    clientMessageId: string;
    text: string;
  },
): ChatMessage[] {
  const pending: ChatMessage = {
    ...input,
    id: input.clientMessageId,
    status: 'pending',
  };

  return [...messages, pending].slice(-150);
}

export function mergeCreatedMessage(
  messages: ChatMessage[],
  event: MessageCreatedEvent,
): ChatMessage[] {
  const created: ChatMessage = {
    acceptedAt: event.payload.acceptedAt,
    authorId: event.payload.authorId,
    clientMessageId: event.payload.clientMessageId,
    id: event.payload.messageId,
    status: 'sent',
    text: event.payload.text,
  };
  const existingIndex = messages.findIndex(
    (message) =>
      message.id === created.id ||
      message.clientMessageId === created.clientMessageId,
  );

  if (existingIndex < 0) {
    return [...messages, created].slice(-150);
  }

  if (messages[existingIndex]?.deletedAt) {
    return messages;
  }

  return messages.map((message, index) =>
    index === existingIndex ? created : message,
  );
}

export function mergeHistoryMessages(
  messages: ChatMessage[],
  history: RoomMessage[],
): ChatMessage[] {
  const combined = [...history.map(toChatMessage), ...messages];
  const unique = new Map<string, ChatMessage>();

  for (const message of combined) {
    const matchingKey = [...unique.entries()].find(
      ([, existing]) =>
        existing.id === message.id ||
        existing.clientMessageId === message.clientMessageId,
    )?.[0];

    if (matchingKey) {
      const existing = unique.get(matchingKey);
      if (
        message.deletedAt ||
        (!existing?.deletedAt &&
          (message.status === 'sent' || existing?.status !== 'sent'))
      ) {
        unique.set(matchingKey, message);
      }
    } else {
      unique.set(message.id, message);
    }
  }

  return [...unique.values()]
    .sort((left, right) => {
      const timestampOrder = (left.acceptedAt ?? '9999').localeCompare(
        right.acceptedAt ?? '9999',
      );
      return timestampOrder || left.id.localeCompare(right.id);
    })
    .slice(-300);
}

export function markMessageFailed(
  messages: ChatMessage[],
  clientMessageId: string,
): ChatMessage[] {
  return messages.map((message) =>
    message.clientMessageId === clientMessageId
      ? { ...message, status: 'failed' }
      : message,
  );
}

export function visibleDanmakuMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(
    (message) => message.status !== 'failed' && !message.deletedAt,
  );
}

export function markMessageDeleted(
  messages: ChatMessage[],
  messageId: string,
  deletedAt: string,
): ChatMessage[] {
  return messages.map((message) =>
    message.id === messageId
      ? {
          ...message,
          deletedAt,
          status: 'sent',
          text: 'Message removed by moderation',
        }
      : message,
  );
}

export function resolveSocketIoOrigin(
  location: Pick<Location, 'host' | 'hostname' | 'port' | 'protocol'>,
  configuredUrl?: string,
): string {
  if (configuredUrl) {
    return configuredUrl;
  }

  const protocol = location.protocol === 'https:' ? 'https:' : 'http:';
  const authority =
    location.port === '3000' ? `${location.hostname}:3001` : location.host;
  return `${protocol}//${authority}`;
}

export function roomChatIsClosed(
  roomStatus: RoomStatus,
  connection: RoomConnectionState,
): boolean {
  return roomStatus !== 'LIVE' || connection === 'ended';
}

export function roomPresenceLabel(
  uniqueUsers: number,
  connections: number,
): string {
  const people = `${uniqueUsers.toLocaleString('en')} ${
    uniqueUsers === 1 ? 'person' : 'people'
  } online`;

  return connections === uniqueUsers
    ? people
    : `${people} · ${connections.toLocaleString('en')} connections`;
}

export function realtimeErrorMessage(error: {
  code: string;
  message: string;
  retryAfterMs?: number | undefined;
}): string {
  if (error.code === ApiErrorCode.RealtimeRateLimited) {
    const seconds = Math.max(
      1,
      Math.ceil((error.retryAfterMs ?? 1_000) / 1_000),
    );
    return `You're sending messages too quickly. Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`;
  }

  if (error.code === ApiErrorCode.RealtimeContentBlocked) {
    return 'Your message was blocked by the room content policy.';
  }

  return error.message;
}

function toChatMessage(message: RoomMessage): ChatMessage {
  return {
    acceptedAt: message.acceptedAt,
    authorId: message.authorId,
    clientMessageId: message.clientMessageId,
    ...(message.deletedAt ? { deletedAt: message.deletedAt } : {}),
    id: message.messageId,
    status: 'sent',
    text: message.text,
  };
}
