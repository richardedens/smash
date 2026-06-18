// Core Linux utilities, each registered as an app on the platform.
//
// These are "built in", but they are ordinary apps — they use the same
// ShellApi and registry as nano and hello. `help`, `man` and `which` read the
// registry, so any app you add shows up automatically.

import {
  abbreviateHome,
  basename,
  HOST,
  SHELL,
  USER,
} from '../kernel/filesystem';
import { THEMES } from '../kernel/themes';
import { aliasEntries, defineAlias, lookupAlias } from '../kernel/aliases';
import { getUser } from '../kernel/users';
import { appNames, getApp, hasApp, listApps, registerApp } from './registry';
import type { App, AppContext, AppResult, ShellApi } from './types';
import { clearScreen, fail, none, output, text } from './types';
import type { DirEntry } from '../kernel/filesystem';
import type { Line, Segment } from '../types';

// --- small helpers --------------------------------------------------------

function operandsOf(args: string[]): string[] {
  return args.filter((a) => !a.startsWith('-') || a === '-');
}

function flagsOf(args: string[]): string {
  return args
    .filter((a) => a.startsWith('-') && a !== '-')
    .map((a) => a.slice(1))
    .join('');
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : ' '.repeat(width - value.length) + value;
}

function sortNames(a: string, b: string): number {
  return a.toLowerCase().localeCompare(b.toLowerCase());
}

function expandVars(input: string, env: Record<string, string>): string {
  return input.replace(/\$(\w+)/g, (whole, name: string) => (name in env ? env[name] : whole));
}

/** Build and register an app in one call. */
function def(app: App): void {
  registerApp(app);
}

// --- ls -------------------------------------------------------------------

function lsLong(entries: DirEntry[], mtime: string): Line[] {
  const sizeWidth = Math.max(...entries.map((e) => String(e.size).length), 1);
  const total = entries.reduce((sum, e) => sum + Math.ceil(e.size / 1024), 0);
  const lines: Line[] = [{ text: `total ${total}` }];
  for (const e of entries) {
    const mode = e.isDir ? 'drwxr-xr-x' : e.exec ? '-rwxr-xr-x' : '-rw-r--r--';
    const kind = e.isDir ? 'dir' : e.exec ? 'exec' : 'file';
    lines.push({
      segments: [
        { text: `${mode} ${e.isDir ? '2' : '1'} ${USER} ${USER} ` },
        { text: `${pad(String(e.size), sizeWidth)} ` },
        { text: `${mtime} ` },
        { text: e.name + (e.isDir ? '/' : e.exec ? '*' : ''), kind },
      ],
    });
  }
  return lines;
}

function lsShort(entries: DirEntry[]): Line[] {
  if (!entries.length) return [];
  const segments: Segment[] = [];
  entries.forEach((e, i) => {
    if (i > 0) segments.push({ text: '  ' });
    const kind = e.isDir ? 'dir' : e.exec ? 'exec' : 'file';
    segments.push({ text: e.name + (e.isDir ? '/' : ''), kind });
  });
  return [{ segments }];
}

// --- tree -----------------------------------------------------------------

function treeLines(
  shell: ShellApi,
  path: string,
  prefix: string,
  acc: Line[],
  counts: { dirs: number; files: number },
): void {
  const entries = (shell.fs.list(path) ?? []).slice().sort((a, b) => sortNames(a.name, b.name));
  entries.forEach((entry, i) => {
    const last = i === entries.length - 1;
    acc.push({
      segments: [
        { text: prefix + (last ? '└── ' : '├── '), kind: 'muted' },
        { text: entry.name, kind: entry.isDir ? 'dir' : 'file' },
      ],
    });
    if (entry.isDir) {
      counts.dirs += 1;
      treeLines(shell, `${path}/${entry.name}`, prefix + (last ? '    ' : '│   '), acc, counts);
    } else {
      counts.files += 1;
    }
  });
}

// --- neofetch -------------------------------------------------------------

