// AES-GCM encryption helpers built on the Web Crypto API.
//
// A passphrase is stretched with PBKDF2 (SHA-256) into a 256-bit AES-GCM key.
// Ciphertext is packaged as `smash1:<salt>:<iv>:<ciphertext>` (all base64) so
// it is self-describing and can be decrypted later with the same passphrase.

const PREFIX = 'smash1';
const ITERATIONS = 100_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt `plaintext` with `passphrase`, returning a self-describing token. */
export async function encryptText(plaintext: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    encoder.encode(plaintext),
  );
  return [PREFIX, toBase64(salt.buffer), toBase64(iv.buffer), toBase64(ciphertext)].join(':');
}

/** Decrypt a token produced by `encryptText`. Throws if the passphrase is wrong. */
export async function decryptText(token: string, passphrase: string): Promise<string> {
  const parts = token.split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error('not a valid smash ciphertext');
  }
  const salt = fromBase64(parts[1]);
  const iv = fromBase64(parts[2]);
  const data = fromBase64(parts[3]);
  const key = await deriveKey(passphrase, salt);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      data as BufferSource,
    );
    return decoder.decode(plaintext);
  } catch {
    throw new Error('wrong passphrase or corrupted data');
  }
}

// --- Password hashing (PBKDF2) --------------------------------------------

/** Hash a password as `salt:hash` (both hex). Pass a salt to reproduce a hash. */
export async function hashPassword(password: string, saltHex?: string): Promise<string> {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    256,
  );
  return `${toHex(salt)}:${toHex(new Uint8Array(bits))}`;
}

/** Constant-ish check of a password against a stored `salt:hash`. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const saltHex = stored.split(':')[0];
  if (!saltHex) return false;
  return (await hashPassword(password, saltHex)) === stored;
}

// --- Device key (for at-rest encryption of the session) -------------------

const DEVICE_KEY_STORAGE = 'smash:devicekey';
let deviceKeyPromise: Promise<CryptoKey> | null = null;

function lsGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** A persistent per-device AES-GCM key (generated once, stored in localStorage). */
export function getDeviceKey(): Promise<CryptoKey> {
  if (deviceKeyPromise) return deviceKeyPromise;
  deviceKeyPromise = (async () => {
    const stored = lsGet(DEVICE_KEY_STORAGE);
    const raw = stored ? fromBase64(stored) : crypto.getRandomValues(new Uint8Array(32));
    if (!stored) lsSet(DEVICE_KEY_STORAGE, toBase64(raw.buffer as ArrayBuffer));
    return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
  })();
  return deviceKeyPromise;
}

/** Encrypt with an AES-GCM key (no passphrase/PBKDF2 — cheap, for frequent saves). */
export async function encryptWithKey(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, encoder.encode(plaintext));
  return `smashk1:${toBase64(iv.buffer as ArrayBuffer)}:${toBase64(ciphertext)}`;
}

export async function decryptWithKey(key: CryptoKey, token: string): Promise<string> {
  const parts = token.split(':');
  if (parts.length !== 3 || parts[0] !== 'smashk1') throw new Error('not a valid session blob');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(parts[1]) as BufferSource },
    key,
    fromBase64(parts[2]) as BufferSource,
  );
  return decoder.decode(plaintext);
}
