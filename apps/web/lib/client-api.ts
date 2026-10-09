import { ApiErrorResponseSchema } from '@livepulse/contracts';

import { readBrowserCookie } from './browser-cookies';

interface ResponseSchema<T> {
  parse(value: unknown): T;
}

export class ClientApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ClientApiError';
  }
}

export async function clientApiRequest<T>(
  path: string,
  schema: ResponseSchema<T>,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? 'GET').toUpperCase();

  if (!['GET', 'HEAD'].includes(method)) {
    const csrfResponse = await fetch('/api/v1/auth/csrf', {
      credentials: 'include',
    });

    if (!csrfResponse.ok) {
      throw await toClientApiError(csrfResponse);
    }

    const csrfToken = readBrowserCookie(document.cookie, 'lp_csrf');

    if (!csrfToken) {
      throw new ClientApiError('The secure request cookie is missing.', 403);
    }

    headers.set('x-csrf-token', csrfToken);
  }

  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers,
  });

  return parseApiResponse(response, schema);
}

export async function parseApiResponse<T>(
  response: Response,
  schema: ResponseSchema<T>,
): Promise<T> {
  const body: unknown = await response.json();

  if (!response.ok) {
    throw toClientApiErrorFromBody(response.status, body);
  }

  return schema.parse(body);
}

async function toClientApiError(response: Response): Promise<ClientApiError> {
  const body: unknown = await response.json();
  return toClientApiErrorFromBody(response.status, body);
}

function toClientApiErrorFromBody(
  status: number,
  body: unknown,
): ClientApiError {
  const parsed = ApiErrorResponseSchema.safeParse(body);

  return new ClientApiError(
    parsed.success ? parsed.data.message : 'The API request failed.',
    status,
    parsed.success ? parsed.data.code : undefined,
  );
}