function neofetch(shell: ShellApi): Line[] {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const h = typeof window !== 'undefined' ? window.innerHeight : 720;
  const info: [string, string][] = [
    [`${USER}@${HOST}`, ''],
    ['-----------', ''],
    ['OS', 'SMASH Linux 1.0 (Browser Edition)'],
    ['Host', 'Web Browser'],
    ['Kernel', '6.2.0-smash-wasm'],
    ['Shell', `smash 1.0 (${SHELL})`],
    ['Theme', shell.theme.label],
    ['Apps', String(appNames().length)],
    ['Resolution', `${w}x${h}`],
    ['Terminal', 'smash.js'],
    ['CPU', 'JavaScript (V8)'],
    ['Memory', '∞ MiB'],
  ];
  const logo = [
    '      .--.      ',
    '     |o_o |     ',
    '     |:_/ |     ',
    '    //   \\ \\    ',
    '   (|     | )   ',
    "  /'\\_   _/`\\   ",
    '  \\___)=(___/   ',
  ];
  const rows = Math.max(logo.length, info.length);
  const lines: Line[] = [{ text: '' }];
  for (let i = 0; i < rows; i++) {
    const segments: Segment[] = [{ text: (logo[i] ?? ' '.repeat(15)) + '  ', kind: 'accent' }];
    const entry = info[i];
    if (entry) {
      const [label, value] = entry;
      if (value) {
        segments.push({ text: label, kind: 'accent' });
        segments.push({ text: ': ' });
        segments.push({ text: value });
      } else {
        segments.push({ text: label, kind: 'label' });
      }
    }
    lines.push({ segments });
  }
  lines.push({ text: '' });
  return lines;
}

// --- registrations --------------------------------------------------------

def({
  name: 'help',
  summary: 'List available commands',
  usage: 'help',
  run() {
    const lines: Line[] = [
      { text: '' },
      { text: 'SMASH — available commands:', kind: 'accent' },
      { text: '' },
    ];
    for (const app of listApps()) {
      lines.push({
        segments: [
          { text: '  ' + app.name.padEnd(12), kind: 'exec' },
          { text: app.summary },
        ],
      });
    }
    lines.push({ text: '' });
    lines.push({ text: 'Tip: press Tab to complete commands and paths.', kind: 'muted' });
    lines.push({ text: '' });
    return output(lines);
  },
});

def({
  name: 'ls',
  summary: 'List directory contents',
  usage: 'ls [-a] [-l] [path]',
  run({ args, shell }: AppContext): AppResult {
    const operands = operandsOf(args);
    const flags = flagsOf(args);
    const target = operands[0] ? shell.resolve(operands[0]) : shell.cwd;
    if (!shell.fs.exists(target)) return fail(`ls: cannot access '${operands[0]}': No such file or directory`);
    if (shell.fs.isFile(target)) return output([{ segments: [{ text: basename(target), kind: 'file' }] }]);

    let entries = shell.fs.list(target) ?? [];
    if (!flags.includes('a')) entries = entries.filter((e) => !e.name.startsWith('.'));
    entries = entries.slice().sort((a, b) => sortNames(a.name, b.name));
    if (flags.includes('a')) {
      entries = [
        { name: '.', isDir: true, size: 4096, exec: false },
        { name: '..', isDir: true, size: 4096, exec: false },
        ...entries,
      ];
    }

    const now = new Date();
    const mtime = `${now.toLocaleString('en-US', { month: 'short' })} ${pad(String(now.getDate()), 2)} ${pad(String(now.getHours()), 2)}:${pad(String(now.getMinutes()), 2)}`;
    return output(flags.includes('l') ? lsLong(entries, mtime) : lsShort(entries));
  },
});

def({
  name: 'cd',
  summary: 'Change the working directory',
  usage: 'cd [path]',
  run({ args, shell }: AppContext): AppResult {
    const arg = operandsOf(args)[0];
    const target = !arg || arg === '~' ? shell.resolve('~') : shell.resolve(arg);
    if (!shell.fs.exists(target)) return fail(`cd: no such file or directory: ${arg}`);
    if (!shell.fs.isDir(target)) return fail(`cd: not a directory: ${arg}`);
    shell.cd(target);
    return none();
  },
});

def({
  name: 'pwd',
  summary: 'Print the working directory',
  usage: 'pwd',
  run: ({ shell }) =>
    text(shell.chrootRoot === '/' ? shell.cwd : shell.cwd.slice(shell.chrootRoot.length) || '/'),
});

