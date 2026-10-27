import { access, unlink, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

export async function clearProfileReady(prefix, pids) {
  await Promise.all(
    pids.map((pid) =>
      unlink(`${prefix}.${pid}`).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      }),
    ),
  );
}

export async function markProfileReady(prefix, pid) {
  await writeFile(`${prefix}.${pid}`, 'ready\n');
}

export async function waitForProfileReady(prefix, pids, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const states = await Promise.all(
      pids.map((pid) =>
        access(`${prefix}.${pid}`).then(
          () => true,
          () => false,
        ),
      ),
    );
    if (states.every(Boolean)) return;
    await setTimeout(20);
  }
  throw new Error('Benchmark API profiling did not become ready');
}
