// python / pip / pytest — run Python in the browser via the Pyodide kernel.
// Python code can call `db("SELECT ...")` to query the SMASH SQLite database.

import { installPackage, runPython, runPytest } from '../../kernel/python';
import type { FsApi } from '../../kernel/filesystem';
import { registerApp } from '../registry';
import type { AppContext, AppResult } from '../types';
import { fail, output } from '../types';
import type { Line } from '../../types';

function asLines(text: string, ok: boolean): AppResult {
  const lines: Line[] = text.split('\n').map((l) => ({ text: l }));
  return { kind: 'output', lines, ok };
}

function collectPyFiles(fs: FsApi, dir: string, base: string, acc: { path: string; content: string }[]): void {
  for (const entry of fs.list(dir) ?? []) {
    const full = `${dir}/${entry.name}`;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDir) collectPyFiles(fs, full, rel, acc);
    else if (entry.name.endsWith('.py')) acc.push({ path: rel, content: fs.read(full) ?? '' });
  }
}

async function runPythonCommand({ args, raw, shell }: AppContext): Promise<AppResult> {
  if (!args.length) {
    return output([{ text: 'usage: python <file.py> | python -c "<code>"', kind: 'muted' }]);
  }
  let code: string;
  if (args[0] === '-c') {
    code = raw
      .slice(raw.indexOf('-c') + 2)
      .trim()
      .replace(/^(['"])([\s\S]*)\1$/, '$2');
  } else {
    const path = shell.resolve(args[0]);
    if (!shell.fs.isFile(path)) return fail(`python: can't open file '${args[0]}': No such file`);
    code = shell.fs.read(path) ?? '';
  }
  const result = await runPython(code);
  return asLines(result.text, result.ok);
}

// `python`, `py`, and `python3` are the same interpreter.
for (const name of ['python', 'py', 'python3'] as const) {
  registerApp({
    name,
    summary: 'Run Python (Pyodide); has a db() bridge to SQLite',
    usage: `${name} <file.py>  |  ${name} -c "<code>"`,
    run: runPythonCommand,
  });
}

registerApp({
  name: 'pip',
  summary: 'Install a Python package (micropip)',
  usage: 'pip install <package>',
  async run({ args }: AppContext): Promise<AppResult> {
    if (args[0] !== 'install' || !args[1]) return fail('usage: pip install <package>');
    const result = await installPackage(args[1]);
    return asLines(result.text, result.ok);
  },
});

registerApp({
  name: 'pytest',
  summary: 'Run pytest over .py files in the browser',
  usage: 'pytest [path]',
  async run({ args, shell }: AppContext): Promise<AppResult> {
    const files: { path: string; content: string }[] = [];
    collectPyFiles(shell.fs, shell.cwd, '', files);
    if (!files.length) return fail('pytest: no .py files found here');
    const target = args.find((a) => !a.startsWith('-')) ?? '.';
    const result = await runPytest(files, target);
    return asLines(result.text, result.ok);
  },
});