def({
  name: 'cat',
  summary: 'Print file contents',
  usage: 'cat <file>',
  run({ args, shell }: AppContext): AppResult {
    const operands = operandsOf(args);
    if (!operands.length) return fail('cat: missing file operand');
    const lines: Line[] = [];
    for (const operand of operands) {
      const path = shell.resolve(operand);
      if (!shell.fs.exists(path)) return fail(`cat: ${operand}: No such file or directory`);
      if (shell.fs.isDir(path)) return fail(`cat: ${operand}: Is a directory`);
      for (const line of (shell.fs.read(path) ?? '').split('\n')) lines.push({ text: line });
    }
    return output(lines);
  },
});

def({
  name: 'echo',
  summary: 'Write arguments to output',
  usage: 'echo [text]',
  run: ({ raw, shell }) => text(expandVars(raw, shell.env)),
});

def({
  name: 'touch',
  summary: 'Create an empty file',
  usage: 'touch <file>',
  run({ args, shell }: AppContext): AppResult {
    const operands = operandsOf(args);
    if (!operands.length) return fail('touch: missing file operand');
    for (const operand of operands) {
      const path = shell.resolve(operand);
      if (shell.fs.isDir(path)) return fail(`touch: ${operand}: Is a directory`);
      if (!shell.fs.exists(path) && !shell.fs.write(path, '')) {
        return fail(`touch: cannot touch '${operand}': No such file or directory`);
      }
    }
    return none();
  },
});

def({
  name: 'mkdir',
  summary: 'Create a directory',
  usage: 'mkdir <dir>',
  run({ args, shell }: AppContext): AppResult {
    const operands = operandsOf(args);
    if (!operands.length) return fail('mkdir: missing operand');
    for (const operand of operands) {
      if (!shell.fs.mkdir(shell.resolve(operand))) {
        return fail(`mkdir: cannot create directory '${operand}': File exists or invalid path`);
      }
    }
    return none();
  },
});

def({
  name: 'rmdir',
  summary: 'Remove an empty directory',
  usage: 'rmdir <dir>',
  run({ args, shell }: AppContext): AppResult {
    const operand = operandsOf(args)[0];
    if (!operand) return fail('rmdir: missing operand');
    if (!shell.fs.rmdir(shell.resolve(operand))) {
      return fail(`rmdir: failed to remove '${operand}': Not empty or not a directory`);
    }
    return none();
  },
});

def({
  name: 'rm',
  summary: 'Remove a file (or dir with -r)',
  usage: 'rm [-r] <path>',
  run({ args, shell }: AppContext): AppResult {
    const operands = operandsOf(args);
    const recursive = flagsOf(args).includes('r') || flagsOf(args).includes('R');
    if (!operands.length) return fail('rm: missing operand');
    for (const operand of operands) {
      const path = shell.resolve(operand);
      if (!shell.fs.exists(path)) return fail(`rm: cannot remove '${operand}': No such file or directory`);
      if (shell.fs.isProtected(path)) return fail(`rm: cannot remove '${operand}': Operation not permitted`);
      if (shell.fs.isDir(path) && !recursive) return fail(`rm: cannot remove '${operand}': Is a directory`);
      shell.fs.remove(path, recursive);
    }
    return none();
  },
});

for (const name of ['mv', 'cp'] as const) {
  def({
    name,
    summary: name === 'mv' ? 'Move or rename a file' : 'Copy a file',
    usage: `${name} <src> <dest>`,
    run({ args, shell }: AppContext): AppResult {
      const operands = operandsOf(args);
      if (operands.length < 2) return fail(`${name}: missing destination file operand`);
      const src = shell.resolve(operands[0]);
      if (!shell.fs.exists(src)) return fail(`${name}: cannot stat '${operands[0]}': No such file or directory`);
      let dest = shell.resolve(operands[1]);
      if (shell.fs.isDir(dest)) dest = `${dest}/${basename(src)}`;
      const okResult = name === 'mv' ? shell.fs.move(src, dest) : shell.fs.copy(src, dest);
      if (!okResult) return fail(`${name}: cannot create '${operands[1]}': No such file or directory`);
      return none();
    },
  });
}

