import { ApiErrorResponseSchema } from '@livepulse/contracts';

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
  const response = await clientFetch(path, init);

  return parseApiResponse(response, schema);
}

export async function clientApiVoidRequest(
  path: string,
  init: RequestInit = {},
): Promise<void> {
  const response = await clientFetch(path, init);

  return parseVoidApiResponse(response);
}

async function clientFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    credentials: 'include',
  });
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

export async function parseVoidApiResponse(response: Response): Promise<void> {
  if (!response.ok) {
    throw await toClientApiError(response);
  }
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
  const providerMessage =
    typeof body === 'object' &&
    body !== null &&
    'message' in body &&
    typeof body.message === 'string'
      ? body.message
      : undefined;

  return new ClientApiError(
    parsed.success
      ? parsed.data.message
      : (providerMessage ?? 'The API request failed.'),
    status,
    parsed.success ? parsed.data.code : undefined,
  );
}
