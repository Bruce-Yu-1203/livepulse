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
  scripts: {
    format: string;
    typecheck: string;
  };
}

interface BaseTypeScriptConfig {
  compilerOptions: {
    baseUrl?: string;
    noEmitOnError: boolean;
    paths: Record<string, string[]>;
  };
}

interface RootTypeScriptConfig {
  compilerOptions: {
    emitDecoratorMetadata: boolean;
    experimentalDecorators: boolean;
  };
}

interface ApiBuildTypeScriptConfig {
  compilerOptions: {
    paths: Record<string, string[]>;
  };
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

  it('checks TypeScript React files and the web workspace', async () => {
    const packagePath = resolve(process.cwd(), 'package.json');
    const packageJson = JSON.parse(
      await readFile(packagePath, 'utf8'),
    ) as RootPackage;

    expect(packageJson.scripts.format).toContain('ts,tsx');
    expect(packageJson.scripts.typecheck).toContain('@livepulse/web typecheck');
  });

  it('discovers applications and shared packages as workspaces', async () => {
    const workspacePath = resolve(process.cwd(), 'pnpm-workspace.yaml');
    const workspace = await readFile(workspacePath, 'utf8');

    expect(workspace).toContain('- apps/*');
    expect(workspace).toContain('- packages/*');
    expect(workspace).toContain("'@prisma/engines': true");
    expect(workspace).toContain('esbuild: true');
    expect(workspace).toContain('prisma: true');
    expect(workspace).not.toContain('set this to true or false');
  });

  it('keeps generated dependencies and package caches out of Git', async () => {
    const gitignorePath = resolve(process.cwd(), '.gitignore');
    const gitignore = await readFile(gitignorePath, 'utf8');

    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('.pnpm-store/');
    expect(gitignore).toContain('.next/');
    expect(gitignore).toContain('.env.*');
    expect(gitignore).toContain('*.log');
    expect(gitignore).toContain('packages/db/.generated/');
  });

  it('keeps generated frontend output out of linting', async () => {
    const eslintPath = resolve(process.cwd(), 'eslint.config.mjs');
    const eslintConfig = await readFile(eslintPath, 'utf8');

    expect(eslintConfig).toContain("'**/.next/**'");
    expect(eslintConfig).toContain("'**/out/**'");
  });

  it('keeps compiled test copies out of Vitest discovery', async () => {
    const vitestPath = resolve(process.cwd(), 'vitest.config.ts');
    const vitestConfig = await readFile(vitestPath, 'utf8');

    expect(vitestConfig).toContain('configDefaults.exclude');
    expect(vitestConfig).toContain("'**/dist/**'");
  });

  it('does not reformat the Next.js generated type references', async () => {
    const prettierIgnorePath = resolve(process.cwd(), '.prettierignore');
    const prettierIgnore = await readFile(prettierIgnorePath, 'utf8');

    expect(prettierIgnore).toContain('apps/web/next-env.d.ts');
  });

  it('maps shared packages without the deprecated baseUrl option', async () => {
    const configPath = resolve(process.cwd(), 'tsconfig.base.json');
    const config = JSON.parse(
      await readFile(configPath, 'utf8'),
    ) as BaseTypeScriptConfig;

    expect(config.compilerOptions.paths['@livepulse/contracts']).toEqual([
      './packages/contracts/src/index.ts',
    ]);
    expect(config.compilerOptions.paths['@livepulse/db']).toEqual([
      './packages/db/src/index.ts',
    ]);
    expect(config.compilerOptions.baseUrl).toBeUndefined();
    expect(config.compilerOptions.noEmitOnError).toBe(true);
  });

  it('type-checks the decorator semantics used by NestJS', async () => {
    const configPath = resolve(process.cwd(), 'tsconfig.json');
    const config = JSON.parse(
      await readFile(configPath, 'utf8'),
    ) as RootTypeScriptConfig;

    expect(config.compilerOptions.experimentalDecorators).toBe(true);
    expect(config.compilerOptions.emitDecoratorMetadata).toBe(true);
  });

  it('builds the API against the contracts declaration output', async () => {
    const configPath = resolve(process.cwd(), 'apps/api/tsconfig.build.json');
    const config = JSON.parse(
      await readFile(configPath, 'utf8'),
    ) as ApiBuildTypeScriptConfig;

    expect(config.compilerOptions.paths['@livepulse/contracts']).toEqual([
      '../../packages/contracts/dist/index.d.ts',
    ]);
    expect(config.compilerOptions.paths['@livepulse/db']).toEqual([
      '../../packages/db/dist/src/index.d.ts',
    ]);
  });
});