def({
  name: 'tree',
  summary: 'Show the directory tree',
  usage: 'tree [path]',
  run({ args, shell }: AppContext): AppResult {
    const target = operandsOf(args)[0] ? shell.resolve(operandsOf(args)[0]) : shell.cwd;
    if (!shell.fs.isDir(target)) return fail(`tree: ${operandsOf(args)[0] ?? target}: Not a directory`);
    const acc: Line[] = [{ text: abbreviateHome(target), kind: 'dir' }];
    const counts = { dirs: 0, files: 0 };
    treeLines(shell, target, '', acc, counts);
    acc.push({ text: '' });
    acc.push({ text: `${counts.dirs} directories, ${counts.files} files`, kind: 'muted' });
    return output(acc);
  },
});

for (const name of ['head', 'tail'] as const) {
  def({
    name,
    summary: name === 'head' ? 'Print the first lines of a file' : 'Print the last lines of a file',
    usage: `${name} [-n N] <file>`,
    run({ args, shell }: AppContext): AppResult {
      let count = 10;
      const nIndex = args.indexOf('-n');
      if (nIndex >= 0 && args[nIndex + 1]) count = parseInt(args[nIndex + 1], 10) || 10;
      const file = operandsOf(args).find((a) => a !== String(count));
      if (!file) return fail(`${name}: missing file operand`);
      const path = shell.resolve(file);
      if (!shell.fs.exists(path)) return fail(`${name}: cannot open '${file}' for reading: No such file or directory`);
      if (shell.fs.isDir(path)) return fail(`${name}: error reading '${file}': Is a directory`);
      const all = (shell.fs.read(path) ?? '').split('\n');
      const slice = name === 'head' ? all.slice(0, count) : all.slice(-count);
      return output(slice.map((l) => ({ text: l })));
    },
  });
}

def({
  name: 'wc',
  summary: 'Count lines, words and bytes',
  usage: 'wc <file>',
  run({ args, shell }: AppContext): AppResult {
    const operand = operandsOf(args)[0];
    if (!operand) return fail('wc: missing file operand');
    const path = shell.resolve(operand);
    if (!shell.fs.exists(path)) return fail(`wc: ${operand}: No such file or directory`);
    if (shell.fs.isDir(path)) return fail(`wc: ${operand}: Is a directory`);
    const content = shell.fs.read(path) ?? '';
    const lineCount = content.split('\n').length;
    const words = content.split(/\s+/).filter(Boolean).length;
    return text(`${pad(String(lineCount), 7)} ${pad(String(words), 7)} ${pad(String(content.length), 7)} ${operand}`);
  },
});

def({
  name: 'grep',
  summary: 'Search for a pattern in a file',
  usage: 'grep <pattern> <file>',
  run({ args, shell }: AppContext): AppResult {
    const operands = operandsOf(args);
    if (operands.length < 2) return fail('usage: grep <pattern> <file>');
    const [pattern, file] = operands;
    const path = shell.resolve(file);
    if (!shell.fs.exists(path)) return fail(`grep: ${file}: No such file or directory`);
    if (shell.fs.isDir(path)) return fail(`grep: ${file}: Is a directory`);
    const matches: Line[] = [];
    for (const line of (shell.fs.read(path) ?? '').split('\n')) {
      const idx = line.toLowerCase().indexOf(pattern.toLowerCase());
      if (idx < 0) continue;
      matches.push({
        segments: [
          { text: line.slice(0, idx) },
          { text: line.slice(idx, idx + pattern.length), kind: 'error' },
          { text: line.slice(idx + pattern.length) },
        ],
      });
    }
    return output(matches);
  },
});

