// The user account database + authentication.
//
// Kept in memory (like the filesystem, it resets on reload). Passwords are
// stored only as PBKDF2 hashes; a null hash means "no password set".

import { hashPassword, verifyPassword } from './crypto';
import { markDirty } from './store';

export interface UserRecord {
  uid: number;
  home: string;
  shell: string;
  hash: string | null;
}

const users: Record<string, UserRecord> = {
  root: { uid: 0, home: '/root', shell: '/bin/smash', hash: null },
  smash: { uid: 1000, home: '/home/smash', shell: '/bin/smash', hash: null },
};

export function listUsers(): string[] {
  return Object.keys(users);
}

export function getUser(name: string): UserRecord | undefined {
  return users[name];
}

export function userExists(name: string): boolean {
  return name in users;
}

export function homeOf(name: string): string {
  return users[name]?.home ?? `/home/${name}`;
}

export function addUser(name: string): UserRecord | null {
  if (users[name]) return null;
  const uid = Math.max(1000, ...Object.values(users).map((u) => u.uid)) + 1;
  users[name] = { uid, home: name === 'root' ? '/root' : `/home/${name}`, shell: '/bin/smash', hash: null };
  markDirty();
  return users[name];
}

export function removeUser(name: string): boolean {
  if (!users[name] || name === 'smash' || name === 'root') return false;
  delete users[name];
  markDirty();
  return true;
}

export async function setPassword(name: string, password: string): Promise<boolean> {
  const record = users[name];
  if (!record) return false;
  record.hash = await hashPassword(password);
  markDirty();
  return true;
}

export function serializeUsers(): Record<string, UserRecord> {
  return users;
}

export function restoreUsers(saved: Record<string, UserRecord>): void {
  for (const key of Object.keys(users)) delete users[key];
  Object.assign(users, saved);
}

export async function authenticate(name: string, password: string): Promise<boolean> {
  const record = users[name];
  if (!record) return false;
  if (record.hash === null) return true; // no password set
  return verifyPassword(password, record.hash);
}

export function hasPassword(name: string): boolean {
  return users[name]?.hash != null;
}
