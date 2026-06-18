// Self-host Pyodide: copy the core runtime out of node_modules into
// public/pyodide, and download the wheels for `micropip` + `pytest` (and their
// dependencies, resolved from the lock file) so Python — including pip/pytest —
// runs entirely from SMASH's own origin, with no third-party CDN at runtime.
//
//   npm run setup:python

import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/pyodide');
const dest = resolve(root, 'public/pyodide');

const lock = JSON.parse(await readFile(resolve(src, 'pyodide-lock.json'), 'utf8'));
const version = lock.info?.version ?? '0.27.2';
const cdn = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;

await mkdir(dest, { recursive: true });

// 1. Core runtime files (already in node_modules).
const core = ['pyodide.mjs', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
for (const file of core) {
  await cp(resolve(src, file), resolve(dest, file));
}
console.log(`copied ${core.length} core files`);

// 2. Resolve the dependency closure of micropip + pytest from the lock.
const packages = lock.packages ?? {};
const wanted = new Set();
const queue = ['micropip', 'pytest'];
while (queue.length) {
  const name = queue.shift().toLowerCase();
  const pkg = packages[name];
  if (!pkg || wanted.has(name)) continue;
  wanted.add(name);
  for (const dep of pkg.depends ?? []) queue.push(dep);
}

// 3. Download each wheel (skip ones already present).
let downloaded = 0;
for (const name of wanted) {
  const file = packages[name].file_name;
  const out = resolve(dest, file);
  if (existsSync(out)) continue;
  const res = await fetch(cdn + file);
  if (!res.ok) {
    console.warn(`skip ${file}: ${res.status}`);
    continue;
  }
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
  downloaded += 1;
}
console.log(`downloaded ${downloaded} wheels for: ${[...wanted].sort().join(', ')}`);
console.log(`pyodide self-hosted in public/pyodide (v${version})`);
