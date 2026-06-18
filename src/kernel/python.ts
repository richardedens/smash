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

// --- Load status (so the UI can show a progress bar) ----------------------

export interface PythonStatus {
  phase: 'idle' | 'loading' | 'ready' | 'error';
  message: string;
}

let status: PythonStatus = { phase: 'idle', message: '' };
const statusListeners = new Set<(s: PythonStatus) => void>();

export function getPythonStatus(): PythonStatus {
  return status;
}

export function onPythonStatus(fn: (s: PythonStatus) => void): () => void {
  statusListeners.add(fn);
  fn(status);
  return () => {
    statusListeners.delete(fn);
  };
}

function setStatus(phase: PythonStatus['phase'], message: string): void {
  status = { phase, message };
  for (const fn of statusListeners) fn(status);
}

async function setupDbBridge(py: PyodideInterface): Promise<void> {
  const database = await getDatabase();
  // Exposed as a Python global; returns a JSON string so the boundary is simple.
  py.globals.set('__smash_db_exec', (sql: string): string => {
    try {
      const isWrite = !/^\s*(select|pragma|with|explain)/i.test(sql);
      const result = database.exec(sql);
      if (isWrite) persistDatabase();
      if (!result.length) return JSON.stringify({ columns: [], rows: [] });
      return JSON.stringify({ columns: result[0].columns, rows: result[0].values });
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : 'sql error' });
    }
  });
  // A Python `db(sql)` helper: SELECT → list of dict rows, writes → [].
  await py.runPythonAsync(`
import json as _json
def db(sql):
    res = _json.loads(__smash_db_exec(sql))
    if 'error' in res:
        raise RuntimeError(res['error'])
    cols = res.get('columns', [])
    rows = res.get('rows', [])
    return [dict(zip(cols, r)) for r in rows]
`);
}

// Load the UMD build via a <script> tag (it sets globalThis.loadPyodide).
// We avoid `import()` because /pyodide lives in /public and can't be imported.
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[data-pyodide]')) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.dataset.pyodide = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(script);
  });
}

type LoadPyodide = (opts: { indexURL: string }) => Promise<PyodideInterface>;

function loadPyodide(): Promise<PyodideInterface> {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = (async () => {
    setStatus('loading', 'Downloading Python runtime (~13 MB)…');
    await loadScript(BASE_URL + 'pyodide.js');
    setStatus('loading', 'Starting the Python interpreter…');
    const loader = (globalThis as unknown as { loadPyodide?: LoadPyodide }).loadPyodide;
    if (!loader) throw new Error('pyodide failed to load');
    const py = await loader({ indexURL: BASE_URL });
    setStatus('loading', 'Connecting the db() bridge…');
    await setupDbBridge(py);
    setStatus('ready', 'Python ready');
    return py;
  })().catch((err: unknown) => {
    pyodidePromise = null; // allow a retry
    setStatus('error', err instanceof Error ? err.message : 'failed to load Python');
    throw err;
  });
  return pyodidePromise;
}

/** Run Python source, returning combined stdout/stderr. */
export async function runPython(code: string): Promise<PyResult> {
  let py: PyodideInterface;
  try {
    py = await loadPyodide();
  } catch (err) {
    return { ok: false, text: err instanceof Error ? err.message : 'failed to load Python' };
  }
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
  let py: PyodideInterface;
  try {
    py = await loadPyodide();
  } catch (err) {
    return { ok: false, text: err instanceof Error ? err.message : 'failed to load Python' };
  }
  setStatus('loading', `Installing ${name}…`);
  try {
    await py.loadPackage('micropip');
    await py.pyimport('micropip').install(name);
    setStatus('ready', `Installed ${name}`);
    return { ok: true, text: `Successfully installed ${name}` };
  } catch (err) {
    setStatus('ready', '');
    return { ok: false, text: err instanceof Error ? err.message : `failed to install ${name}` };
  }
}

/** Run pytest over a set of files written into the Pyodide filesystem. */
export async function runPytest(files: { path: string; content: string }[], target: string): Promise<PyResult> {
  let py: PyodideInterface;
  try {
    py = await loadPyodide();
  } catch (err) {
    return { ok: false, text: err instanceof Error ? err.message : 'failed to load Python' };
  }
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
