// The app runtime: the single module the shell (Terminal) talks to.
//
// Importing this file is what *loads every app* — each import below runs the
// app module, which calls `registerApp` at load time. Add a new app's import
// here and it becomes available everywhere (help, completion, highlighting).

import './coreutils';
import './nano/nano.app';
import './hello/hello.app';
import './crypto/crypto.app';
import './vault/vault.app';
import './ai/ai.app';
import './db/db.app';
import './users/users.app';
import './python/python.app';
import './pysmash/pysmash.app';

import { appNames, getApp, hasApp, listApps, registerApp } from './registry';
import type { App, AppResult, ShellApi } from './types';
import { none } from './types';
import { basename, fs } from '../kernel/filesystem';
import { expandAliases } from '../kernel/aliases';
import type { CompleteResult, Kind, Line, Segment } from '../types';

export { appNames, listApps };

/** A result that may still be in flight (e.g. curl, AI calls). */
type MaybeAsync<T> = T | Promise<T>;

function isPromise<T>(value: MaybeAsync<T>): value is Promise<T> {
  return typeof (value as Promise<T> | undefined)?.then === 'function';
}

function errorLine(message: string): AppResult {
  return { kind: 'output', lines: [{ text: message, error: true }], ok: false };
}

function safeRun(app: App, args: string[], raw: string, shell: ShellApi): MaybeAsync<AppResult> {
  try {
    const result = app.run({ args, raw, shell });
    if (isPromise(result)) {
      return result.catch((err: unknown) =>
        errorLine(`${app.name}: ${err instanceof Error ? err.message : 'unexpected error'}`),
      );
    }
    return result;
  } catch (err) {
    return errorLine(`${app.name}: ${err instanceof Error ? err.message : 'unexpected error'}`);
  }
}

/** Find an executable for a bare command name by searching `$PATH`. */
function resolveOnPath(name: string, shell: ShellApi): string | null {
  for (const dir of (shell.env.PATH ?? '').split(':').filter(Boolean)) {
    const path = shell.resolve(`${dir}/${name}`);
    if (fs.isExec(path)) return path;
  }
  return null;
}

/** Flatten a rendered line back to plain text (for the JS `run()` helper). */
function lineText(line: Line): string {
  if (line.segments) return line.segments.map((s) => s.text).join('');
  return line.text ?? '';
}

/** Execute the file at `path` (a .js program or a .sh script). */
function execFile(path: string, args: string[], raw: string, shell: ShellApi): MaybeAsync<AppResult> {
  const base = basename(path);
  const content = fs.read(path) ?? '';

  // An empty stub that matches a registered app (e.g. /bin/nano) runs the app.
  const app = getApp(base);
  if (content.trim() === '' && app) return safeRun(app, args, raw, shell);

  if (base.endsWith('.js') || /^#!.*\b(node|js|smash)\b/.test(content)) {
    return runJs(content, args, shell);
  }
  return runScript(content, shell);
}

/** Parse a command line and run the matching app, PATH binary, or path. */
export function runCommand(input: string, shell: ShellApi): MaybeAsync<AppResult> {
  const trimmed = expandAliases(input.trim());
  if (!trimmed) return none();

  const parts = trimmed.split(/\s+/);
  const name = parts[0];
  const args = parts.slice(1);
  const raw = trimmed.slice(name.length).trim();

  // Explicit path: ./build.sh, /bin/ls, scripts/tool.js
  if (name.includes('/')) {
    const path = shell.resolve(name);
    if (!fs.exists(path)) return errorLine(`smash: no such file or directory: ${name}`);
    if (fs.isDir(path)) return errorLine(`smash: permission denied: ${name}`);
    if (!fs.isExec(path)) return errorLine(`smash: permission denied: ${name}`);
    return execFile(path, args, raw, shell);
  }

  // Bare name: a built-in app wins, otherwise search the PATH for a binary.
  const app = getApp(name);
  if (app) return safeRun(app, args, raw, shell);

  const onPath = resolveOnPath(name, shell);
  if (onPath) return execFile(onPath, args, raw, shell);

  return errorLine(`smash: command not found: ${name}`);
}

/** Run a shell script: each non-comment line is a command. cwd is local. */
async function runScript(content: string, shell: ShellApi): Promise<AppResult> {
  let cwd = shell.cwd;
  const local: ShellApi = {
    ...shell,
    get cwd() {
      return cwd;
    },
    resolve: (p: string) => fs.resolve(cwd, p),
    cd: (p: string) => {
      const abs = fs.resolve(cwd, p);
      if (!fs.isDir(abs)) return false;
      cwd = abs;
      return true;
    },
  };

  const lines: Line[] = [];
  let ok = true;
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const res = await runCommand(line, local);
    if (res.kind === 'output') {
      lines.push(...res.lines);
      ok = res.ok;
    } else if (res.kind === 'clear') {
      lines.length = 0;
    } else if (res.kind === 'gui') {
      lines.push({ text: `${line}: cannot launch a GUI app from a script`, error: true });
      ok = false;
    } else {
      ok = res.ok;
    }
  }
  if (cwd !== shell.cwd) shell.cd(cwd);
  return { kind: 'output', lines, ok };
}

