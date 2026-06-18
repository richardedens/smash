// Encrypted session persistence.
//
// "Everything you do" — files, users, aliases, theme, env, cwd — is saved to
// localStorage, AES-GCM encrypted at rest with a per-device key (see crypto.ts),
// and restored on boot. Saves are debounced and triggered by markDirty() from
// the kernel state modules (see store.ts). The SQLite db and the vault persist
// separately under their own keys.

import { decryptWithKey, encryptWithKey, getDeviceKey } from './crypto';
import { replaceFs, serializeFs } from './filesystem';
import { restoreUsers, serializeUsers } from './users';
import type { UserRecord } from './users';
import { aliasEntries, restoreAliases } from './aliases';
import { setDirtyListener } from './store';
import type { DirNode } from '../types';

const STORAGE_KEY = 'smash:session';

export interface SessionUi {
  theme: string;
  env: Record<string, string>;
  cwd: string;
  user: string;
}

interface SessionData {
  v: number;
  fs?: DirNode;
  users?: Record<string, UserRecord>;
  aliases?: [string, string][];
  ui?: SessionUi;
}

let uiProvider: (() => SessionUi) | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function hasSavedSession(): boolean {
  return Boolean(storage()?.getItem(STORAGE_KEY));
}

export function clearSession(): void {
  storage()?.removeItem(STORAGE_KEY);
}

/** What the Terminal exposes so its React-state (theme/env/cwd/user) is saved. */
export function setUiStateProvider(fn: () => SessionUi): void {
  uiProvider = fn;
}

/** Restore the saved session into the kernel; returns the UI state to apply. */
export async function restoreSession(): Promise<SessionUi | null> {
  const blob = storage()?.getItem(STORAGE_KEY);
  if (!blob) return null;
  try {
    const key = await getDeviceKey();
    const data = JSON.parse(await decryptWithKey(key, blob)) as SessionData;
    if (data.fs) replaceFs(data.fs);
    if (data.users) restoreUsers(data.users);
    if (data.aliases) restoreAliases(data.aliases);
    return data.ui ?? null;
  } catch {
    return null; // corrupt or wrong key — start fresh
  }
}

/** Turn on autosave. Called once, after restore, so earlier changes don't save. */
export function initPersistence(): void {
  setDirtyListener(scheduleSave);
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveNow(), 600);
}

export async function saveNow(): Promise<void> {
  try {
    const data: SessionData = {
      v: 1,
      fs: serializeFs(),
      users: serializeUsers(),
      aliases: aliasEntries(),
      ui: uiProvider?.(),
    };
    const key = await getDeviceKey();
    storage()?.setItem(STORAGE_KEY, await encryptWithKey(key, JSON.stringify(data)));
  } catch {
    /* ignore — persistence is best-effort */
  }
}
