// Python in the browser, via Pyodide (CPython compiled to WASM).
//
// Pyodide is large (~10 MB) and loads from a CDN on first use. Once loaded, a
// `db(sql)` helper is injected into Python that runs against the SMASH SQLite
// database (kernel/database), so Python code can use the same `db` the shell does.

import { getDatabase, persistDatabase } from './database';

// Self-hosted: served from SMASH's own origin (see scripts/setup-pyodide.mjs),
// not a third-party CDN.
const BASE_URL = '/pyodide/';

interface PyodideInterface {
  runPythonAsync(code: string): Promise<unknown>;
  setStdout(options: { batched: (s: string) => void }): void;
  setStderr(options: { batched: (s: string) => void }): void;
  loadPackage(names: string | string[]): Promise<void>;
  pyimport(name: string): { install(pkg: string): Promise<void> };
  globals: { set(name: string, value: unknown): void };
  FS: { writeFile(path: string, data: string): void; mkdirTree(path: string): void; chdir?(path: string): void };
}

export interface PyResult {
  ok: boolean;
  text: string;
}

let pyodidePromise: Promise<PyodideInterface> | null = null;
let pytestReady = false;

/** Whether Pyodide has already been loaded this session. */
export function isPythonLoaded(): boolean {
  return pyodidePromise !== null;
}

async function setupDbBridge(py: PyodideInterface): Promise<void> {
  const database = await getDatabase();
  py.globals.set('__smash_db_exec', (sql: string) => {
    try {
      const isWrite = !/^\s*(select|pragma|with|explain)/i.test(sql);
      const result = database.exec(sql);
      if (isWrite) persistDatabase();
      if (!result.length) return { columns: [] as string[], rows: [] as unknown[][] };
      return { columns: result[0].columns, rows: result[0].values };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'sql error' };
    }
  });
  // A Python `db(sql)` helper: SELECT → list of dict rows, writes → [].
  await py.runPythonAsync(`
from js import __smash_db_exec as _exec
def db(sql):
    res = _exec(sql).to_py()
    if isinstance(res, dict) and res.get('error'):
        raise RuntimeError(res['error'])
    cols = list(res.get('columns', []))
    rows = res.get('rows', []) or []
    return [dict(zip(cols, list(r))) for r in rows]
`);
}

function loadPyodide(): Promise<PyodideInterface> {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = (async () => {
    const mod = await import(/* @vite-ignore */ BASE_URL + 'pyodide.mjs');
    const py = (await mod.loadPyodide({ indexURL: BASE_URL })) as PyodideInterface;
    await setupDbBridge(py);
    return py;
  })();
  return pyodidePromise;
}

/** Run Python source, returning combined stdout/stderr. */
export async function runPython(code: string): Promise<PyResult> {
  const py = await loadPyodide();
  const chunks: string[] = [];
  py.setStdout({ batched: (s) => chunks.push(s) });
  py.setStderr({ batched: (s) => chunks.push(s) });
  try {
    await py.runPythonAsync(code);
    return { ok: true, text: chunks.join('') };
  } catch (err) {
    chunks.push(err instanceof Error ? err.message : String(err));
    return { ok: false, text: chunks.join('') };
  }
}

/** Install a pure-Python package with micropip. */
export async function installPackage(name: string): Promise<PyResult> {
  const py = await loadPyodide();
  try {
    await py.loadPackage('micropip');
    await py.pyimport('micropip').install(name);
    return { ok: true, text: `Successfully installed ${name}` };
  } catch (err) {
    return { ok: false, text: err instanceof Error ? err.message : `failed to install ${name}` };
  }
}

/** Run pytest over a set of files written into the Pyodide filesystem. */
export async function runPytest(files: { path: string; content: string }[], target: string): Promise<PyResult> {
  const py = await loadPyodide();
  if (!pytestReady) {
    const install = await installPackage('pytest');
    if (!install.ok) return install;
    pytestReady = true;
  }
  py.FS.mkdirTree('/smash');
  for (const file of files) {
    const full = '/smash/' + file.path.replace(/^\/+/, '');
    const dir = full.slice(0, full.lastIndexOf('/'));
    if (dir) py.FS.mkdirTree(dir);
    py.FS.writeFile(full, file.content);
  }
  const chunks: string[] = [];
  py.setStdout({ batched: (s) => chunks.push(s) });
  py.setStderr({ batched: (s) => chunks.push(s) });
  try {
    await py.runPythonAsync(`
import os, pytest
os.chdir('/smash')
pytest.main(['-q', ${JSON.stringify(target)}])
`);
    return { ok: true, text: chunks.join('') };
  } catch (err) {
    chunks.push(err instanceof Error ? err.message : String(err));
    return { ok: false, text: chunks.join('') };
  }
}