/** Run a user JavaScript program with a small `smash` API ("code in the browser"). */
function runJs(content: string, args: string[], shell: ShellApi): AppResult {
  const out: Line[] = [];
  const api = {
    args,
    env: shell.env,
    cwd: shell.cwd,
    print: (...values: unknown[]) => out.push({ text: values.map((v) => String(v)).join(' ') }),
    error: (...values: unknown[]) => out.push({ text: values.map((v) => String(v)).join(' '), error: true }),
    readFile: (p: string) => shell.fs.read(shell.resolve(p)),
    writeFile: (p: string, c: string) => shell.fs.write(shell.resolve(p), c),
    list: (p = '.') => (shell.fs.list(shell.resolve(p)) ?? []).map((e) => e.name),
    run: (command: string) => {
      const res = runCommand(command, shell);
      if (isPromise(res)) return ''; // async commands aren't available inside JS programs
      return res.kind === 'output' ? res.lines.map(lineText).join('\n') : '';
    },
  };
  try {
    // eslint-disable-next-line no-new-func
    const program = new Function('smash', `"use strict";\n${content}`);
    program(api);
    return { kind: 'output', lines: out, ok: true };
  } catch (err) {
    out.push({ text: err instanceof Error ? `${err.name}: ${err.message}` : 'Error', error: true });
    return { kind: 'output', lines: out, ok: false };
  }
}

// --- the `source` builtin -------------------------------------------------

// `source <file>` runs each line of a file in the *current* shell, so its
// `export`/`alias`/`cd` lines affect the live session. This is how ~/.smashrc
// is loaded at startup.
registerApp({
  name: 'source',
  summary: 'Run a file in the current shell (e.g. reload ~/.smashrc)',
  usage: 'source <file>',
  async run({ args, shell }) {
    const file = args[0];
    if (!file) return errorLine('source: filename argument required');
    const content = shell.fs.read(shell.resolve(file));
    if (content === null) return errorLine(`source: ${file}: No such file or directory`);

    const lines: Line[] = [];
    let ok = true;
    for (const raw of content.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const res = await runCommand(line, shell);
      if (res.kind === 'output') {
        lines.push(...res.lines);
        ok = res.ok;
      } else if (res.kind === 'clear') {
        lines.length = 0;
      } else {
        ok = res.ok;
      }
    }
    return { kind: 'output', lines, ok };
  },
});

// Install every registered app as a protected, executable binary in /bin so it
// shows up in `ls /bin` and cannot be deleted. Runs once, after all apps above
// (including coreutils and `source`) have registered.
for (const name of appNames()) {
  const path = `/bin/${name}`;
  fs.write(path, '');
  fs.chmod(path, true);
  fs.protect(path);
}

// --- tab completion -------------------------------------------------------

function longestCommonPrefix(values: string[]): string {
  if (!values.length) return '';
  let prefix = values[0];
  for (const v of values.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < v.length && prefix[i] === v[i]) i++;
    prefix = prefix.slice(0, i);
  }
  return prefix;
}

export function complete(input: string, shell: ShellApi): CompleteResult {
  const trailingSpace = /\s$/.test(input);
  const parts = input.split(/\s+/).filter(Boolean);
  const completingCommand = parts.length <= 1 && !trailingSpace;

  // Command-name completion.
  if (completingCommand) {
    const prefix = parts[0] ?? '';
    const matches = appNames().filter((n) => n.startsWith(prefix)).sort();
    if (!matches.length) return { value: input, candidates: [] };
    const lcp = longestCommonPrefix(matches);
    return {
      value: matches.length === 1 ? lcp + ' ' : lcp,
      candidates: matches.length > 1 ? matches.map((m) => ({ text: m, kind: 'exec' as const })) : [],
    };
  }

  // Path completion on the final token.
  const token = trailingSpace ? '' : parts[parts.length - 1];
  const slash = token.lastIndexOf('/');
  const dirPart = slash >= 0 ? token.slice(0, slash + 1) : '';
  const namePrefix = slash >= 0 ? token.slice(slash + 1) : token;
  const entries = shell.fs.list(shell.resolve(dirPart || '.'));
  if (!entries) return { value: input, candidates: [] };

  let names = entries.filter((e) => e.name.startsWith(namePrefix));
  if (!namePrefix.startsWith('.')) names = names.filter((e) => !e.name.startsWith('.'));
  if (!names.length) return { value: input, candidates: [] };

  const lcp = longestCommonPrefix(names.map((n) => n.name));
  let completion = dirPart + lcp;
  if (names.length === 1) completion += names[0].isDir ? '/' : ' ';

  const tokenStart = trailingSpace ? input.length : input.length - token.length;
  return {
    value: input.slice(0, tokenStart) + completion,
    candidates:
      names.length > 1
        ? names.map((n): Segment => ({ text: n.name + (n.isDir ? '/' : ''), kind: n.isDir ? 'dir' : 'file' }))
        : [],
  };
}

// --- SMASH input syntax highlighting --------------------------------------

/** A per-character color role for the current input line. */
export function highlight(value: string): Kind[] {
  const classes: Kind[] = new Array(value.length).fill('default');
  const tokenRe = /\S+/g;
  let match: RegExpExecArray | null;
  let tokenIndex = 0;
  while ((match = tokenRe.exec(value)) !== null) {
    const token = match[0];
    const start = match.index;
    let kind: Kind;
    if (tokenIndex === 0) {
      kind = hasApp(token) ? 'exec' : 'cmd-bad';
    } else if (token.startsWith('-')) {
      kind = 'flag';
    } else if (/^["'].*["']$/.test(token)) {
      kind = 'string';
    } else if (token.includes('/') || token.startsWith('~') || token.startsWith('.')) {
      kind = 'path';
    } else {
      kind = 'default';
    }
    for (let i = 0; i < token.length; i++) classes[start + i] = kind;
    tokenIndex += 1;
  }
  return classes;
}
