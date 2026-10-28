import type { ChatMessage } from './room-chat';

export function isNearChatBottom(
  position: { clientHeight: number; scrollHeight: number; scrollTop: number },
  threshold = 64,
): boolean {
  return (
    position.scrollHeight - position.scrollTop - position.clientHeight <=
    threshold
  );
}

export function appendedChatMessageCount(
  previousLastClientMessageId: string | undefined,
  messages: Pick<ChatMessage, 'clientMessageId'>[],
): number {
  if (!previousLastClientMessageId) return 0;

  const previousLastIndex = messages.findIndex(
    (message) => message.clientMessageId === previousLastClientMessageId,
  );

  return previousLastIndex < 0 ? 0 : messages.length - previousLastIndex - 1;
}
