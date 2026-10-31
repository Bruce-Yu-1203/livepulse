import {
  ApiErrorResponseSchema,
  FollowListResponseSchema,
  GetRoomResponseSchema,
  GetPublicUserResponseSchema,
  ListCategoriesResponseSchema,
  ListRoomsResponseSchema,
  LiveChannelsResponseSchema,
  SearchSuggestionsResponseSchema,
} from '@livepulse/contracts';
import type {
  GetPublicUserResponse,
  FollowListResponse,
  GetRoomResponse,
  ListCategoriesResponse,
  ListRoomsResponse,
  LiveChannel,
  RoomCategory,
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
  category?: RoomCategory,
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
  if (category) {
    url.searchParams.set('category', category);
  }

  return request(url, ListRoomsResponseSchema);
}

export async function listCategories(): Promise<ListCategoriesResponse> {
  return request(
    new URL('/api/v1/categories', apiOrigin),
    ListCategoriesResponseSchema,
  );
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

export async function listUserFollows(
  id: string,
  kind: 'followers' | 'following',
  page = 1,
): Promise<FollowListResponse> {
  const url = new URL(
    `/api/v1/users/${encodeURIComponent(id)}/${kind}`,
    apiOrigin,
  );
  url.searchParams.set('page', String(page));
  return request(url, FollowListResponseSchema);
}

export async function getRoom(id: string): Promise<GetRoomResponse> {
  return request(
    new URL(`/api/v1/rooms/${encodeURIComponent(id)}`, apiOrigin),
    GetRoomResponseSchema,
  );
}

/**
 * Live channels for the side rail's first render. Pass the viewer's cookie
 * header so followed hosts are grouped before hydration. A failure returns
 * an empty list; the rail refreshes itself in the browser.
 */
export async function listLiveChannels(
  cookie?: string,
): Promise<LiveChannel[]> {
  try {
    const response = await request(
      new URL('/api/v1/live-channels', apiOrigin),
      LiveChannelsResponseSchema,
      cookie ? { cookie } : {},
    );
    return response.items;
  } catch {
    return [];
  }
}

async function request<T>(
  url: URL,
  schema: { parse(value: unknown): T },
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { accept: 'application/json', ...headers },
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