def({
  name: 'chmod',
  summary: 'Change a file mode (e.g. make it executable)',
  usage: 'chmod <mode> <file>   # mode: +x, -x, or octal like 755',
  run({ args, shell }: AppContext): AppResult {
    const [mode, file] = args;
    if (!mode || !file) return fail('usage: chmod <mode> <file>');
    const path = shell.resolve(file);
    if (!shell.fs.exists(path)) return fail(`chmod: cannot access '${file}': No such file or directory`);
    if (shell.fs.isDir(path)) return fail(`chmod: '${file}': Operation not permitted on a directory`);
    if (shell.fs.isProtected(path)) return fail(`chmod: changing permissions of '${file}': Operation not permitted`);

    let exec: boolean;
    if (/^[0-7]{3,4}$/.test(mode)) exec = (parseInt(mode.slice(-3, -2), 10) & 1) === 1;
    else if (mode.includes('+x')) exec = true;
    else if (mode.includes('-x')) exec = false;
    else return fail(`chmod: invalid mode: '${mode}'`);

    shell.fs.chmod(path, exec);
    return none();
  },
});

def({ name: 'clear', summary: 'Clear the terminal screen', usage: 'clear', run: () => clearScreen() });

def({
  name: 'curl',
  summary: 'Transfer data from a URL',
  usage: 'curl [-I] <url>',
  async run({ args }: AppContext): Promise<AppResult> {
    const flags = flagsOf(args);
    let url = operandsOf(args)[0];
    if (!url) return fail("curl: try 'curl <url>'");
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `https://${url}`;
    try {
      const res = await fetch(url, { method: flags.includes('I') ? 'HEAD' : 'GET', redirect: 'follow' });
      if (flags.includes('I')) {
        const head: Line[] = [{ text: `HTTP/1.1 ${res.status} ${res.statusText}`, kind: 'accent' }];
        res.headers.forEach((value, key) =>
          head.push({ segments: [{ text: `${key}: `, kind: 'muted' }, { text: value }] }),
        );
        return output(head);
      }
      const body = await res.text();
      return output(body.split('\n').map((l) => ({ text: l })));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'request failed';
      return fail(`curl: (6) could not fetch ${url} — ${message} (cross-origin sites need CORS headers)`);
    }
  },
});

def({ name: 'whoami', summary: 'Print the current user', usage: 'whoami', run: ({ shell }) => text(shell.user) });

def({
  name: 'id',
  summary: 'Print user and group IDs',
  usage: 'id',
  run: ({ shell }) => {
    const uid = getUser(shell.user)?.uid ?? 1000;
    const groups = uid === 0 ? '0(root)' : '27(sudo)';
    return text(`uid=${uid}(${shell.user}) gid=${uid}(${shell.user}) groups=${uid}(${shell.user}),${groups}`);
  },
});

def({ name: 'hostname', summary: 'Print the system hostname', usage: 'hostname', run: () => text(HOST) });

def({
  name: 'uname',
  summary: 'Print system information',
  usage: 'uname [-a]',
  run: ({ args }) =>
    flagsOf(args).includes('a')
      ? text(`Linux ${HOST} 6.2.0-smash-wasm #1 SMP x86_64 SMASH/Linux`)
      : text('Linux'),
});

def({ name: 'date', summary: 'Print the current date and time', usage: 'date', run: () => text(new Date().toString()) });

def({
  name: 'uptime',
  summary: 'Show how long the system has been up',
  usage: 'uptime',
  run() {
    const since = typeof performance !== 'undefined' ? performance.now() : 0;
    const mins = Math.floor(since / 60000);
    return text(` ${new Date().toLocaleTimeString()} up ${mins} min,  1 user,  load average: 0.00, 0.01, 0.05`);
  },
});

def({
  name: 'env',
  summary: 'Print environment variables',
  usage: 'env',
  run: ({ shell }) => output(Object.entries(shell.env).map(([k, v]) => ({ text: `${k}=${v}` }))),
});

def({
  name: 'export',
  summary: 'Set an environment variable (try SMASH_* colors!)',
  usage: 'export NAME=value   # e.g. export SMASH_GREEN=#ff0066',
  run({ raw, shell }: AppContext): AppResult {
    if (!raw) {
      return output(
        Object.entries(shell.env)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => ({ text: `declare -x ${k}="${v}"` })),
      );
    }
    const eq = raw.indexOf('=');
    if (eq < 0) return fail('export: usage: export NAME=value');
    const name = raw.slice(0, eq).trim();
    if (!/^[A-Za-z_]\w*$/.test(name)) return fail(`export: \`${name}': not a valid identifier`);
    let value = raw.slice(eq + 1).trim();
    value = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    shell.setEnv(name, expandVars(value, shell.env));
    return none();
  },
});

