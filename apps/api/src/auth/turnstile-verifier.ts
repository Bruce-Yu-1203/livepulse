import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ApiErrorCode } from '@livepulse/contracts';

const siteverifyUrl =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const testSecrets = new Set([
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
]);

@Injectable()
export class TurnstileVerifier {
  public async verify(token: string, ip: string): Promise<void> {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (
      !secret ||
      (process.env.NODE_ENV === 'production' && testSecrets.has(secret))
    ) {
      this.unavailable();
    }

    let result: unknown;
    try {
      const response = await fetch(siteverifyUrl, {
        body: new URLSearchParams({
          remoteip: ip,
          response: token,
          secret,
        }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) this.unavailable();
      result = await response.json();
    } catch {
      this.unavailable();
    }

    if (
      !result ||
      typeof result !== 'object' ||
      !('success' in result) ||
      typeof result.success !== 'boolean'
    ) {
      this.unavailable();
    }
    if (!result.success) {
      throw new HttpException(
        {
          code: ApiErrorCode.TurnstileFailed,
          message: 'Human verification failed. Please try again.',
        },
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private unavailable(): never {
    throw new HttpException(
      {
        code: ApiErrorCode.ServiceUnavailable,
        message: 'Human verification is temporarily unavailable.',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
