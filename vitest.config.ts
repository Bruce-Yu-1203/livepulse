import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@livepulse/contracts': fileURLToPath(
        new URL('./packages/contracts/src/index.ts', import.meta.url),
      ),
      '@livepulse/db': fileURLToPath(
        new URL('./packages/db/src/index.ts', import.meta.url),
      ),
    },
  },
});
