import { cookies } from 'next/headers';
import type { LiveChannel } from '@livepulse/contracts';

import { listLiveChannels } from '../lib/api';

/** Loads the side rail's live channels on the server as the current viewer. */
export async function loadLiveChannels(): Promise<LiveChannel[]> {
  let cookie: string | undefined;
  try {
    cookie = (await cookies()).toString() || undefined;
  } catch {
    // Outside a request (tests, static rendering) there are no cookies.
  }
  return listLiveChannels(cookie);
}
