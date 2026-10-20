import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const workflowPath = resolve(process.cwd(), '.github/workflows/ci.yml');

describe('CI workflow', () => {
  it('checks pull requests, main pushes, and merge queue commits', async () => {
    const workflow = await readFile(workflowPath, 'utf8');

    expect(workflow).toMatch(/pull_request:\s*\n\s+branches: \[main\]/u);
    expect(workflow).toMatch(/push:\s*\n\s+branches: \[main\]/u);
    expect(workflow).toContain('merge_group:');
    expect(workflow).toContain('contents: read');
  });

  it('runs all existing test layers and a production build', async () => {
    const workflow = await readFile(workflowPath, 'utf8');

    expect(workflow).toContain('pnpm validate');
    expect(workflow).toContain('pnpm test:db');
    expect(workflow).toContain('pnpm test:e2e');
    expect(workflow).toContain(
      'pnpm exec playwright install --with-deps chromium',
    );
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('pnpm install --frozen-lockfile');
  });

  it('uses disposable database services and applies migrations before database tests', async () => {
    const workflow = await readFile(workflowPath, 'utf8');

    expect(workflow).toContain('image: postgres:18.6-alpine3.24');
    expect(workflow).toContain('image: redis:8.10.2-alpine3.23');
    expect(workflow).toContain('livepulse_test?schema=public');
    expect(workflow).toContain(
      'prisma migrate deploy --config prisma7.config.ts',
    );
    expect(workflow.indexOf('prisma migrate deploy')).toBeLessThan(
      workflow.indexOf('pnpm test:db'),
    );
    expect(workflow).not.toContain('api.livepulse.tech');
  });
});
