// The application registry.
//
// Apps call `registerApp` at module load time (see each app module and the
// `apps/runtime` barrel that imports them). The shell looks apps up by name.

import type { App } from './types';

const registry = new Map<string, App>();

/** Install an app. Throws on a duplicate name to catch accidental clashes. */
export function registerApp(app: App): void {
  if (registry.has(app.name)) {
    throw new Error(`SMASH: an app named "${app.name}" is already registered`);
  }
  registry.set(app.name, app);
}

export function getApp(name: string): App | undefined {
  return registry.get(name);
}

export function hasApp(name: string): boolean {
  return registry.has(name);
}

/** All app command names (including hidden ones). */
export function appNames(): string[] {
  return [...registry.keys()];
}

/** Visible apps, sorted by name — used by `help` and completion. */
export function listApps(): App[] {
  return [...registry.values()]
    .filter((a) => !a.hidden)
    .sort((a, b) => a.name.localeCompare(b.name));
}
