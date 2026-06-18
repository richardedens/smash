// Command aliases (e.g. `alias ll="ls -la"`), defined in ~/.smashrc or at the
// prompt. Kept in a tiny module-level store so both the `alias` app and the
// command runner can reach it without an import cycle.

import { markDirty } from './store';

const aliases = new Map<string, string>();

export function defineAlias(name: string, value: string): void {
  aliases.set(name, value);
  markDirty();
}

export function restoreAliases(entries: [string, string][]): void {
  aliases.clear();
  for (const [name, value] of entries) aliases.set(name, value);
}

export function lookupAlias(name: string): string | undefined {
  return aliases.get(name);
}

export function aliasEntries(): [string, string][] {
  return [...aliases.entries()];
}

/** Expand a leading alias (recursively, with a loop guard). */
export function expandAliases(input: string): string {
  let line = input.trim();
  const seen = new Set<string>();
  let first = line.split(/\s+/)[0];
  while (first && aliases.has(first) && !seen.has(first)) {
    seen.add(first);
    line = (aliases.get(first) as string) + line.slice(first.length);
    line = line.trim();
    first = line.split(/\s+/)[0];
  }
  return line;
}
