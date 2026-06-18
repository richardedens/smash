// An encrypted secret store, persisted to localStorage.
//
// The whole vault is a single AES-GCM blob keyed by a master passphrase. After
// `unlock`, the decrypted secrets live in memory for the session; `lock` wipes
// them. This is where API keys (e.g. for the `ai` command) are kept.

import { decryptText, encryptText } from './crypto';

const STORAGE_KEY = 'smash:vault';

let secrets: Record<string, string> | null = null;
let masterPassphrase: string | null = null;

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function isInitialized(): boolean {
  return Boolean(storage()?.getItem(STORAGE_KEY));
}

export function isUnlocked(): boolean {
  return secrets !== null;
}

async function persist(): Promise<void> {
  if (secrets === null || masterPassphrase === null) return;
  const blob = await encryptText(JSON.stringify(secrets), masterPassphrase);
  storage()?.setItem(STORAGE_KEY, blob);
}

/** Unlock the vault (creating it on first use). Throws on a wrong passphrase. */
export async function unlock(passphrase: string): Promise<void> {
  const blob = storage()?.getItem(STORAGE_KEY);
  if (!blob) {
    secrets = {};
    masterPassphrase = passphrase;
    await persist();
    return;
  }
  const json = await decryptText(blob, passphrase);
  secrets = JSON.parse(json) as Record<string, string>;
  masterPassphrase = passphrase;
}

export function lock(): void {
  secrets = null;
  masterPassphrase = null;
}

function requireUnlocked(): Record<string, string> {
  if (secrets === null) throw new Error('vault is locked — run: vault unlock <passphrase>');
  return secrets;
}

export async function setSecret(name: string, value: string): Promise<void> {
  requireUnlocked()[name] = value;
  await persist();
}

/** Read a secret. Returns undefined if locked or missing (used by the ai command). */
export function getSecret(name: string): string | undefined {
  return secrets?.[name];
}

export function listSecrets(): string[] {
  return Object.keys(requireUnlocked());
}

export async function removeSecret(name: string): Promise<boolean> {
  const store = requireUnlocked();
  if (!(name in store)) return false;
  delete store[name];
  await persist();
  return true;
}
