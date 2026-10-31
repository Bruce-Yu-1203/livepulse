import {
  findRoomCategory,
  roomCategories,
  type RoomCategory,
} from '@livepulse/contracts';

export const BROWSE_PATH = '/browse';

export function categoryName(slug: string): string {
  return findRoomCategory(slug)?.name ?? roomCategories[0].name;
}

export function categoryHref(slug: RoomCategory): string {
  return `${BROWSE_PATH}/${slug}`;
}

/** Reads a category from a query or route value, ignoring unknown ones. */
export function parseCategoryParam(
  value: string | string[] | undefined,
): RoomCategory | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ? findRoomCategory(raw)?.slug : undefined;
}

/** Formats how long a room has been live, such as "2h 05m" or "12m". */
export function formatLiveFor(
  startedAt: string | null | undefined,
  now: number,
) {
  if (!startedAt) return null;
  const minutes = Math.max(
    0,
    Math.floor((now - new Date(startedAt).getTime()) / 60_000),
  );
  const hours = Math.floor(minutes / 60);
  return hours > 0
    ? `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
    : `${minutes}m`;
}
