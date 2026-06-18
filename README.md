# SMASH

**A Linux terminal that lives in your browser.**

SMASH is a self-contained, surprisingly complete Unix-like shell that runs 100% client-side — no server, no backend, no install. It ships a virtual filesystem, an extensible app registry, real in-browser SQLite, Python via Pyodide, AES-GCM encryption, an encrypted secret vault, an LLM client, and a genuinely usable `nano` editor. Everything happens in your tab.

<video src="assets/smash_in_action.mp4" controls muted loop playsinline width="100%"></video>

```
   _____ __  __    _    ____  _   _
  / ____|  \/  |  / \  / ___|| | | |
  \___ \| |\/| | / _ \ \___ \| |_| |
   ___) | |  | |/ ___ \ ___) |  _  |
  |____/|_|  |_/_/   \_\____/|_| |_|

  A Linux terminal that lives in your browser — v1.0
```

---

## Highlights

- **A real shell, not a fake prompt** — a virtual filesystem (`/home/smash`, `/bin`, …), `$PATH` resolution, environment variables, aliases, command history, tab completion, and live syntax highlighting on the input line.
- **Scripting** — write and run `.sh` scripts, or `.js` programs against a small `smash` API (`print`, `readFile`, `writeFile`, `run`, …). `~/.smashrc` is sourced on startup.
- **Real SQLite in the browser** — `db` runs an actual SQLite engine (sql.js / WASM), persisted to `localStorage` so your data survives reloads.
- **Python, for real** — `python`, `pip install`, and `pytest` powered by [Pyodide](https://pyodide.org), plus `pysmash`, a Python editor with syntax highlighting and a `db()` bridge into SQLite.
- **Crypto & secrets** — `encrypt`/`decrypt` with AES-GCM, and `vault`, an encrypted secret store for API keys.
- **Talk to an LLM** — `ai` calls Anthropic, OpenAI, or Mistral, reading keys from your encrypted vault.
- **It looks great** — six built-in themes (Tokyo Night, Dracula, Gruvbox, Nord, Matrix, One Light) and per-color overrides via `SMASH_*` environment variables.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

The `predev`/`prebuild` hooks fetch the Pyodide runtime into `public/` automatically (run `npm run setup:python` if you want to do it by hand).

Then, in the terminal, type `help`.

## Try this first

```bash
help                     # list every command
neofetch                 # show off
nano notes.txt           # edit a file (a real editor!)
theme dracula            # switch color scheme
tree ~                   # look around the filesystem

db "create table todo(id integer primary key, task text)"
db "insert into todo(task) values ('ship SMASH')"
db "select * from todo"  # a real SQLite query

python -c "print(sum(range(100)))"
pip install requests     # micropip, in the browser

encrypt hunter2 "meet me at dawn"   # AES-GCM
```

## Built-in commands

| Area | Commands |
| --- | --- |
| **Files** | `ls` `cd` `pwd` `cat` `touch` `mkdir` `rmdir` `rm` `mv` `cp` `tree` `head` `tail` `wc` `grep` `chmod` |
| **Shell** | `echo` `env` `export` `unset` `alias` `which` `man` `history` `source` `clear` `exit` |
| **System** | `whoami` `id` `hostname` `uname` `date` `uptime` `neofetch` `theme` `curl` |
| **Editors** | `nano` (text) · `pysmash` (Python) |
| **Data** | `db` (SQLite) |
| **Python** | `python` `pip` `pytest` |
| **Security** | `encrypt` `decrypt` `vault` |
| **Users** | `useradd` `userdel` |
| **AI** | `ai` |
| **Misc** | `hello` (sample app) |

`help` lists them all; `man <command>` shows usage for any of them.

### Handy keys

- **↑ / ↓** — walk command history
- **Tab** — complete commands and paths
- **Ctrl+L** — clear the screen
- **Ctrl+C** — cancel the current line

## How it works

SMASH is built around a tiny **app registry**. Every command — even the coreutils — is an ordinary `App` that calls `registerApp()` at load time and receives a shared `ShellApi` (filesystem, env, cwd, theme, history). Because `help`, `man`, `which`, tab completion, and syntax highlighting all read that one registry, **adding a command makes it show up everywhere automatically**.

```
src/
├── App.tsx                 # mounts the Terminal
├── components/Terminal.tsx # the shell UI: input, history, keys, rendering
├── kernel/                 # the "OS": filesystem, users, themes, crypto,
│                           #   vault, database (SQLite), python (Pyodide), aliases
└── apps/                   # the commands
    ├── registry.ts         # register / look up apps
    ├── runtime.ts          # loads every app + parser, completion, highlighting
    ├── coreutils.ts        # ls, cd, cat, grep, … (the standard toolbox)
    ├── nano/ · pysmash/    # GUI apps (full-screen editors)
    └── crypto/ vault/ ai/ db/ python/ users/ hello/
```

### Add your own command

```ts
// src/apps/cowsay/cowsay.app.ts
import { registerApp } from '../registry';
import { output } from '../types';

registerApp({
  name: 'cowsay',
  summary: 'A cow says something',
  usage: 'cowsay <text>',
  run: ({ raw }) => output([{ text: ` < ${raw} >` }, { text: '   \\   ^__^' }]),
});
```

Then import it in [`src/apps/runtime.ts`](src/apps/runtime.ts) and it's instantly live in `help`, `man`, completion, and highlighting.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Type-check, then build for production |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Run ESLint |
| `npm run smoke` | Run the smoke tests |
| `npm run setup:python` | Download the Pyodide runtime into `public/` |

## Tech stack

React 19 · Vite 8 · TypeScript · ESLint · [sql.js](https://github.com/sql-js/sql.js) (SQLite/WASM) · [Pyodide](https://pyodide.org) (CPython/WASM) · Web Crypto (AES-GCM).

---

Everything runs locally in your browser. Have fun. 🚀
