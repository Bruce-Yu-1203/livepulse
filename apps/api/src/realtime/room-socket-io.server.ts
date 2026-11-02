import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import type { Server as HttpServer } from 'node:http';
import type { ServerRealtimeEvent } from '@livepulse/contracts';
import { fromNodeHeaders } from 'better-auth/node';
import { Server, type Socket } from 'socket.io';

import {
  BetterAuthService,
  secureSessionCookieName,
  sessionCookieName,
} from '../auth/better-auth.service.js';
import {
  readBroadcastBatchWindowMs,
  RoomBroadcastBatcher,
} from './room-broadcast-batcher.js';
import { RoomRealtimeHub, type RealtimePeer } from './room-realtime-hub.js';
import { RealtimeMetricsService } from './realtime-metrics.service.js';
import { SocketSessionState } from './socket-session-state.js';
import type {
  RealtimeControl,
  RealtimeControlEvent,
} from './realtime-coordination.js';
import { REALTIME_CONTROL } from './realtime.tokens.js';

const maxPacketBytes = 4 * 1_024;
export const heartbeatIntervalMs = 15_000;
export const heartbeatTimeoutMs = 45_000;
export const socketIoPath = '/socket.io';

export function hasBetterAuthSessionCookie(
  header: string | undefined,
): boolean {
  return [sessionCookieName, secureSessionCookieName].some((name) =>
    Boolean(readCookie(header, name)),
  );
}

@Injectable()
export class RoomSocketIoServer implements OnModuleDestroy {
  private io: Server | undefined;
  private batcher: RoomBroadcastBatcher | undefined;
  private readonly socketsBySession = new Map<string, Set<Socket>>();
  private readonly socketsByUser = new Map<string, Set<Socket>>();
  private readonly unsubscribeControl: () => void;
  private readonly unsubscribeReconnect: () => void;

  public constructor(
    @Inject(BetterAuthService)
    private readonly authentication: BetterAuthService,
    @Inject(RoomRealtimeHub) private readonly hub: RoomRealtimeHub,
    @Inject(RealtimeMetricsService)
    private readonly metrics: RealtimeMetricsService,
    @Inject(REALTIME_CONTROL) control: RealtimeControl,
  ) {
    this.unsubscribeControl = control.subscribeControl((event) =>
      this.handleControl(event),
    );
    this.unsubscribeReconnect = control.subscribeReconnect(() => {
      for (const socket of this.io?.sockets.sockets.values() ?? []) {
        (socket.data.auth as SocketSessionState).invalidate();
      }
    });
  }

  public attach(httpServer: HttpServer): void {
    if (this.io) {
      return;
    }

    const io = new Server(httpServer, {
      allowRequest: (request, callback) => {
        callback(
          null,
          request.headers.origin === this.authentication.trustedWebOrigin,
        );
      },
      cors: {
        credentials: true,
        origin: this.authentication.trustedWebOrigin,
      },
      maxHttpBufferSize: maxPacketBytes,
      path: socketIoPath,
      perMessageDeflate: false,
      pingInterval: heartbeatIntervalMs,
      pingTimeout: heartbeatTimeoutMs,
      transports: ['websocket'],
    });
    this.io = io;
    const batcher = new RoomBroadcastBatcher((roomId, frame) => {
      io.to(roomId).emit(frame.type, frame);
    }, readBroadcastBatchWindowMs(process.env.REALTIME_BROADCAST_BATCH_MS));
    this.batcher = batcher;
    this.hub.useRoomBroadcaster({
      join: (peerId, roomId) => {
        const socket = io.sockets.sockets.get(peerId);
        if (!socket) {
          throw new Error('Socket disconnected before joining the room');
        }
        return socket.join(roomId);
      },
      leave: (peerId, roomId) => io.sockets.sockets.get(peerId)?.leave(roomId),
      broadcast: (event) => batcher.add(event),
      flush: (roomId) => batcher.flush(roomId),
    });

    io.use((socket, next) => {
      void this.authenticateHandshake(socket).then(next, () => {
        next(new Error('Authentication unavailable'));
      });
    });
    io.on('connection', (socket) => this.accept(socket));
  }

  public async onModuleDestroy(): Promise<void> {
    this.unsubscribeControl();
    this.unsubscribeReconnect();
    this.socketsBySession.clear();
    this.socketsByUser.clear();
    this.batcher?.close();
    this.batcher = undefined;
    const io = this.io;
    this.io = undefined;
    if (io) {
      await new Promise<void>((resolve) => io.close(() => resolve()));
    }
  }

