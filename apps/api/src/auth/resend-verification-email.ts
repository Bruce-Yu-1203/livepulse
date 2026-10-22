import { Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class ResendVerificationEmail {
  public async send(email: string, code: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.RESEND_FROM_EMAIL?.trim();

    if (!apiKey || !from) {
      throw new ServiceUnavailableException(
        'Registration email is not configured',
      );
    }

    const response = await fetch('https://api.resend.com/emails', {
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Your LivePulse verification code',
        text: `Your LivePulse verification code is ${code}. It expires in 10 minutes.`,
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Registration email could not be sent',
      );
    }
  }
}
