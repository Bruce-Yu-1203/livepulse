import {
  ApiErrorResponseSchema,
  GetRoomResponseSchema,
  GetPublicUserResponseSchema,
  ListRoomsResponseSchema,
  SearchSuggestionsResponseSchema,
} from '@livepulse/contracts';
import type {
  GetPublicUserResponse,
  GetRoomResponse,
  ListRoomsResponse,
  SearchSuggestionsResponse,
} from '@livepulse/contracts';

const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:3001';

export class ApiRequestError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function listRooms(
  cursor?: string,
  query?: string,
  hostId?: string,
): Promise<ListRoomsResponse> {
  const url = new URL('/api/v1/rooms', apiOrigin);
  url.searchParams.set('limit', '12');

  if (cursor) {
    url.searchParams.set('cursor', cursor);
  }
  if (query) {
    url.searchParams.set('q', query);
  }
  if (hostId) {
    url.searchParams.set('hostId', hostId);
  }

  return request(url, ListRoomsResponseSchema);
}

export async function searchSuggestions(
  query: string,
  limit = 6,
): Promise<SearchSuggestionsResponse> {
  const url = new URL('/api/v1/search', apiOrigin);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));
  return request(url, SearchSuggestionsResponseSchema);
}

export async function getPublicUser(
  id: string,
): Promise<GetPublicUserResponse> {
  return request(
    new URL(`/api/v1/users/${encodeURIComponent(id)}`, apiOrigin),
    GetPublicUserResponseSchema,
  );
}

export async function getRoom(id: string): Promise<GetRoomResponse> {
  return request(
    new URL(`/api/v1/rooms/${encodeURIComponent(id)}`, apiOrigin),
    GetRoomResponseSchema,
  );
}

async function request<T>(
  url: URL,
  schema: { parse(value: unknown): T },
): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  const body: unknown = await response.json();

  if (!response.ok) {
    const parsed = ApiErrorResponseSchema.safeParse(body);
    throw new ApiRequestError(
      parsed.success ? parsed.data.message : 'The API request failed',
      response.status,
    );
  }

  return schema.parse(body);
}
