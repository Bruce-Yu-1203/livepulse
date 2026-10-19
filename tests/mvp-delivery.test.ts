import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('MVP delivery assets', () => {
  it('documents local setup, seeded roles, validation, and the demo flow', async () => {
    const readme = await readFile(resolve(process.cwd(), 'README.md'), 'utf8');

    expect(readme).toContain('pnpm db:migrate');
    expect(readme).toContain('pnpm db:seed');
    expect(readme).toContain('viewer@livepulse.local');
    expect(readme).toContain('host@livepulse.local');
    expect(readme).toContain('admin@livepulse.local');
    expect(readme).toContain('## MVP demonstration');
    expect(readme).toContain('pnpm validate');
    expect(readme).toContain('livepulse_test');
  });

  it('provides idempotent seed data without a committed demo password', async () => {
    const seed = await readFile(
      resolve(process.cwd(), 'packages/db/prisma/seed.mjs'),
      'utf8',
    );
    const environment = await readFile(
      resolve(process.cwd(), '.env.example'),
      'utf8',
    );

    expect(seed).toContain('process.env.DEMO_PASSWORD');
    expect(seed).toContain('user.upsert');
    expect(seed).toContain('room.upsert');
    expect(environment).toContain('DEMO_PASSWORD=');
    expect(environment).not.toContain('correct horse battery staple');
  });

  it('builds non-root API and web images and orders service startup', async () => {
    const dockerfile = await readFile(
      resolve(process.cwd(), 'infra/compose/Dockerfile'),
      'utf8',
    );
    const compose = await readFile(
      resolve(process.cwd(), 'infra/compose/compose.yml'),
      'utf8',
    );

    expect(dockerfile).toContain('FROM workspace AS api-build');
    expect(dockerfile).toContain('FROM workspace AS web-build');
    expect(dockerfile.match(/USER node/g)).toHaveLength(2);
    expect(compose).toContain('service_completed_successfully');
    expect(compose).toContain('target: api');
    expect(compose).toContain('target: web');
    expect(compose).toContain('profiles: [tools]');
    expect(compose).not.toContain('mongodb');

    const e2eRunner = await readFile(
      resolve(process.cwd(), 'scripts/run-e2e.mjs'),
      'utf8',
    );
    expect(e2eRunner).toContain("'run', '--build', '--rm', 'seed'");
    expect(e2eRunner).toContain("'stop',\n      ...runningDevelopmentServices");
    expect(e2eRunner).toContain("'start', ...runningDevelopmentServices");
  });

  it('documents PostgreSQL as the only durable message store', async () => {
    const readme = await readFile(resolve(process.cwd(), 'README.md'), 'utf8');
    const requirements = await readFile(
      resolve(process.cwd(), 'LivePulse_Requirements_EN.md'),
      'utf8',
    );
    const architecture = await readFile(
      resolve(process.cwd(), 'LivePulse_Technical_Architecture_EN.md'),
      'utf8',
    );

    expect(readme).toContain('transactional data and message history');
    expect(readme).not.toContain('MongoDB for message history');
    expect(readme).not.toContain('27017');
    expect(requirements).toContain(
      'PostgreSQL is authoritative for saved history',
    );
    expect(architecture).toContain(
      'MongoDB is removed from the target architecture',
    );
  });
});
