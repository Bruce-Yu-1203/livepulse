'use client';

import {
  ApiErrorCode,
  CurrentUserResponseSchema,
  ListRoomMessagesResponseSchema,
  ServerRealtimeEventSchema,
} from '@livepulse/contracts';
import type { RoomStatus } from '@livepulse/contracts';
import type { UserRole } from '@livepulse/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ClientApiError, clientApiRequest } from './client-api';
import {
  addPendingMessage,
  canStartRealtimeConnection,
  type ChatMessage,
  markMessageDeleted,
  markMessageFailed,
  mergeCreatedMessage,
  mergeHistoryMessages,
  PendingMessageTracker,
  reconnectDelay,
  realtimeErrorMessage,
  resolveWebSocketUrl,
  type RoomConnectionState,
} from './room-chat';

export function useRoomChat(roomId: string, roomStatus: RoomStatus) {
  const [connection, setConnection] = useState<RoomConnectionState>(
    roomStatus === 'LIVE' ? 'connecting' : 'ended',
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [uniqueUserCount, setUniqueUserCount] = useState(0);
  const [userId, setUserId] = useState<string>();
  const [userRole, setUserRole] = useState<UserRole>();
  const [authChecked, setAuthChecked] = useState(false);
  const [error, setError] = useState<string>();
  const [historyLoading, setHistoryLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>();
  const socketRef = useRef<WebSocket>(undefined);
  const pendingMessagesRef = useRef(new PendingMessageTracker());
  const historyLoadingRef = useRef(false);

  const loadHistory = useCallback(
    async (cursor?: string) => {
      if (historyLoadingRef.current) {
        return;
      }

      historyLoadingRef.current = true;
      setHistoryLoading(true);
      const query = new URLSearchParams({ limit: '50' });
      if (cursor) {
        query.set('cursor', cursor);
      }

      try {
        const response = await clientApiRequest(
          `/api/v1/rooms/${roomId}/messages?${query.toString()}`,
          ListRoomMessagesResponseSchema,
        );
        for (const message of response.items) {
          pendingMessagesRef.current.acknowledge(message.clientMessageId);
        }
        setMessages((current) => mergeHistoryMessages(current, response.items));
        setNextCursor((current) =>
          cursor || current === undefined ? response.nextCursor : current,
        );
      } catch {
        setError('Message history could not be loaded.');
      } finally {
        historyLoadingRef.current = false;
        setHistoryLoading(false);
      }
    },
    [roomId],
  );

  useEffect(() => {
    pendingMessagesRef.current.clear();
    setMessages([]);
    setNextCursor(undefined);
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    let active = true;

    void clientApiRequest('/api/v1/auth/me', CurrentUserResponseSchema)
      .then((response) => {
        if (active) {
          setUserId(response.user.id);
          setUserRole(response.user.role);
        }
      })
      .catch((caught: unknown) => {
        if (
          active &&
          !(caught instanceof ClientApiError && caught.status === 401)
        ) {
          setError('Your account status could not be checked.');
        }
      })
      .finally(() => {
        if (active) {
          setAuthChecked(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (roomStatus !== 'LIVE') {
      setConnection('ended');
      setOnlineCount(0);
      setUniqueUserCount(0);
      return;
    }

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let joinedSocket: WebSocket | undefined;
    let attempt = 0;

    function flushPending(socket: WebSocket) {
      const sweep = pendingMessagesRef.current.sweep();
      if (sweep.failedClientMessageIds.length > 0) {
        setMessages((current) =>
          sweep.failedClientMessageIds.reduce(
            (messages, clientMessageId) =>
              markMessageFailed(messages, clientMessageId),
            current,
          ),
        );
        setError(
          'Some messages could not be confirmed. Sync history or send again.',
        );
      }

      for (const delivery of sweep.retryable) {
        sendTrackedMessage(
          socket,
          pendingMessagesRef.current,
          roomId,
          delivery.clientMessageId,
        );
      }
    }

    function connect() {
      if (
        cancelled ||
        !canStartRealtimeConnection(socketRef.current?.readyState)
      ) {
        return;
      }

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }

      setConnection(attempt === 0 ? 'connecting' : 'reconnecting');
      const socket = new WebSocket(
        resolveWebSocketUrl(
          window.location,
          process.env.NEXT_PUBLIC_WEBSOCKET_URL,
        ),
      );
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        const requestId = crypto.randomUUID();
        socket.send(
          JSON.stringify({
            payload: { roomId },
            requestId,
            type: 'room.join',
            v: 1,
          }),
        );
      });
      socket.addEventListener('message', (incoming) => {
        let body: unknown;

        try {
          body = JSON.parse(String(incoming.data)) as unknown;
        } catch {
          return;
        }

        const parsed = ServerRealtimeEventSchema.safeParse(body);
        if (!parsed.success) {
          return;
        }

        if (parsed.data.type === 'room.joined') {
          joinedSocket = socket;
          attempt = 0;
          setConnection('connected');
          setOnlineCount(parsed.data.payload.connections);
          setUniqueUserCount(parsed.data.payload.uniqueUsers);
          setError(undefined);
          void loadHistory().finally(() => {
            if (!cancelled && joinedSocket === socket) {
              flushPending(socket);
            }
          });
          return;
        }

        if (parsed.data.type === 'room.stats') {
          setOnlineCount(parsed.data.payload.connections);
          setUniqueUserCount(parsed.data.payload.uniqueUsers);
          return;
        }

        if (parsed.data.type === 'room.ended') {
          const unresolved = pendingMessagesRef.current.failAll();
          setMessages((current) =>
            unresolved.reduce(
              (result, clientMessageId) =>
                markMessageFailed(result, clientMessageId),
              current,
            ),
          );
          setConnection('ended');
          setOnlineCount(0);
          setUniqueUserCount(0);
          setError(undefined);
          cancelled = true;
          socket.close(1000, 'Room ended');
          void loadHistory();
          return;
        }

        if (parsed.data.type === 'message.created') {
          const createdEvent = parsed.data;
          setMessages((current) => mergeCreatedMessage(current, createdEvent));
          pendingMessagesRef.current.acknowledge(
            createdEvent.payload.clientMessageId,
          );
          return;
        }

        if (parsed.data.type === 'message.deleted') {
          const deletedEvent = parsed.data;
          setMessages((current) =>
            markMessageDeleted(
              current,
              deletedEvent.payload.messageId,
              deletedEvent.payload.deletedAt,
            ),
          );
          return;
        }

        const clientMessageId = pendingMessagesRef.current.rejectRequest(
          parsed.data.requestId,
        );
        if (clientMessageId) {
          setMessages((current) => markMessageFailed(current, clientMessageId));
        }
        setError(realtimeErrorMessage(parsed.data.payload));

        if (parsed.data.payload.code === ApiErrorCode.RealtimeRoomNotLive) {
          setConnection('ended');
          cancelled = true;
          socket.close(1000, 'Room ended');
        }
      });
      socket.addEventListener('close', (event) => {
        if (socketRef.current !== socket) {
          return;
        }
        if (joinedSocket === socket) {
          joinedSocket = undefined;
        }
        if (cancelled) {
          return;
        }

        if (event.code === 4401) {
          cancelled = true;
          setUserId(undefined);
          setUserRole(undefined);
          setAuthChecked(true);
          setError('Your session expired. Sign in again to rejoin chat.');
          return;
        }

        setConnection('reconnecting');
        setOnlineCount(0);
        setUniqueUserCount(0);
        if (!navigator.onLine) {
          setError(
            'You are offline. Chat will reconnect when the network returns.',
          );
          return;
        }
        reconnectTimer = setTimeout(connect, reconnectDelay(attempt));
        attempt += 1;
      });
      socket.addEventListener('error', () => {
        setError('The live connection was interrupted. Reconnecting…');
      });
    }

    function reconnectWhenOnline() {
      if (cancelled) {
        return;
      }

      setError('Network restored. Reconnecting…');
      connect();
    }

    function markOffline() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      socketRef.current?.close(1000, 'Browser offline');
      setConnection('reconnecting');
      setOnlineCount(0);
      setUniqueUserCount(0);
      setError(
        'You are offline. Chat will reconnect when the network returns.',
      );
    }

    connect();
    window.addEventListener('online', reconnectWhenOnline);
    window.addEventListener('offline', markOffline);
    const deliverySweepTimer = setInterval(() => {
      if (joinedSocket?.readyState === WebSocket.OPEN) {
        flushPending(joinedSocket);
      }
    }, 1_000);

    return () => {
      cancelled = true;
      clearInterval(deliverySweepTimer);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      window.removeEventListener('online', reconnectWhenOnline);
      window.removeEventListener('offline', markOffline);
      socketRef.current?.close(1000, 'Leaving room');
    };
  }, [loadHistory, roomId, roomStatus]);

  const sendMessage = useCallback(
    (text: string) => {
      const normalized = text.trim();
      const socket = socketRef.current;

      if (!userId || !normalized || normalized.length > 200) {
        return false;
      }

      if (!socket || socket.readyState !== WebSocket.OPEN) {
        setError('Wait for the live connection before sending.');
        return false;
      }

      const clientMessageId = crypto.randomUUID();
      pendingMessagesRef.current.add(clientMessageId, normalized);
      setMessages((current) =>
        addPendingMessage(current, {
          authorId: userId,
          clientMessageId,
          text: normalized,
        }),
      );
      sendTrackedMessage(
        socket,
        pendingMessagesRef.current,
        roomId,
        clientMessageId,
      );
      setError(undefined);
      return true;
    },
    [roomId, userId],
  );

  return {
    authChecked,
    canLoadEarlier: nextCursor !== null && nextCursor !== undefined,
    connection,
    error,
    historyLoading,
    loadEarlier: () => {
      if (nextCursor) {
        void loadHistory(nextCursor);
      }
    },
    messages,
    onlineCount,
    sendMessage,
    synchronize: () => {
      void loadHistory();
    },
    uniqueUserCount,
    userId,
    userRole,
  };
}

function sendTrackedMessage(
  socket: WebSocket,
  tracker: PendingMessageTracker,
  roomId: string,
  clientMessageId: string,
): boolean {
  const requestId = crypto.randomUUID();
  const delivery = tracker.beginAttempt(clientMessageId, requestId);
  if (!delivery) {
    return false;
  }

  socket.send(
    JSON.stringify({
      payload: {
        clientMessageId: delivery.clientMessageId,
        roomId,
        text: delivery.text,
      },
      requestId,
      type: 'message.send',
      v: 1,
    }),
  );
  return true;
}
