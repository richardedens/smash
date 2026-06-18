// The SMASH application platform.
//
// Everything you type at the prompt resolves to an `App`. A CLI app returns
// output lines; a GUI app returns a React node that takes over the screen
// (see `apps/nano` for an example). Apps register themselves at load time via
// `registerApp` (see `apps/registry`).

import type { ReactNode } from 'react';
import type { FsApi } from '../kernel/filesystem';
import type { Line, Theme } from '../types';

/**
 * Services the shell exposes to a running app: the filesystem, environment,
 * theme, history, and a few mutators. This is the app's entire window onto the
 * system — keep new capabilities here so every app shares one surface.
 */
export interface ShellApi {
  /** Current working directory (absolute, real path). */
  cwd: string;
  /** The logged-in user. */
  user: string;
  /** The hostname. */
  host: string;
  /** The chroot jail root, or '/' when not jailed. */
  chrootRoot: string;
  /** Environment variables. */
  env: Record<string, string>;
  /** Command history, newest first. */
  history: string[];
  /** Active theme palette and its key. */
  theme: Theme;
  themeName: string;
  /** Filesystem service (absolute paths). */
  fs: FsApi;
  /** Resolve a path relative to the current working directory. */
  resolve(path: string): string;
  /** Change directory. Returns false if the target is not a directory. */
  cd(path: string): boolean;
  /** Switch theme by key. Returns false for an unknown theme. */
  setTheme(name: string): boolean;
  /** Set an environment variable. Setting a `SMASH_*` color recolors the UI. */
  setEnv(name: string, value: string): void;
  /** Remove a user-set environment variable. */
  unsetEnv(name: string): void;
  /** Switch the active user (after authentication), cd to their home, leave any jail. */
  login(name: string): void;
  /** Enter a chroot jail at `dir` (an absolute real path). */
  chroot(dir: string): void;
}

/** Handle passed to a GUI app so it can close itself and return to the shell. */
export interface GuiHost {
  close(): void;
}

/** What an app hands back to the shell after `run`. */
export type AppResult =
  | { kind: 'output'; lines: Line[]; ok: boolean }
  | { kind: 'gui'; render: (host: GuiHost) => ReactNode; ok: boolean }
  | { kind: 'clear'; ok: boolean }
  | { kind: 'none'; ok: boolean };

/** Everything an app's `run` receives. */
export interface AppContext {
  /** Tokenised arguments (excluding the command name). */
  args: string[];
  /** Raw argument string (everything after the command name, untrimmed split). */
  raw: string;
  /** Shell services. */
  shell: ShellApi;
}

/** An installed application. Register one with `registerApp`. */
export interface App {
  /** The command name typed at the prompt. */
  name: string;
  /** One-line description shown in `help`. */
  summary: string;
  /** Usage string shown in `help <name>` / `man`. */
  usage?: string;
  /** Hide from `help` and completion (still runnable). */
  hidden?: boolean;
  /** Run the app. May be async (e.g. for network or crypto). */
  run(ctx: AppContext): AppResult | Promise<AppResult>;
}

// --- Result helpers (use these instead of building objects by hand) -------

export function output(lines: Line[], ok = true): AppResult {
  return { kind: 'output', lines, ok };
}

export function text(value: string, ok = true): AppResult {
  return { kind: 'output', lines: [{ text: value }], ok };
}

export function fail(message: string): AppResult {
  return { kind: 'output', lines: [{ text: message, error: true }], ok: false };
}

export function gui(render: (host: GuiHost) => ReactNode): AppResult {
  return { kind: 'gui', render, ok: true };
}

export function clearScreen(): AppResult {
  return { kind: 'clear', ok: true };
}

export function none(ok = true): AppResult {
  return { kind: 'none', ok };
}
