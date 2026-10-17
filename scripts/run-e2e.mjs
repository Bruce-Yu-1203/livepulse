import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import process from 'node:process';

const composeArguments = [
  'compose',
  '--project-name',
  'livepulse-e2e',
  '--file',
  'infra/compose/compose.yml',
];
const environment = {
  ...process.env,
  ACCESS_TOKEN_SECRET: randomBytes(32).toString('hex'),
  DEMO_PASSWORD: randomBytes(24).toString('base64url'),
  E2E_BASE_URL: 'http://localhost:3000',
};

let failed = false;

try {
  run('docker', [...composeArguments, 'down', '--volumes', '--remove-orphans']);
  run('docker', [...composeArguments, 'up', '--build', '--detach', '--wait']);
  run('docker', [...composeArguments, 'run', '--rm', 'seed']);
  run('pnpm', ['exec', 'playwright', 'test']);
} catch (error) {
  failed = true;
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
} finally {
  const cleanup = spawnSync(
    'docker',
    [...composeArguments, 'down', '--volumes', '--remove-orphans'],
    { env: environment, stdio: 'inherit' },
  );

  if (cleanup.status !== 0) {
    failed = true;
    process.stderr.write(
      'The isolated end-to-end stack could not be cleaned up.\n',
    );
  }
}

process.exitCode = failed ? 1 : 0;

function run(command, args) {
  const result = spawnSync(command, args, {
    env: environment,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited with ${result.status}`,
    );
  }
}