def({
  name: 'unset',
  summary: 'Unset an environment variable',
  usage: 'unset NAME',
  run({ args, shell }: AppContext): AppResult {
    const name = operandsOf(args)[0];
    if (!name) return fail('unset: not enough arguments');
    shell.unsetEnv(name);
    return none();
  },
});

def({
  name: 'alias',
  summary: 'Define or list command aliases',
  usage: "alias [name='value']",
  run({ raw }: AppContext): AppResult {
    if (!raw) {
      return output(
        aliasEntries()
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => ({ text: `alias ${k}='${v}'` })),
      );
    }
    const eq = raw.indexOf('=');
    if (eq < 0) {
      const value = lookupAlias(raw.trim());
      return value ? output([{ text: `alias ${raw.trim()}='${value}'` }]) : fail(`alias: ${raw.trim()}: not found`);
    }
    const name = raw.slice(0, eq).trim();
    if (!/^[A-Za-z_][\w-]*$/.test(name)) return fail(`alias: \`${name}': invalid alias name`);
    const value = raw
      .slice(eq + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');
    defineAlias(name, value);
    return none();
  },
});

def({
  name: 'which',
  summary: 'Locate a command',
  usage: 'which <command>',
  run({ args }: AppContext): AppResult {
    const name = operandsOf(args)[0];
    if (!name) return fail('which: missing argument');
    return hasApp(name)
      ? text(`/usr/bin/${name}`)
      : { kind: 'output', lines: [{ text: `${name} not found`, kind: 'muted' }], ok: false };
  },
});

def({
  name: 'man',
  summary: 'Show a manual page',
  usage: 'man <command>',
  run({ args }: AppContext): AppResult {
    const name = operandsOf(args)[0];
    if (!name) return fail('What manual page do you want?');
    const app = getApp(name);
    if (!app) return fail(`No manual entry for ${name}`);
    return output([
      { text: '' },
      { text: 'NAME', kind: 'accent' },
      { text: `       ${app.name} — ${app.summary}` },
      { text: '' },
      { text: 'SYNOPSIS', kind: 'accent' },
      { text: `       ${app.usage ?? app.name}` },
      { text: '' },
    ]);
  },
});

def({
  name: 'history',
  summary: 'Show command history',
  usage: 'history',
  run: ({ shell }) =>
    output(
      [...shell.history].reverse().map((entry, i) => ({
        segments: [
          { text: `  ${pad(String(i + 1), 4)}  `, kind: 'muted' },
          { text: entry },
        ],
      })),
    ),
});

def({
  name: 'theme',
  summary: 'Change the color theme',
  usage: 'theme [name]',
  run({ args, shell }: AppContext): AppResult {
    const name = operandsOf(args)[0];
    if (!name) {
      const lines: Line[] = [{ text: 'Available themes:', kind: 'accent' }];
      for (const [key, t] of Object.entries(THEMES)) {
        lines.push({
          segments: [
            { text: '  ' + key.padEnd(10), kind: key === shell.themeName ? 'accent' : 'exec' },
            { text: t.label, kind: 'muted' },
            ...(key === shell.themeName ? [{ text: '  (active)', kind: 'muted' as const }] : []),
          ],
        });
      }
      lines.push({ text: 'Usage: theme <name>', kind: 'muted' });
      return output(lines);
    }
    if (!shell.setTheme(name)) {
      return fail(`theme: unknown theme '${name}' (try: ${Object.keys(THEMES).join(', ')})`);
    }
    return output([{ segments: [{ text: 'Theme set to ' }, { text: THEMES[name].label, kind: 'accent' }] }]);
  },
});

def({ name: 'neofetch', summary: 'Show system info with a logo', usage: 'neofetch', run: ({ shell }) => output(neofetch(shell)) });

def({
  name: 'exit',
  summary: 'Close the shell session',
  usage: 'exit',
  run: () =>
    output([
      { text: 'logout', kind: 'muted' },
      { text: '(this is a browser — just close the tab 🙂)', kind: 'muted' },
    ]),
});
