import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResendVerificationEmail } from './resend-verification-email.js';

const originalKey = process.env.RESEND_API_KEY;
const originalFrom = process.env.RESEND_FROM_EMAIL;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalKey;
  if (originalFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
  else process.env.RESEND_FROM_EMAIL = originalFrom;
});

describe('ResendVerificationEmail', () => {
  it('sends a private code through the Resend API', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.RESEND_FROM_EMAIL = 'LivePulse <verify@example.com>';
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'email-id' }), { status: 200 }),
      );

    await new ResendVerificationEmail().send('viewer@example.com', '123456');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test_key',
        }),
      }),
    );
    const options = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(options?.body))).toMatchObject({
      from: 'LivePulse <verify@example.com>',
      to: ['viewer@example.com'],
    });
    expect(String(options?.body)).toContain('123456');
  });

  it('fails clearly when credentials are missing or Resend rejects the email', async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    await expect(
      new ResendVerificationEmail().send('a@b.com', '123456'),
    ).rejects.toThrow('Registration email is not configured');

    process.env.RESEND_API_KEY = 're_test_key';
    process.env.RESEND_FROM_EMAIL = 'verify@example.com';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('error', { status: 422 }),
    );
    await expect(
      new ResendVerificationEmail().send('a@b.com', '123456'),
    ).rejects.toThrow('Registration email could not be sent');
  });
});
