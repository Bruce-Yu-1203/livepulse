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
import { io, type Socket } from 'socket.io-client';

import { ClientApiError, clientApiRequest } from './client-api';
import {
  addPendingMessage,
  type ChatMessage,
  markMessageDeleted,
  markMessageFailed,
  mergeCreatedMessage,
  mergeHistoryMessages,
  PendingMessageTracker,
  realtimeErrorMessage,
  resolveSocketIoOrigin,
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
  const [authRevision, setAuthRevision] = useState(0);
  const [error, setError] = useState<string>();
  const [historyLoading, setHistoryLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>();
  const socketRef = useRef<Socket>(undefined);
  const pendingMessagesRef = useRef(new PendingMessageTracker());
  const historyLoadingRef = useRef(false);

  useEffect(() => {
    const refreshAfterSignIn = () => setAuthRevision((current) => current + 1);
    window.addEventListener('livepulse:auth-changed', refreshAfterSignIn);
    return () =>
      window.removeEventListener('livepulse:auth-changed', refreshAfterSignIn);
  }, []);

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
    setAuthChecked(false);

    void clientApiRequest('/api/v1/auth/me', CurrentUserResponseSchema)
      .then((response) => {
        if (active) {
          setUserId(response.user.id);
          setUserRole(response.user.role);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setUserId(undefined);
          setUserRole(undefined);
        }
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
  }, [authRevision]);

  useEffect(() => {
    if (roomStatus !== 'LIVE') {
      setConnection('ended');
      setOnlineCount(0);
      setUniqueUserCount(0);
      return;
    }

    let cancelled = false;
    let joinedSocket: Socket | undefined;

    function flushPending(socket: Socket) {
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
      if (cancelled || socketRef.current) {
        return;
      }

      setConnection('connecting');
      const socket = io(
        resolveSocketIoOrigin(
          window.location,
          process.env.NEXT_PUBLIC_SOCKET_IO_URL,
        ),
        {
          path: '/socket.io',
          transports: ['websocket'],
          withCredentials: true,
        },
      );
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('room.join', {
          payload: { roomId },
          requestId: crypto.randomUUID(),
          type: 'room.join',
          v: 1,
        });
      });
      const receive = (body: unknown) => {
        const parsed = ServerRealtimeEventSchema.safeParse(body);
        if (!parsed.success) {
          return;
        }

        if (parsed.data.type === 'room.joined') {
          joinedSocket = socket;
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
          socket.disconnect();
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
          socket.disconnect();
        }
      };
      for (const event of [
        'room.joined',
        'room.stats',
        'room.ended',
        'message.created',
        'message.deleted',
        'error',
      ]) {
        socket.on(event, receive);
      }
      socket.on('disconnect', (reason) => {
        if (socketRef.current !== socket) {
          return;
        }
        if (joinedSocket === socket) {
          joinedSocket = undefined;
        }
        if (cancelled) {
          return;
        }
        if (reason === 'io server disconnect') {
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
        }
      });
      socket.on('connect_error', (caught: Error) => {
        if (caught.message === 'Authentication expired') {
          cancelled = true;
          setUserId(undefined);
          setUserRole(undefined);
          setAuthChecked(true);
          setError('Your session expired. Sign in again to rejoin chat.');
          socket.disconnect();
          return;
        }
        setConnection('reconnecting');
        setError('The live connection was interrupted. Reconnecting…');
      });
    }

    function reconnectWhenOnline() {
      if (cancelled) {
        return;
      }

      setError('Network restored. Reconnecting…');
      socketRef.current?.connect();
    }

    function markOffline() {
      socketRef.current?.disconnect();
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
      if (joinedSocket?.connected) {
        flushPending(joinedSocket);
      }
    }, 1_000);

    return () => {
      cancelled = true;
      clearInterval(deliverySweepTimer);
      window.removeEventListener('online', reconnectWhenOnline);
      window.removeEventListener('offline', markOffline);
      const socket = socketRef.current;
      if (socket?.connected) {
        socket.emit('room.leave', {
          payload: { roomId },
          requestId: crypto.randomUUID(),
          type: 'room.leave',
          v: 1,
        });
      }
      socket?.disconnect();
      socketRef.current = undefined;
    };
  }, [authRevision, loadHistory, roomId, roomStatus]);

  const sendMessage = useCallback(
    (text: string) => {
      const normalized = text.trim();
      const socket = socketRef.current;

      if (!userId || !normalized || normalized.length > 200) {
        return false;
      }

      if (!socket?.connected || connection !== 'connected') {
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
    [connection, roomId, userId],
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
  socket: Socket,
  tracker: PendingMessageTracker,
  roomId: string,
  clientMessageId: string,
): boolean {
  const requestId = crypto.randomUUID();
  const delivery = tracker.beginAttempt(clientMessageId, requestId);
  if (!delivery) {
    return false;
  }

  socket.emit('message.send', {
    payload: {
      clientMessageId: delivery.clientMessageId,
      roomId,
      text: delivery.text,
    },
    requestId,
    type: 'message.send',
    v: 1,
  });
  return true;
}
