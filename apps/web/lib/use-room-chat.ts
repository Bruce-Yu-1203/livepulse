'use client';

import {
  ApiErrorCode,
  CurrentUserResponseSchema,
  ServerRealtimeEventSchema,
} from '@livepulse/contracts';
import type { RoomStatus } from '@livepulse/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ClientApiError, clientApiRequest } from './client-api';
import {
  addPendingMessage,
  type ChatMessage,
  markMessageFailed,
  mergeCreatedMessage,
  reconnectDelay,
  resolveWebSocketUrl,
} from './room-chat';

export type RoomConnectionState =
  'connected' | 'connecting' | 'ended' | 'reconnecting';

export function useRoomChat(roomId: string, roomStatus: RoomStatus) {
  const [connection, setConnection] = useState<RoomConnectionState>(
    roomStatus === 'LIVE' ? 'connecting' : 'ended',
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userId, setUserId] = useState<string>();
  const [authChecked, setAuthChecked] = useState(false);
  const [error, setError] = useState<string>();
  const socketRef = useRef<WebSocket>(undefined);
  const requestMessagesRef = useRef(new Map<string, string>());

  useEffect(() => {
    let active = true;

    void clientApiRequest('/api/v1/auth/me', CurrentUserResponseSchema)
      .then((response) => {
        if (active) {
          setUserId(response.user.id);
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
      return;
    }

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    function connect() {
      if (cancelled) {
        return;
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
          attempt = 0;
          setConnection('connected');
          setError(undefined);
          return;
        }

        if (parsed.data.type === 'message.created') {
          const createdEvent = parsed.data;
          setMessages((current) => mergeCreatedMessage(current, createdEvent));
          requestMessagesRef.current.delete(createdEvent.requestId);
          return;
        }

        const clientMessageId = requestMessagesRef.current.get(
          parsed.data.requestId,
        );
        if (clientMessageId) {
          setMessages((current) => markMessageFailed(current, clientMessageId));
          requestMessagesRef.current.delete(parsed.data.requestId);
        }
        setError(parsed.data.payload.message);

        if (parsed.data.payload.code === ApiErrorCode.RealtimeRoomNotLive) {
          setConnection('ended');
          cancelled = true;
          socket.close(1000, 'Room ended');
        }
      });
      socket.addEventListener('close', (event) => {
        if (cancelled) {
          return;
        }

        if (event.code === 4401) {
          cancelled = true;
          setUserId(undefined);
          setAuthChecked(true);
          setError('Your session expired. Sign in again to rejoin chat.');
          return;
        }

        setConnection('reconnecting');
        reconnectTimer = setTimeout(connect, reconnectDelay(attempt));
        attempt += 1;
      });
      socket.addEventListener('error', () => {
        setError('The live connection was interrupted. Reconnecting…');
      });
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      socketRef.current?.close(1000, 'Leaving room');
    };
  }, [roomId, roomStatus]);

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
      const requestId = crypto.randomUUID();
      requestMessagesRef.current.set(requestId, clientMessageId);
      setMessages((current) =>
        addPendingMessage(current, {
          authorId: userId,
          clientMessageId,
          text: normalized,
        }),
      );
      socket.send(
        JSON.stringify({
          payload: { clientMessageId, roomId, text: normalized },
          requestId,
          type: 'message.send',
          v: 1,
        }),
      );
      setError(undefined);
      return true;
    },
    [roomId, userId],
  );

  return {
    authChecked,
    connection,
    error,
    messages,
    sendMessage,
    userId,
  };
}
