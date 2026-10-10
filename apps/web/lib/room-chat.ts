import type { MessageCreatedEvent, RoomMessage } from '@livepulse/contracts';

export interface ChatMessage {
  acceptedAt?: string;
  authorId: string;
  clientMessageId: string;
  id: string;
  status: 'failed' | 'pending' | 'sent';
  text: string;
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
      if (message.status === 'sent' || existing?.status !== 'sent') {
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

export function resolveWebSocketUrl(
  location: Pick<Location, 'host' | 'hostname' | 'port' | 'protocol'>,
  configuredUrl?: string,
): string {
  if (configuredUrl) {
    return configuredUrl;
  }

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const authority =
    location.port === '3000' ? `${location.hostname}:3001` : location.host;
  return `${protocol}//${authority}/ws`;
}

export function reconnectDelay(attempt: number, random = Math.random): number {
  const cappedBase = Math.min(30_000, 1_000 * 2 ** attempt);
  return Math.round(cappedBase * (0.8 + random() * 0.4));
}

function toChatMessage(message: RoomMessage): ChatMessage {
  return {
    acceptedAt: message.acceptedAt,
    authorId: message.authorId,
    clientMessageId: message.clientMessageId,
    id: message.messageId,
    status: 'sent',
    text: message.text,
  };
}
