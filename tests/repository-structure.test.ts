import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

interface RootPackage {
  engines: {
    node: string;
    pnpm: string;
  };
  packageManager: string;
  private: boolean;
}

describe('repository foundation', () => {
  it('pins the package manager and supported runtime family', async () => {
    const packagePath = resolve(process.cwd(), 'package.json');
    const packageJson = JSON.parse(
      await readFile(packagePath, 'utf8'),
    ) as RootPackage;

    expect(packageJson.private).toBe(true);
    expect(packageJson.packageManager).toBe('pnpm@11.19.0');
    expect(packageJson.engines.node).toBe('>=24.0.0 <25');
    expect(packageJson.engines.pnpm).toBe('>=11.0.0 <12');
  });

  it('discovers applications and shared packages as workspaces', async () => {
    const workspacePath = resolve(process.cwd(), 'pnpm-workspace.yaml');
    const workspace = await readFile(workspacePath, 'utf8');

    expect(workspace).toContain('- apps/*');
    expect(workspace).toContain('- packages/*');
  });

  it('keeps generated dependencies and package caches out of Git', async () => {
    const gitignorePath = resolve(process.cwd(), '.gitignore');
    const gitignore = await readFile(gitignorePath, 'utf8');

    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('.pnpm-store/');
    expect(gitignore).toContain('.next/');
    expect(gitignore).toContain('.env.*');
    expect(gitignore).toContain('*.log');
  });
});
