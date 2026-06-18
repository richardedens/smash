// A real SQLite database in the browser, via sql.js (SQLite compiled to WASM).
//
// The WASM module loads lazily on first use. The whole database is persisted to
// localStorage (base64 of the SQLite file image) so it survives reloads.

import initSqlJs from 'sql.js';
import type { Database, QueryExecResult, SqlJsStatic } from 'sql.js';
// Vite resolves this to the served URL of the wasm asset.
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

const STORAGE_KEY = 'smash:db';

let sqlPromise: Promise<SqlJsStatic> | null = null;
let db: Database | null = null;

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function loadSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) sqlPromise = initSqlJs({ locateFile: () => wasmUrl });
  return sqlPromise;
}

/** Get the database, restoring it from localStorage on first use. */
export async function getDatabase(): Promise<Database> {
  if (db) return db;
  const SQL = await loadSql();
  const saved = storage()?.getItem(STORAGE_KEY);
  if (saved) {
    const bytes = Uint8Array.from(atob(saved), (c) => c.charCodeAt(0));
    db = new SQL.Database(bytes);
  } else {
    db = new SQL.Database();
  }
  return db;
}

/** Write the current database image to localStorage. */
export function persistDatabase(): void {
  if (!db) return;
  const data = db.export();
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  storage()?.setItem(STORAGE_KEY, btoa(binary));
}

/** Drop the in-memory database and remove the persisted copy. */
export function resetDatabase(): void {
  db?.close();
  db = null;
  storage()?.removeItem(STORAGE_KEY);
}

export type { QueryExecResult };