  private async authenticateHandshake(
    socket: Socket,
  ): Promise<Error | undefined> {
    const headers = fromNodeHeaders(socket.request.headers);
    this.metrics.cacheEvent('sessionRefreshes');
    const session =
      await this.authentication.sessionPrincipalFromHeaders(headers);
    const hasSessionCookie = hasBetterAuthSessionCookie(
      socket.request.headers.cookie,
    );
    if (hasSessionCookie && !session) {
      return new Error('Authentication expired');
    }

    socket.data.auth = new SocketSessionState(
      headers,
      hasSessionCookie,
      session,
    );
    return undefined;
  }

  private accept(socket: Socket): void {
    const peer: RealtimePeer = {
      id: socket.id,
      principal: (socket.data.auth as SocketSessionState).principal,
      send: (event: ServerRealtimeEvent) => {
        if (socket.connected) {
          socket.emit(event.type, event);
        }
      },
    };
    let disconnected = false;
    this.metrics.connectionOpened();
    this.indexSocket(socket);

    socket.onAny((name, event: unknown) => {
      const input =
        typeof event === 'object' &&
        event !== null &&
        'type' in event &&
        event.type === name
          ? event
          : undefined;
      void this.receive(socket, peer, input).catch(() => {
        socket.disconnect(true);
      });
    });
    socket.on('disconnect', () => {
      if (!disconnected) {
        disconnected = true;
        this.metrics.connectionClosed();
        this.unindexSocket(socket);
        void this.hub.disconnect(peer);
      }
    });
  }

  private async receive(
    socket: Socket,
    peer: RealtimePeer,
    event: unknown,
  ): Promise<void> {
    const state = socket.data.auth as SocketSessionState;
    const previous = peer.principal;
    try {
      if (state.isCached()) {
        this.metrics.cacheEvent('sessionCacheHits');
      }
      peer.principal = await state.resolve(this.authentication, () =>
        this.metrics.cacheEvent('sessionRefreshes'),
      );
    } catch {
      socket.disconnect(true);
      return;
    }
    if (!socket.connected || (!peer.principal && state.hasSessionCookie)) {
      socket.disconnect(true);
      return;
    }

    if (
      previous?.sessionId !== peer.principal?.sessionId ||
      previous?.userId !== peer.principal?.userId
    ) {
      this.unindexSocket(socket, previous);
      this.indexSocket(socket);
    }

    await this.hub.handle(peer, event);
  }

  private indexSocket(socket: Socket): void {
    const principal = (socket.data.auth as SocketSessionState).principal;
    if (!principal) return;
    socket.data.indexedPrincipal = principal;
    addSocket(this.socketsBySession, principal.sessionId, socket);
    addSocket(this.socketsByUser, principal.userId, socket);
  }

  private unindexSocket(
    socket: Socket,
    principal = socket.data.indexedPrincipal as RealtimePeer['principal'],
  ): void {
    if (!principal) return;
    removeSocket(this.socketsBySession, principal.sessionId, socket);
    removeSocket(this.socketsByUser, principal.userId, socket);
    socket.data.indexedPrincipal = undefined;
  }

  private handleControl(event: RealtimeControlEvent): void {
    const sockets =
      event.type === 'session.revoked'
        ? this.socketsBySession.get(event.sessionId)
        : this.socketsByUser.get(event.userId);
    for (const socket of [...(sockets ?? [])]) {
      const state = socket.data.auth as SocketSessionState;
      if (
        event.type === 'user.sessions.revoked' &&
        state.principal?.sessionId === event.exceptSessionId
      ) {
        continue;
      }
      state.invalidate();
      socket.disconnect(true);
    }
  }
}

function addSocket(
  index: Map<string, Set<Socket>>,
  key: string,
  socket: Socket,
): void {
  const sockets = index.get(key) ?? new Set<Socket>();
  sockets.add(socket);
  index.set(key, sockets);
}

function removeSocket(
  index: Map<string, Set<Socket>>,
  key: string,
  socket: Socket,
): void {
  const sockets = index.get(key);
  sockets?.delete(socket);
  if (sockets?.size === 0) index.delete(key);
}

function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const separator = part.indexOf('=');
    const key = part.slice(0, separator).trim();

    if (separator > 0 && key === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}
