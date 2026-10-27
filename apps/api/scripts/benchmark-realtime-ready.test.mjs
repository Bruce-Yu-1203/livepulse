import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  clearProfileReady,
  markProfileReady,
  waitForProfileReady,
} from './benchmark-realtime-ready.mjs';

describe('benchmark profiling readiness', () => {
  it('waits for every API profiler and clears stale markers', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'livepulse-profile-'));
    const prefix = join(directory, 'ready');
    try {
      await markProfileReady(prefix, 101);
      await markProfileReady(prefix, 102);
      await waitForProfileReady(prefix, [101, 102], 100);
      await clearProfileReady(prefix, [101, 102]);
      await expect(waitForProfileReady(prefix, [101], 50)).rejects.toThrow(
        /did not become ready/u,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
