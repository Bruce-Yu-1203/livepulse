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
import { RoomRealtimeHub, type RealtimePeer } from './room-realtime-hub.js';
import { RealtimeMetricsService } from './realtime-metrics.service.js';

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

  public constructor(
    @Inject(BetterAuthService)
    private readonly authentication: BetterAuthService,
    @Inject(RoomRealtimeHub) private readonly hub: RoomRealtimeHub,
    @Inject(RealtimeMetricsService)
    private readonly metrics: RealtimeMetricsService,
  ) {}

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

    io.use((socket, next) => {
      void this.authenticateHandshake(socket).then(next, () => {
        next(new Error('Authentication unavailable'));
      });
    });
    io.on('connection', (socket) => this.accept(socket));
  }

  public async onModuleDestroy(): Promise<void> {
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
    const principal = await this.authentication.principalFromHeaders(headers);
    if (
      hasBetterAuthSessionCookie(socket.request.headers.cookie) &&
      !principal
    ) {
      return new Error('Authentication expired');
    }

    socket.data.principal = principal;
    socket.data.headers = headers;
    socket.data.hasSessionCookie = hasBetterAuthSessionCookie(
      socket.request.headers.cookie,
    );
    return undefined;
  }

  private accept(socket: Socket): void {
    const peer: RealtimePeer = {
      id: socket.id,
      principal: socket.data.principal,
      send: (event: ServerRealtimeEvent) => {
        if (socket.connected) {
          socket.emit(event.type, event);
        }
      },
    };
    let disconnected = false;
    this.metrics.connectionOpened();

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
        void this.hub.disconnect(peer);
      }
    });
  }

  private async receive(
    socket: Socket,
    peer: RealtimePeer,
    event: unknown,
  ): Promise<void> {
    try {
      peer.principal = await this.authentication.principalFromHeaders(
        socket.data.headers as Headers,
      );
    } catch {
      socket.disconnect(true);
      return;
    }
    if (!peer.principal && socket.data.hasSessionCookie) {
      socket.disconnect(true);
      return;
    }

    await this.hub.handle(peer, event);
  }
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
