import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const script = fileURLToPath(
  new URL('./run-pipeline-benchmark.sh', import.meta.url),
);

describe('pipeline benchmark orchestrator', () => {
  it('has valid bash syntax', () => {
    expect(spawnSync('bash', ['-n', script]).status).toBe(0);
  });

  it('rejects unknown tests and modes before touching any service', () => {
    for (const args of [
      ['spike', 'direct', 'a', '/tmp/unused'],
      ['outage', 'queue', 'a', '/tmp/unused'],
      ['outage', 'kafka', 'Run A', '/tmp/unused'],
      ['burst', 'kafka', 'a'],
    ]) {
      const result = spawnSync('bash', [script, ...args], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/^Usage: run-pipeline-benchmark\.sh/u);
    }
  });
});
