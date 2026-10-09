import { Inject, Injectable } from '@nestjs/common';
import type { RegisterRequest } from '@livepulse/contracts';

import { PASSWORD_HASHER, USERS_REPOSITORY } from './auth.tokens.js';
import type { PasswordHasher } from './password-hasher.js';
import type { RegisteredUser, UsersRepository } from './users.repository.js';

@Injectable()
export class RegistrationService {
  public constructor(
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
  ) {}

  public async register(input: RegisterRequest): Promise<RegisteredUser> {
    const passwordHash = await this.passwordHasher.hash(input.password);

    return this.users.create({
      email: input.email,
      passwordHash,
    });
  }
}
