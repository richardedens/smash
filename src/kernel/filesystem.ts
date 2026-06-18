// The virtual filesystem service.
//
// The kernel owns a single in-memory tree and exposes a small, absolute-path
// based API (`fs`). Apps never touch the tree directly — they go through the
// `FsApi`, which keeps path handling and mutation in one place.

import type { DirNode, FsNode } from '../types';
import { markDirty } from './store';

export const USER = 'smash';
export const HOST = 'smash-web';
export const HOME = `/home/${USER}`;
export const SHELL = '/bin/smash';

export interface DirEntry {
  name: string;
  isDir: boolean;
  size: number;
  exec: boolean;
}

export interface FsApi {
  /** Resolve a (possibly relative or `~`) path against `cwd` to an absolute path. */
  resolve(cwd: string, path: string): string;
  exists(path: string): boolean;
  isDir(path: string): boolean;
  isFile(path: string): boolean;
  read(path: string): string | null;
  /** Create or overwrite a file. Parent directory must exist. Keeps the exec bit. */
  write(path: string, content: string): boolean;
  /** Whether the file at `path` has its executable bit set. */
  isExec(path: string): boolean;
  /** Set or clear the executable bit on a file. */
  chmod(path: string, exec: boolean): boolean;
  /** Directory entries (unsorted), or null if `path` is not a directory. */
  list(path: string): DirEntry[] | null;
  mkdir(path: string): boolean;
  rmdir(path: string): boolean;
  remove(path: string, recursive: boolean): boolean;
  copy(src: string, dest: string): boolean;
  move(src: string, dest: string): boolean;
  size(path: string): number;
  /** Mark a path as a protected system file (cannot be written/removed/chmod'd). */
  protect(path: string): void;
  isProtected(path: string): boolean;
}

// --- The tree -------------------------------------------------------------

const root: DirNode = {
  type: 'dir',
  children: {
    home: {
      type: 'dir',
      children: {
        smash: {
          type: 'dir',
          children: {
            '.smashrc': {
              type: 'file',
              content: [
                '# SMASH ~ .smashrc — sourced on startup',
                'export SMASH_HOME="$HOME/.smash"',
                'export PATH="$PATH:$HOME/bin"',
                'export EDITOR=nano',
                '',
                '# Handy aliases',
                'alias ll="ls -la"',
                'alias la="ls -a"',
                'alias gs="git status"',
                '',
                '# Tweak your theme colors (uncomment to try):',
                '# export SMASH_GREEN=#00ffaa',
                '# export SMASH_CURSOR=#ff0066',
              ].join('\n'),
            },
            'README.md': {
              type: 'file',
              content: [
                '# SMASH',
                '',
                'A Linux terminal that lives in your browser.',
                '',
                'Try these commands:',
                '  - `ls -la`          list everything',
                '  - `cat .smashrc`    read the shell config',
                '  - `nano notes.txt`  edit a file (fully working!)',
                '  - `hello there`     a sample CLI app',
                '  - `theme dracula`   switch color scheme',
                '  - `neofetch`        show off',
                '',
                'Everything runs locally in your browser. Have fun!',
              ].join('\n'),
            },
            'welcome.txt': {
              type: 'file',
              content: 'Welcome to SMASH. Type `help` to see what you can do.\n',
            },
            projects: {
              type: 'dir',
              children: {
                smash: {
                  type: 'dir',
                  children: {
                    'index.ts': { type: 'file', content: "console.log('hello from smash');\n" },
                  },
                },
              },
            },
            Documents: { type: 'dir', children: {} },
            Downloads: { type: 'dir', children: {} },
            bin: { type: 'dir', children: {} },
          },
        },
      },
    },
    etc: {
      type: 'dir',
      children: {
        hostname: { type: 'file', content: `${HOST}\n` },
        'os-release': {
          type: 'file',
          content: [
            'NAME="SMASH Linux"',
            'VERSION="1.0 (Browser Edition)"',
            'ID=smash',
            'PRETTY_NAME="SMASH Linux 1.0"',
          ].join('\n'),
        },
        shells: { type: 'file', content: '/bin/sh\n/bin/bash\n/bin/smash\n' },
      },
    },
    usr: {
      type: 'dir',
      children: {
        bin: { type: 'dir', children: {} },
        local: { type: 'dir', children: { bin: { type: 'dir', children: {} } } },
        share: { type: 'dir', children: {} },
        lib: { type: 'dir', children: {} },
      },
    },
    bin: { type: 'dir', children: {} },
    sbin: { type: 'dir', children: {} },
    lib: { type: 'dir', children: {} },
    opt: { type: 'dir', children: {} },
    srv: { type: 'dir', children: {} },
    run: { type: 'dir', children: {} },
    root: { type: 'dir', children: {} },
    dev: {
      type: 'dir',
      children: {
        null: { type: 'file', content: '' },
        zero: { type: 'file', content: '' },
        random: { type: 'file', content: '' },
      },
    },
    proc: {
      type: 'dir',
      children: {
        version: { type: 'file', content: 'Linux version 6.2.0-smash-wasm (SMASH/Linux)\n' },
        cpuinfo: { type: 'file', content: 'model name : JavaScript Virtual CPU (V8)\n' },
      },
    },
    var: {
      type: 'dir',
      children: {
        log: { type: 'dir', children: { 'smash.log': { type: 'file', content: 'boot ok\n' } } },
        tmp: { type: 'dir', children: {} },
      },
    },
    tmp: { type: 'dir', children: {} },
  },
};

