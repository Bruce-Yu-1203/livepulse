import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@livepulse/db';

import { DatabaseService } from '../database/database.service.js';
import { DatabaseUnavailableError } from './auth.errors.js';
import type { SessionUser } from './auth-token.service.js';

export interface PasswordUser extends SessionUser {
  passwordHash: string;
}

interface CreateSessionInput {
  expiresAt: Date;
  id: string;
  tokenHash: string;
  userId: string;
}

interface RotateSessionInput {
  currentTokenHash: string;
  id: string;
  nextExpiresAt: Date;
  nextTokenHash: string;
  now: Date;
}

export interface SessionsRepository {
  createSession(input: CreateSessionInput): Promise<void>;
  findUserByEmail(email: string): Promise<PasswordUser | undefined>;
  revokeSession(id: string, tokenHash: string, now: Date): Promise<void>;
  rotateSession(input: RotateSessionInput): Promise<SessionUser | undefined>;
}

@Injectable()
export class PrismaSessionsRepository implements SessionsRepository {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public async findUserByEmail(
    email: string,
  ): Promise<PasswordUser | undefined> {
    try {
      const user = await this.database.client.user.findUnique({
        select: {
          createdAt: true,
          email: true,
          id: true,
          passwordHash: true,
          role: true,
        },
        where: { email },
      });

      return user ?? undefined;
    } catch (error) {
      throwDatabaseError(error);
    }
  }

  public async createSession(input: CreateSessionInput): Promise<void> {
    try {
      await this.database.client.refreshSession.create({
        data: {
          expiresAt: input.expiresAt,
          id: input.id,
          tokenHash: input.tokenHash,
          userId: input.userId,
        },
      });
    } catch (error) {
      throwDatabaseError(error);
    }
  }

  public async rotateSession(
    input: RotateSessionInput,
  ): Promise<SessionUser | undefined> {
    try {
      return await this.database.client.$transaction(async (transaction) => {
        const updated = await transaction.refreshSession.updateMany({
          data: {
            expiresAt: input.nextExpiresAt,
            tokenHash: input.nextTokenHash,
          },
          where: {
            expiresAt: { gt: input.now },
            id: input.id,
            revokedAt: null,
            tokenHash: input.currentTokenHash,
          },
        });

        if (updated.count !== 1) {
          return undefined;
        }

        const session = await transaction.refreshSession.findUnique({
          select: {
            user: {
              select: {
                createdAt: true,
                email: true,
                id: true,
                role: true,
              },
            },
          },
          where: { id: input.id },
        });

        return session?.user;
      });
    } catch (error) {
      throwDatabaseError(error);
    }
  }

  public async revokeSession(
    id: string,
    tokenHash: string,
    now: Date,
  ): Promise<void> {
    try {
      await this.database.client.refreshSession.updateMany({
        data: { revokedAt: now },
        where: {
          id,
          revokedAt: null,
          tokenHash,
        },
      });
    } catch (error) {
      throwDatabaseError(error);
    }
  }
}

function throwDatabaseError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P1000', 'P1001', 'P1002'].includes(error.code))
  ) {
    throw new DatabaseUnavailableError({ cause: error });
  }

  throw error;
}
