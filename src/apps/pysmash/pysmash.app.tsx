// pysmash — a Python editor GUI app: syntax highlighting + run-in-browser
// (Pyodide) + a db() bridge to the SMASH SQLite database.

import { basename, dirname } from '../../kernel/filesystem';
import { registerApp } from '../registry';
import { fail, gui } from '../types';
import PySmash from './PySmash';

const TEMPLATE = [
  '# pysmash — Python in the browser (Ctrl+Enter to run)',
  '# Python here can use the SMASH database via db():',
  '',
  'print("hello from pysmash")',
  '',
  'db("CREATE TABLE IF NOT EXISTS people(name TEXT, age INTEGER)")',
  'db("INSERT INTO people VALUES (\'ada\', 36)")',
  'for row in db("SELECT * FROM people"):',
  '    print(row)',
  '',
].join('\n');

registerApp({
  name: 'pysmash',
  summary: 'Python editor + runtime (syntax highlighting, pytest, db bridge)',
  usage: 'pysmash <file.py>',
  run({ args, shell }) {
    const arg = args.find((a) => !a.startsWith('-'));
    if (!arg) return fail('usage: pysmash <file.py>');

    const path = shell.resolve(arg);
    if (shell.fs.isDir(path)) return fail(`pysmash: ${arg}: Is a directory`);
    const exists = shell.fs.exists(path);
    if (!exists && !shell.fs.isDir(dirname(path))) return fail(`pysmash: ${arg}: No such file or directory`);

    const content = exists ? shell.fs.read(path) ?? '' : TEMPLATE;
    return gui((host) => (
      <PySmash
        name={basename(path)}
        initialContent={content}
        onSave={(updated) => {
          shell.fs.write(path, updated);
        }}
        onExit={host.close}
      />
    ));
  },
});
