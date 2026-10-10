import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ApiErrorCode, ClientRealtimeEventSchema } from '@livepulse/contracts';
import type {
  MessageCreatedEvent,
  ServerRealtimeEvent,
} from '@livepulse/contracts';

import type { AuthenticatedPrincipal } from '../auth/authenticated-request.js';
import type { RealtimeMessagePublisher } from '../messages/messages.service.js';
import { REALTIME_MESSAGE_PUBLISHER } from '../messages/messages.tokens.js';
import type { RealtimeRoomSource } from './realtime-room-source.js';
import { REALTIME_ROOM_SOURCE } from './realtime.tokens.js';

export interface RealtimePeer {
  id: string;
  principal: AuthenticatedPrincipal | undefined;
  send(event: ServerRealtimeEvent): void;
}

interface RateBucket {
  lastRefillAt: number;
  tokens: number;
}

interface AcceptedMessage {
  event: MessageCreatedEvent;
  text: string;
}

const bucketCapacity = 5;
const refillPerMillisecond = 1 / 1_000;
const maxAcceptedMessages = 10_000;

@Injectable()
export class RoomRealtimeHub {
  private readonly roomMembers = new Map<string, Set<RealtimePeer>>();
  private readonly joinedRoomByPeer = new Map<string, string>();
  private readonly rateBuckets = new Map<string, RateBucket>();
  private readonly acceptedMessages = new Map<string, AcceptedMessage>();

  public constructor(
    @Inject(REALTIME_ROOM_SOURCE)
    private readonly rooms: RealtimeRoomSource,
    @Inject(REALTIME_MESSAGE_PUBLISHER)
    private readonly publisher: RealtimeMessagePublisher,
  ) {}

  public async handle(peer: RealtimePeer, input: unknown): Promise<void> {
    const parsed = ClientRealtimeEventSchema.safeParse(input);

    if (!parsed.success) {
      this.sendError(
        peer,
        readRequestId(input),
        ApiErrorCode.RealtimeInvalidEvent,
        'The realtime event is invalid',
      );
      return;
    }

    if (parsed.data.type === 'room.join') {
      await this.join(peer, parsed.data.requestId, parsed.data.payload.roomId);
      return;
    }

    await this.sendMessage(peer, parsed.data);
  }

  public disconnect(peer: RealtimePeer): void {
    const roomId = this.joinedRoomByPeer.get(peer.id);

    if (roomId) {
      this.removeFromRoom(peer, roomId);
    }

    this.rateBuckets.delete(peer.id);
  }

  private async join(
    peer: RealtimePeer,
    requestId: string,
    roomId: string,
  ): Promise<void> {
    const live = await this.roomIsLive(peer, requestId, roomId);

    if (live === undefined) {
      return;
    }

    if (!live) {
      this.sendError(
        peer,
        requestId,
        ApiErrorCode.RealtimeRoomNotLive,
        'The room is not accepting realtime joins',
      );
      return;
    }

    const previousRoomId = this.joinedRoomByPeer.get(peer.id);
    if (previousRoomId && previousRoomId !== roomId) {
      this.removeFromRoom(peer, previousRoomId);
    }

    const members = this.roomMembers.get(roomId) ?? new Set<RealtimePeer>();
    members.add(peer);
    this.roomMembers.set(roomId, members);
    this.joinedRoomByPeer.set(peer.id, roomId);
    peer.send({
      payload: { connectedAt: new Date().toISOString(), roomId },
      requestId,
      type: 'room.joined',
      v: 1,
    });
  }

