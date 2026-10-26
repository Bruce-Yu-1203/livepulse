import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  RegisterRequestSchema,
  RegistrationCompleteRequestSchema,
} from '@livepulse/contracts';

import { DatabaseService } from '../database/database.service.js';
import { BetterAuthService } from './better-auth.service.js';
import { ScryptPasswordHasher } from './password-hasher.js';
import { ResendVerificationEmail } from './resend-verification-email.js';
import { TurnstileVerifier } from './turnstile-verifier.js';

const verificationLifetimeMs = 10 * 60_000;
const resendCooldownMs = 60_000;
const maximumCodeAttempts = 5;

interface LockedChallenge {
  email: string;
  username: string;
  password_hash: string;
  code_hash: string;
  expires_at: Date;
  attempts: number;
}

@Injectable()
export class RegistrationService {
  private readonly passwords = new ScryptPasswordHasher();

  public constructor(
    private readonly database: DatabaseService,
    private readonly authentication: BetterAuthService,
    private readonly email: ResendVerificationEmail,
    private readonly turnstile: TurnstileVerifier,
  ) {}

  public async start(input: unknown, ip: string): Promise<void> {
    const parsed = RegisterRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw registrationError(
        ApiErrorCode.ValidationError,
        'Enter a valid email, a unique username of at least 5 characters, and a password with at least 8 characters including letters and numbers.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const { email, username, password, turnstileToken } = parsed.data;
    await this.turnstile.verify(turnstileToken, ip);
    const [existingEmail, existingUsername] = await Promise.all([
      this.database.client.user.findUnique({
        where: { email },
        select: { id: true },
      }),
      this.database.client.user.findUnique({
        where: { username },
        select: { id: true },
      }),
    ]);

    if (existingEmail) {
      throw registrationError(
        ApiErrorCode.EmailAlreadyExists,
        'This email is already registered.',
        HttpStatus.CONFLICT,
      );
    }
    if (existingUsername) {
      throw registrationError(
        ApiErrorCode.UsernameAlreadyExists,
        'This username is already taken.',
        HttpStatus.CONFLICT,
      );
    }

    const now = new Date();
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = hashRegistrationCode(
      this.authentication.registrationSecret,
      email,
      code,
    );
    const passwordHash = await this.passwords.hash(password);
    const rows = await this.database.client.$queryRaw<{ email: string }[]>`
      INSERT INTO "registration_challenges"
        ("email", "username", "password_hash", "code_hash", "expires_at", "last_sent_at", "attempts")
      VALUES
        (${email}, ${username}, ${passwordHash}, ${codeHash}, ${new Date(now.getTime() + verificationLifetimeMs)}, ${now}, 0)
      ON CONFLICT ("email") DO UPDATE SET
        "username" = EXCLUDED."username",
        "password_hash" = EXCLUDED."password_hash",
        "code_hash" = EXCLUDED."code_hash",
        "expires_at" = EXCLUDED."expires_at",
        "last_sent_at" = EXCLUDED."last_sent_at",
        "attempts" = 0
      WHERE "registration_challenges"."last_sent_at" <= ${new Date(now.getTime() - resendCooldownMs)}
      RETURNING "email"
    `;

    if (rows.length === 0) {
      throw registrationError(
        ApiErrorCode.RegistrationRateLimited,
        'Please wait 60 seconds before requesting another code.',
        HttpStatus.TOO_MANY_REQUESTS,
        resendCooldownMs,
      );
    }

    try {
      await this.email.send(email, code);
    } catch {
      await this.database.client.registrationChallenge.deleteMany({
        where: { email, codeHash },
      });
      throw registrationError(
        ApiErrorCode.ServiceUnavailable,
        'The verification email could not be sent. Please try again.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  public async complete(input: unknown): Promise<string> {
    const parsed = RegistrationCompleteRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw registrationError(
        ApiErrorCode.ValidationError,
        'Enter the six-digit email code.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const { email, code } = parsed.data;
    let result:
      | { kind: 'invalid' }
      | { kind: 'email-taken' }
      | { kind: 'username-taken' }
      | { kind: 'created'; userId: string };
    try {
      result = await this.database.client.$transaction(async (transaction) => {
        const challenges = await transaction.$queryRaw<LockedChallenge[]>`
        SELECT "email", "username", "password_hash", "code_hash", "expires_at", "attempts"
        FROM "registration_challenges"
        WHERE "email" = ${email}
        FOR UPDATE
      `;
        const challenge = challenges[0];
        if (
          !challenge ||
          challenge.expires_at.getTime() <= Date.now() ||
          challenge.attempts >= maximumCodeAttempts
        ) {
          return { kind: 'invalid' as const };
        }

        const submittedHash = hashRegistrationCode(
          this.authentication.registrationSecret,
          email,
          code,
        );
        if (
          !timingSafeEqual(
            Buffer.from(challenge.code_hash, 'hex'),
            Buffer.from(submittedHash, 'hex'),
          )
        ) {
          await transaction.registrationChallenge.update({
            where: { email },
            data: { attempts: { increment: 1 } },
          });
          return { kind: 'invalid' as const };
        }

        const [existingEmail, existingUsername] = await Promise.all([
          transaction.user.findUnique({
            where: { email },
            select: { id: true },
          }),
          transaction.user.findUnique({
            where: { username: challenge.username },
            select: { id: true },
          }),
        ]);
        if (existingEmail) return { kind: 'email-taken' as const };
        if (existingUsername) return { kind: 'username-taken' as const };

        const user = await transaction.user.create({
          data: {
            email,
            emailVerified: true,
            name: challenge.username,
            username: challenge.username,
          },
        });
        await transaction.account.create({
          data: {
            accountId: user.id,
            password: challenge.password_hash,
            providerId: 'credential',
            userId: user.id,
          },
        });
        await transaction.registrationChallenge.delete({ where: { email } });
        return { kind: 'created' as const, userId: user.id };
      });
    } catch (caught) {
      if (isUniqueConstraintError(caught)) {
        const challenge =
          await this.database.client.registrationChallenge.findUnique({
            where: { email },
            select: { username: true },
          });
        const existingUsername = challenge
          ? await this.database.client.user.findUnique({
              where: { username: challenge.username },
              select: { id: true },
            })
          : null;
        throw registrationError(
          existingUsername
            ? ApiErrorCode.UsernameAlreadyExists
            : ApiErrorCode.EmailAlreadyExists,
          existingUsername
            ? 'This username is already taken. Choose another username.'
            : 'This email is already registered.',
          HttpStatus.CONFLICT,
        );
      }
      throw caught;
    }

    if (result.kind === 'email-taken') {
      throw registrationError(
        ApiErrorCode.EmailAlreadyExists,
        'This email is already registered.',
        HttpStatus.CONFLICT,
      );
    }
    if (result.kind === 'username-taken') {
      throw registrationError(
        ApiErrorCode.UsernameAlreadyExists,
        'This username is already taken. Choose another username.',
        HttpStatus.CONFLICT,
      );
    }
    if (result.kind === 'invalid') {
      throw registrationError(
        ApiErrorCode.RegistrationCodeInvalid,
        'The code is invalid or expired.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return result.userId;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

export function hashRegistrationCode(
  secret: string,
  email: string,
  code: string,
): string {
  return createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');
}

function registrationError(
  code: (typeof ApiErrorCode)[keyof typeof ApiErrorCode],
  message: string,
  status: HttpStatus,
  retryAfterMs?: number,
): HttpException {
  return new HttpException(
    { code, message, ...(retryAfterMs ? { retryAfterMs } : {}) },
    status,
  );
}
