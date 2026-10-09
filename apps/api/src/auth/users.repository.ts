import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@livepulse/db';

import { DatabaseService } from '../database/database.service.js';
import {
  DatabaseUnavailableError,
  EmailAlreadyExistsError,
} from './auth.errors.js';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
}

export interface RegisteredUser {
  createdAt: Date;
  email: string;
  id: string;
  role: 'VIEWER';
}

export interface UsersRepository {
  create(input: CreateUserInput): Promise<RegisteredUser>;
}

@Injectable()
export class PrismaUsersRepository implements UsersRepository {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public async create(input: CreateUserInput): Promise<RegisteredUser> {
    try {
      const user = await this.database.client.user.create({
        data: {
          email: input.email,
          passwordHash: input.passwordHash,
          role: 'VIEWER',
        },
        select: {
          createdAt: true,
          email: true,
          id: true,
        },
      });

      return {
        ...user,
        role: 'VIEWER',
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new EmailAlreadyExistsError();
      }

      if (
        error instanceof Prisma.PrismaClientInitializationError ||
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P1000', 'P1001', 'P1002'].includes(error.code))
      ) {
        throw new DatabaseUnavailableError({ cause: error });
      }

      throw error;
    }
  }
}
