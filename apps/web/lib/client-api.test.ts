import { ApiErrorCode } from '@livepulse/contracts';
import { describe, expect, it } from 'vitest';

import { ClientApiError, parseApiResponse } from './client-api';

const valueSchema = {
  parse(value: unknown) {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('value' in value) ||
      typeof value.value !== 'number'
    ) {
      throw new TypeError('Expected a numeric value');
    }

    return { value: value.value };
  },
};

describe('parseApiResponse', () => {
  it('validates successful response bodies', async () => {
    const response = new Response(JSON.stringify({ value: 2 }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });

    await expect(parseApiResponse(response, valueSchema)).resolves.toEqual({
      value: 2,
    });
  });

  it('preserves stable API error details', async () => {
    const response = new Response(
      JSON.stringify({
        code: ApiErrorCode.RoomVersionConflict,
        message: 'The room changed since it was loaded',
        requestId: 'request-conflict-1',
      }),
      { headers: { 'content-type': 'application/json' }, status: 409 },
    );

    const error = await parseApiResponse(response, valueSchema).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ClientApiError);
    expect(error).toMatchObject({
      code: ApiErrorCode.RoomVersionConflict,
      status: 409,
    });
  });
});
