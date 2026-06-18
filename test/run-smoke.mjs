// Headless smoke test runner.
//
// Builds test/smoke.tsx with Vite (SSR target, CSS stripped) so the real app
// code runs under Node + happy-dom, then executes it. Catches render crashes
// (e.g. blank screens) and verifies the app platform end to end.
//
//   npm run smoke

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  root,
  configFile: false,
  logLevel: 'error',
  plugins: [react()],
  build: {
    ssr: 'test/smoke.tsx',
    outDir: '.smoke-out',
    emptyOutDir: true,
    minify: false,
    rollupOptions: { output: { format: 'cjs', entryFileNames: 'smoke.cjs' } },
  },
});

await import(resolve(root, '.smoke-out/smoke.cjs'));
