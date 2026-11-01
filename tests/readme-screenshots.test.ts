import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const screenshots = ['discover', 'watch', 'studio'];

describe('README screenshots', () => {
  it('links each supplied interface screenshot to a valid PNG in the repository', async () => {
    const root = process.cwd();
    const readme = await readFile(resolve(root, 'README.md'), 'utf8');

    for (const name of screenshots) {
      const relativePath = `docs/screenshots/${name}.png`;
      expect(readme).toContain(`](${relativePath})`);

      const image = await readFile(resolve(root, relativePath));
      expect(image.subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      expect(image.readUInt32BE(16)).toBeGreaterThan(1000);
      expect(image.readUInt32BE(20)).toBeGreaterThan(600);
    }
  });
});
