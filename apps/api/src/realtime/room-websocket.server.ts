import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';

import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import type { ServerRealtimeEvent } from '@livepulse/contracts';
import WebSocket, { WebSocketServer } from 'ws';
import type { RawData } from 'ws';

import {
  accessCookieName,
  AuthTokenService,
} from '../auth/auth-token.service.js';
import type { AuthenticatedPrincipal } from '../auth/authenticated-request.js';
import { RoomRealtimeHub } from './room-realtime-hub.js';
import type { RealtimePeer } from './room-realtime-hub.js';

const maxFrameBytes = 4 * 1_024;
const maxBufferedBytes = 256 * 1_024;
export const heartbeatIntervalMs = 15_000;
export const heartbeatTimeoutMs = 45_000;

export function heartbeatHasExpired(lastPongAt: number, now: number): boolean {
  return now - lastPongAt >= heartbeatTimeoutMs;
}

@Injectable()
export class RoomWebSocketServer implements OnModuleDestroy {
  private readonly webSocketServer = new WebSocketServer({
    maxPayload: maxFrameBytes,
    noServer: true,
    perMessageDeflate: false,
  });
  private readonly lastPongAt = new Map<WebSocket, number>();
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private httpServer: Server | undefined;

  public constructor(
    @Inject(AuthTokenService) private readonly tokens: AuthTokenService,
    @Inject(RoomRealtimeHub) private readonly hub: RoomRealtimeHub,
  ) {}

  public attach(httpServer: Server): void {
    if (this.httpServer) {
      return;
    }

    this.httpServer = httpServer;
    httpServer.on('upgrade', this.handleUpgrade);
    this.heartbeatTimer = setInterval(
      () => this.checkHeartbeats(),
      heartbeatIntervalMs,
    );
    this.heartbeatTimer.unref();
  }

  public onModuleDestroy(): void {
    this.httpServer?.off('upgrade', this.handleUpgrade);
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    for (const client of this.webSocketServer.clients) {
      client.terminate();
    }

    this.lastPongAt.clear();
    this.webSocketServer.close();
  }

  private readonly handleUpgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => {
    void this.upgrade(request, socket, head).catch(() => {
      if (!socket.destroyed) {
        rejectUpgrade(socket, 503, 'Service Unavailable');
      }
    });
  };

  private async upgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): Promise<void> {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;

    if (pathname !== '/ws') {
      rejectUpgrade(socket, 404, 'Not Found');
      return;
    }

    if (request.headers.origin !== this.tokens.trustedWebOrigin) {
      rejectUpgrade(socket, 403, 'Forbidden');
      return;
    }

    const accessToken = readCookie(request.headers.cookie, accessCookieName);
    let principal: AuthenticatedPrincipal | undefined;

    if (accessToken) {
      try {
        principal = await this.tokens.verifyAccessPrincipal(accessToken);
      } catch {
        this.closeUnauthorized(request, socket, head);
        return;
      }

      if (!principal) {
        this.closeUnauthorized(request, socket, head);
        return;
      }
    }

    this.webSocketServer.handleUpgrade(request, socket, head, (client) => {
      this.accept(client, principal);
    });
  }

  private closeUnauthorized(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): void {
    this.webSocketServer.handleUpgrade(request, socket, head, (client) => {
      client.close(4401, 'Authentication expired');
    });
  }

  private accept(
    socket: WebSocket,
    principal: AuthenticatedPrincipal | undefined,
  ): void {
    const peer: RealtimePeer = {
      id: randomUUID(),
      principal,
      send: (event) => this.send(socket, event),
    };
    let disconnected = false;
    const disconnect = () => {
      this.lastPongAt.delete(socket);
      if (!disconnected) {
        disconnected = true;
        void this.hub.disconnect(peer);
      }
    };

    this.lastPongAt.set(socket, Date.now());
    socket.on('pong', () => this.lastPongAt.set(socket, Date.now()));
    socket.on('message', (data, isBinary) => {
      void this.receive(peer, data, isBinary);
    });
    socket.once('close', disconnect);
    socket.once('error', disconnect);
  }

  private checkHeartbeats(): void {
    const now = Date.now();

    for (const socket of this.webSocketServer.clients) {
      const lastPongAt = this.lastPongAt.get(socket) ?? now;
      if (heartbeatHasExpired(lastPongAt, now)) {
        this.lastPongAt.delete(socket);
        socket.terminate();
      } else if (socket.readyState === WebSocket.OPEN) {
        socket.ping();
      }
    }
  }

  private async receive(
    peer: RealtimePeer,
    data: RawData,
    isBinary: boolean,
  ): Promise<void> {
    if (isBinary) {
      await this.hub.handle(peer, undefined);
      return;
    }

    try {
      await this.hub.handle(peer, JSON.parse(data.toString()) as unknown);
    } catch {
      await this.hub.handle(peer, undefined);
    }
  }

  private send(socket: WebSocket, event: ServerRealtimeEvent): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    if (socket.bufferedAmount > maxBufferedBytes) {
      socket.close(1013, 'Realtime client is too slow');
      return;
    }

    socket.send(JSON.stringify(event));
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

function rejectUpgrade(socket: Duplex, status: number, reason: string): void {
  socket.end(
    `HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
}
