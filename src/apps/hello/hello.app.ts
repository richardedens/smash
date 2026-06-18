// ─────────────────────────────────────────────────────────────────────────
//  hello — a template CLI application for SMASH
// ─────────────────────────────────────────────────────────────────────────
//
//  Copy this file to build your own command. The recipe is:
//
//    1. Create `src/apps/<name>/<name>.app.ts`.
//    2. Call `registerApp({ name, summary, usage, run })`.
//    3. Add `import './<name>/<name>.app';` to `src/apps/runtime.ts`.
//
//  That's it — your command is now tab-completable, shows up in `help`, has a
//  `man` page (from `summary`/`usage`), and gets syntax-highlighted at the
//  prompt. Apps register at load time, so there is no central switch to edit.
//
//  A `run(ctx)` handler receives:
//    • ctx.args   — tokenised arguments, e.g. `["--loud", "world"]`
//    • ctx.raw    — the raw argument string, e.g. `"--loud world"`
//    • ctx.shell  — services: cwd, env, history, theme, and the `fs` API
//
//  and returns one of the result helpers:
//    • output(lines) / text(str) — print to the terminal
//    • fail(message)             — print an error (red) and mark a failure
//    • gui(render)               — launch a full-screen app (see apps/nano)
//    • none() / clearScreen()    — no output / wipe the screen
//
//  Lines can be plain (`{ text }`) or styled with colored `segments`, where
//  each segment has a `kind` mapped to the active SMASH theme (accent, path,
//  error, muted, dir, exec, string, …).

import { registerApp } from '../registry';
import type { AppContext, AppResult } from '../types';
import { fail, output } from '../types';
import type { Line } from '../../types';

registerApp({
  name: 'hello',
  summary: 'Greet someone (sample CLI app)',
  usage: 'hello [--loud] [name]',

  run({ args, shell }: AppContext): AppResult {
    // Flags start with "-"; everything else is a positional operand.
    const loud = args.includes('--loud') || args.includes('-l');
    const name = args.find((a) => !a.startsWith('-')) ?? shell.env.USER;

    if (name === 'nobody') {
      // `fail` prints in the error color and reports a non-zero exit,
      // which turns the next prompt arrow red — just like a real shell.
      return fail('hello: there is no one here by that name');
    }

    let greeting = `Hello, ${name}!`;
    if (loud) greeting = greeting.toUpperCase();

    const lines: Line[] = [
      // A styled line: mix colored segments using theme `kind`s.
      {
        segments: [
          { text: '👋 ' },
          { text: greeting, kind: 'accent' },
        ],
      },
      // A plain, muted line that reads from the shell services to prove the
      // app has access to the environment and working directory.
      {
        text: `   (you are ${shell.env.USER} in ${shell.cwd}, theme: ${shell.themeName})`,
        kind: 'muted',
      },
    ];

    return output(lines);
  },
});
