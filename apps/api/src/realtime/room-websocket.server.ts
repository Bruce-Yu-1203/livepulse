import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';

import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import type { ServerRealtimeEvent } from '@livepulse/contracts';
import { fromNodeHeaders } from 'better-auth/node';
import WebSocket, { WebSocketServer } from 'ws';
import type { RawData } from 'ws';

import {
  BetterAuthService,
  secureSessionCookieName,
  sessionCookieName,
} from '../auth/better-auth.service.js';
import type { AuthenticatedPrincipal } from '../auth/authenticated-request.js';
import { RoomRealtimeHub } from './room-realtime-hub.js';
import type { RealtimePeer } from './room-realtime-hub.js';
import { RealtimeMetricsService } from './realtime-metrics.service.js';

const maxFrameBytes = 4 * 1_024;
const maxBufferedBytes = 256 * 1_024;
export const heartbeatIntervalMs = 15_000;
export const heartbeatTimeoutMs = 45_000;

export function heartbeatHasExpired(lastPongAt: number, now: number): boolean {
  return now - lastPongAt >= heartbeatTimeoutMs;
}

export function hasBetterAuthSessionCookie(
  header: string | undefined,
): boolean {
  return [sessionCookieName, secureSessionCookieName].some((name) =>
    Boolean(readCookie(header, name)),
  );
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
    @Inject(BetterAuthService)
    private readonly authentication: BetterAuthService,
    @Inject(RoomRealtimeHub) private readonly hub: RoomRealtimeHub,
    @Inject(RealtimeMetricsService)
    private readonly metrics: RealtimeMetricsService,
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

    if (request.headers.origin !== this.authentication.trustedWebOrigin) {
      rejectUpgrade(socket, 403, 'Forbidden');
      return;
    }

    const headers = fromNodeHeaders(request.headers);
    const principal = await this.authentication.principalFromHeaders(headers);
    const hasSessionCookie = hasBetterAuthSessionCookie(request.headers.cookie);

    if (hasSessionCookie && !principal) {
      this.closeUnauthorized(request, socket, head);
      return;
    }

    this.webSocketServer.handleUpgrade(request, socket, head, (client) => {
      this.accept(client, principal, headers, hasSessionCookie);
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
    headers: Headers,
    hasSessionCookie: boolean,
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
        this.metrics.connectionClosed();
        void this.hub.disconnect(peer);
      }
    };

    this.metrics.connectionOpened();
    this.lastPongAt.set(socket, Date.now());
    socket.on('pong', () => this.lastPongAt.set(socket, Date.now()));
    socket.on('message', (data, isBinary) => {
      void this.receive(
        socket,
        peer,
        headers,
        hasSessionCookie,
        data,
        isBinary,
      );
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
    socket: WebSocket,
    peer: RealtimePeer,
    headers: Headers,
    hasSessionCookie: boolean,
    data: RawData,
    isBinary: boolean,
  ): Promise<void> {
    peer.principal = await this.authentication.principalFromHeaders(headers);
    if (!peer.principal && hasSessionCookie) {
      socket.close(4401, 'Authentication expired');
      return;
    }

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