  private async sendMessage(
    peer: RealtimePeer,
    event: Extract<
      ReturnType<typeof ClientRealtimeEventSchema.parse>,
      { type: 'message.send' }
    >,
  ): Promise<void> {
    const { clientMessageId, roomId, text } = event.payload;

    if (!peer.principal) {
      this.sendError(
        peer,
        event.requestId,
        ApiErrorCode.RealtimeAuthenticationRequired,
        'Sign in before sending a message',
      );
      return;
    }

    if (this.joinedRoomByPeer.get(peer.id) !== roomId) {
      this.sendError(
        peer,
        event.requestId,
        ApiErrorCode.RealtimeNotJoined,
        'Join the room before sending a message',
      );
      return;
    }

    const idempotencyKey = [
      peer.principal.userId,
      roomId,
      clientMessageId,
    ].join(':');
    const accepted = this.acceptedMessages.get(idempotencyKey);

    if (accepted) {
      if (accepted.text !== text) {
        this.sendError(
          peer,
          event.requestId,
          ApiErrorCode.RealtimeMessageConflict,
          'A client message identifier cannot be reused with different text',
        );
        return;
      }

      peer.send({ ...accepted.event, requestId: event.requestId });
      return;
    }

    const live = await this.roomIsLive(peer, event.requestId, roomId);

    if (live === undefined) {
      return;
    }

    if (!live) {
      this.sendError(
        peer,
        event.requestId,
        ApiErrorCode.RealtimeRoomNotLive,
        'The room is no longer accepting messages',
      );
      return;
    }

    const retryAfterMs = this.consumeRateToken(peer.id);
    if (retryAfterMs !== undefined) {
      this.sendError(
        peer,
        event.requestId,
        ApiErrorCode.RealtimeRateLimited,
        'Wait before sending another message',
        retryAfterMs,
      );
      return;
    }

    const payload = {
      acceptedAt: new Date().toISOString(),
      authorId: peer.principal.userId,
      clientMessageId,
      messageId: stableMessageId(idempotencyKey),
      roomId,
      text,
    };
    let published: Awaited<ReturnType<RealtimeMessagePublisher['publish']>>;

    try {
      published = await this.publisher.publish(payload);
    } catch {
      this.sendError(
        peer,
        event.requestId,
        ApiErrorCode.ServiceUnavailable,
        'Message persistence is temporarily unavailable',
      );
      return;
    }

    if (published.kind === 'conflict') {
      this.sendError(
        peer,
        event.requestId,
        ApiErrorCode.RealtimeMessageConflict,
        'A client message identifier cannot be reused with different text',
      );
      return;
    }

    const created: MessageCreatedEvent = {
      payload: published.message,
      requestId: event.requestId,
      type: 'message.created',
      v: 1,
    };

    if (published.kind === 'duplicate') {
      peer.send(created);
      return;
    }

    if (this.acceptedMessages.size >= maxAcceptedMessages) {
      const oldestKey = this.acceptedMessages.keys().next().value;
      if (oldestKey) {
        this.acceptedMessages.delete(oldestKey);
      }
    }

    this.acceptedMessages.set(idempotencyKey, { event: created, text });

    for (const member of this.roomMembers.get(roomId) ?? []) {
      member.send(created);
    }
  }

  private consumeRateToken(peerId: string): number | undefined {
    const now = Date.now();
    const bucket = this.rateBuckets.get(peerId) ?? {
      lastRefillAt: now,
      tokens: bucketCapacity,
    };
    const elapsed = Math.max(0, now - bucket.lastRefillAt);
    bucket.tokens = Math.min(
      bucketCapacity,
      bucket.tokens + elapsed * refillPerMillisecond,
    );
    bucket.lastRefillAt = now;

    if (bucket.tokens < 1) {
      this.rateBuckets.set(peerId, bucket);
      return Math.ceil((1 - bucket.tokens) / refillPerMillisecond);
    }

    bucket.tokens -= 1;
    this.rateBuckets.set(peerId, bucket);
    return undefined;
  }

  private async roomIsLive(
    peer: RealtimePeer,
    requestId: string,
    roomId: string,
  ): Promise<boolean | undefined> {
    try {
      return await this.rooms.isLive(roomId);
    } catch {
      this.sendError(
        peer,
        requestId,
        ApiErrorCode.ServiceUnavailable,
        'Realtime room validation is temporarily unavailable',
      );
      return undefined;
    }
  }

  private removeFromRoom(peer: RealtimePeer, roomId: string): void {
    const members = this.roomMembers.get(roomId);
    members?.delete(peer);

    if (members?.size === 0) {
      this.roomMembers.delete(roomId);
    }

    this.joinedRoomByPeer.delete(peer.id);
  }

  private sendError(
    peer: RealtimePeer,
    requestId: string,
    code: (typeof ApiErrorCode)[keyof typeof ApiErrorCode],
    message: string,
    retryAfterMs?: number,
  ): void {
    peer.send({
      payload: {
        code,
        message,
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      },
      requestId,
      type: 'error',
      v: 1,
    });
  }
}

export function stableMessageId(input: string): string {
  const hex = createHash('sha256').update(input, 'utf8').digest('hex');
  const variant = ((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(
    16,
  );

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

function readRequestId(input: unknown): string {
  if (
    typeof input === 'object' &&
    input !== null &&
    'requestId' in input &&
    typeof input.requestId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.requestId,
    )
  ) {
    return input.requestId;
  }

  return randomUUID();
}