// --- Path helpers ---------------------------------------------------------

export function basename(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '/';
}

export function dirname(path: string): string {
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return '/' + parts.join('/');
}

export function abbreviateHome(path: string): string {
  if (path === HOME) return '~';
  if (path.startsWith(HOME + '/')) return '~' + path.slice(HOME.length);
  return path || '/';
}

function resolve(cwd: string, input: string): string {
  let p = input || '.';
  if (p === '~') p = HOME;
  else if (p.startsWith('~/')) p = HOME + p.slice(1);

  const base = p.startsWith('/') ? [] : cwd.split('/').filter(Boolean);
  const stack = [...base];
  for (const seg of p.split('/').filter(Boolean)) {
    if (seg === '.') continue;
    if (seg === '..') stack.pop();
    else stack.push(seg);
  }
  return '/' + stack.join('/');
}

function nodeAt(path: string): FsNode | null {
  if (path === '/' || path === '') return root;
  let node: FsNode = root;
  for (const part of path.split('/').filter(Boolean)) {
    if (node.type !== 'dir' || !node.children[part]) return null;
    node = node.children[part];
  }
  return node;
}

function sizeOf(node: FsNode): number {
  return node.type === 'dir' ? 4096 : node.content.length;
}

/** Absolute paths that the system owns and the user may not mutate. */
const protectedPaths = new Set<string>();

// --- Public API -----------------------------------------------------------

export const fs: FsApi = {
  resolve,

  exists: (path) => nodeAt(path) !== null,

  isDir: (path) => nodeAt(path)?.type === 'dir',

  isFile: (path) => nodeAt(path)?.type === 'file',

  read: (path) => {
    const node = nodeAt(path);
    return node && node.type === 'file' ? node.content : null;
  },

  write: (path, content) => {
    if (protectedPaths.has(path)) return false;
    const parent = nodeAt(dirname(path));
    if (!parent || parent.type !== 'dir') return false;
    const existing = parent.children[basename(path)];
    const exec = existing?.type === 'file' ? existing.exec : undefined;
    parent.children[basename(path)] = { type: 'file', content, exec };
    markDirty();
    return true;
  },

  isExec: (path) => {
    const node = nodeAt(path);
    return node?.type === 'file' ? Boolean(node.exec) : false;
  },

  chmod: (path, exec) => {
    if (protectedPaths.has(path)) return false;
    const node = nodeAt(path);
    if (!node || node.type !== 'file') return false;
    node.exec = exec;
    markDirty();
    return true;
  },

  protect: (path) => {
    protectedPaths.add(path);
  },

  isProtected: (path) => protectedPaths.has(path),

  list: (path) => {
    const node = nodeAt(path);
    if (!node || node.type !== 'dir') return null;
    return Object.entries(node.children).map(([name, child]) => ({
      name,
      isDir: child.type === 'dir',
      size: sizeOf(child),
      exec: child.type === 'file' ? Boolean(child.exec) : false,
    }));
  },

  mkdir: (path) => {
    const parent = nodeAt(dirname(path));
    if (!parent || parent.type !== 'dir') return false;
    if (parent.children[basename(path)]) return false;
    parent.children[basename(path)] = { type: 'dir', children: {} };
    markDirty();
    return true;
  },

  rmdir: (path) => {
    const node = nodeAt(path);
    if (!node || node.type !== 'dir' || Object.keys(node.children).length) return false;
    const parent = nodeAt(dirname(path));
    if (!parent || parent.type !== 'dir') return false;
    delete parent.children[basename(path)];
    markDirty();
    return true;
  },

  remove: (path, recursive) => {
    if (protectedPaths.has(path)) return false;
    const node = nodeAt(path);
    if (!node) return false;
    if (node.type === 'dir' && !recursive) return false;
    const parent = nodeAt(dirname(path));
    if (!parent || parent.type !== 'dir') return false;
    delete parent.children[basename(path)];
    markDirty();
    return true;
  },

  copy: (src, dest) => {
    const node = nodeAt(src);
    if (!node) return false;
    const parent = nodeAt(dirname(dest));
    if (!parent || parent.type !== 'dir') return false;
    parent.children[basename(dest)] =
      node.type === 'file'
        ? { type: 'file', content: node.content }
        : { type: 'dir', children: { ...node.children } };
    markDirty();
    return true;
  },

  move: (src, dest) => {
    if (!fs.copy(src, dest)) return false;
    return fs.remove(src, true);
  },

  size: (path) => {
    const node = nodeAt(path);
    return node ? sizeOf(node) : 0;
  },
};

/** The whole filesystem tree, for persistence. */
export function serializeFs(): DirNode {
  return root;
}

/** Replace the filesystem contents from a restored tree. */
export function replaceFs(node: DirNode): void {
  if (node && node.type === 'dir') root.children = node.children;
}

/** Default environment variables for a shell rooted at `cwd`. */
export function defaultEnv(cwd: string): Record<string, string> {
  return {
    USER,
    HOME,
    SHELL,
    PWD: cwd,
    HOSTNAME: HOST,
    TERM: 'xterm-256color',
    LANG: 'en_US.UTF-8',
    PATH: '/usr/local/bin:/usr/bin:/bin',
    EDITOR: 'nano',
    SMASH_THEME: 'default',
  };
}
