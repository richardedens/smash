// nano — the reference GUI application.
//
// A GUI app returns `gui(render)`, where `render(host)` produces the React node
// that takes over the screen. The shell mounts it as an overlay and hands the
// app a `host` whose `close()` returns control to the prompt. nano persists
// through the shell's filesystem service — it never touches the tree directly.

import { basename, dirname } from '../../kernel/filesystem';
import { registerApp } from '../registry';
import { fail, gui } from '../types';
import Nano from './Nano';

registerApp({
  name: 'nano',
  summary: 'Edit a file in the nano editor',
  usage: 'nano <file>',
  run({ args, shell }) {
    const arg = args.find((a) => !a.startsWith('-'));
    if (!arg) return fail('usage: nano <file>');

    const path = shell.resolve(arg);
    if (shell.fs.isDir(path)) return fail(`nano: ${arg}: Is a directory`);

    const exists = shell.fs.exists(path);
    if (!exists && !shell.fs.isDir(dirname(path))) {
      return fail(`nano: ${arg}: No such file or directory`);
    }

    const content = exists ? shell.fs.read(path) ?? '' : '';
    return gui((host) => (
      <Nano
        name={basename(path)}
        initialContent={content}
        isNew={!exists}
        onSave={(updated) => {
          shell.fs.write(path, updated);
        }}
        onExit={host.close}
      />
    ));
  },
});
