import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { bannerLines } from '../kernel/banner';
import { defaultEnv, fs, HOME, HOST } from '../kernel/filesystem';
import { homeOf } from '../kernel/users';
import { applyColorOverrides, DEFAULT_THEME, themeEnv, THEMES } from '../kernel/themes';
import { complete, highlight, runCommand } from '../apps/runtime';
import type { AppResult, ShellApi } from '../apps/types';
import type { Kind, Line, Segment } from '../types';
import './Terminal.css';

const PROMPT_ARROW = '➜';

/** Map a semantic kind onto a CSS class. */
function kindClass(kind?: Kind): string {
  return kind ? `tl-${kind}` : '';
}

export default function Terminal() {
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(true);
  const [cwd, setCwd] = useState(HOME);
  const [currentUser, setCurrentUser] = useState('smash');
  const [chrootRoot, setChrootRoot] = useState('/');
  const [history, setHistory] = useState<string[]>([]); // newest first
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [booting, setBooting] = useState(true);
  const [themeName, setThemeName] = useState(DEFAULT_THEME);
  const [envOverrides, setEnvOverrides] = useState<Record<string, string>>({});
  const [lastOk, setLastOk] = useState(true);
  const [activeApp, setActiveApp] = useState<ReactNode>(null);
  const [running, setRunning] = useState(false); // an async command is in flight

  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // The effective theme is the named palette with any SMASH_* color overrides
  // applied, so `export SMASH_GREEN=#f00` recolors the UI live.
  const baseTheme = THEMES[themeName] ?? THEMES[DEFAULT_THEME];
  const theme = useMemo(() => applyColorOverrides(baseTheme, envOverrides), [baseTheme, envOverrides]);

  const homeDir = homeOf(currentUser);
  // The path shown in the prompt: jail-relative when chrooted, ~-abbreviated otherwise.
  const promptPath = useMemo(() => {
    if (chrootRoot !== '/') return cwd.slice(chrootRoot.length) || '/';
    if (cwd === homeDir) return '~';
    if (cwd.startsWith(homeDir + '/')) return '~' + cwd.slice(homeDir.length);
    return cwd;
  }, [cwd, chrootRoot, homeDir]);

  // Boot sequence: login line + banner, typed out line by line.
  useEffect(() => {
    const loginDate = new Date().toString().replace(/ GMT.*$/, '');
    const boot: Line[] = [
      { text: `Last login: ${loginDate} on ttys001`, kind: 'muted' },
      ...bannerLines(),
    ];
    let idx = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (idx >= boot.length) {
        setBooting(false);
        return;
      }
      const line = boot[idx]; // capture before mutating idx (updater runs later)
      idx += 1;
      setLines((prev) => [...prev, line]);
      timer = setTimeout(tick, 35);
    };
    timer = setTimeout(tick, 250);
    return () => clearTimeout(timer);
  }, []);

  // Source ~/.smashrc once at startup so its export/alias lines take effect.
  useEffect(() => {
    const rc = fs.read(`${HOME}/.smashrc`);
    if (rc === null) return;
    const base = THEMES[DEFAULT_THEME];
    const bootShell: ShellApi = {
      cwd: HOME,
      user: 'smash',
      host: HOST,
      chrootRoot: '/',
      env: { ...defaultEnv(HOME), ...themeEnv(base) },
      history: [],
      theme: base,
      themeName: DEFAULT_THEME,
      fs,
      resolve: (path: string) => fs.resolve(HOME, path),
      cd: () => true,
      setTheme: (name: string) => {
        if (!THEMES[name]) return false;
        setThemeName(name);
        return true;
      },
      setEnv: (name: string, value: string) => setEnvOverrides((prev) => ({ ...prev, [name]: value })),
      unsetEnv: (name: string) =>
        setEnvOverrides((prev) => {
          const next = { ...prev };
          delete next[name];
          return next;
        }),
      login: () => {},
      chroot: () => {},
    };
    void runCommand('source ~/.smashrc', bootShell);
  }, []);

  // Auto-scroll to the bottom when output grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [lines, input, booting]);

  // Refocus the prompt after a GUI app closes or boot finishes.
  useEffect(() => {
    if (!activeApp && !booting) inputRef.current?.focus();
  }, [activeApp, booting]);

  const setInputAndCaret = useCallback((value: string, pos?: number) => {
    const at = pos ?? value.length;
    setInput(value);
    setCaret(at);
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(at, at);
    });
  }, []);

  const syncCaret = useCallback(() => {
    const el = inputRef.current;
    if (el) setCaret(el.selectionStart ?? el.value.length);
  }, []);

  const focusInput = useCallback(() => {
    if (!activeApp) inputRef.current?.focus();
  }, [activeApp]);

  // Resolve a path, expanding `~` to the user's home and clamping to the jail.
  const resolvePath = useCallback(
    (path: string): string => {
      let p = path || '.';
      if (p === '~') p = homeDir;
      else if (p.startsWith('~/')) p = homeDir + p.slice(1);
      const real = p.startsWith('/')
        ? fs.resolve('/', (chrootRoot === '/' ? '' : chrootRoot) + p)
        : fs.resolve(cwd, p);
      if (chrootRoot !== '/' && real !== chrootRoot && !real.startsWith(chrootRoot + '/')) {
        return chrootRoot; // can't escape the jail
      }
      return real;
    },
    [cwd, chrootRoot, homeDir],
  );

  /** Build the services object handed to apps for this command. */
  const buildShell = useCallback(
    (): ShellApi => ({
      cwd,
      user: currentUser,
      host: HOST,
      chrootRoot,
      // Defaults, then user identity, then theme colors, then user overrides.
      env: {
        ...defaultEnv(cwd),
        USER: currentUser,
        HOME: homeDir,
        PWD: cwd,
        ...themeEnv(theme),
        ...envOverrides,
      },
      history,
      theme,
      themeName,
      fs,
      resolve: resolvePath,
      cd: (path: string) => {
        const abs = resolvePath(path);
        if (!fs.isDir(abs)) return false;
        setCwd(abs);
        return true;
      },
      setTheme: (name: string) => {
        if (!THEMES[name]) return false;
        setThemeName(name);
        return true;
      },
      setEnv: (name: string, value: string) => {
        setEnvOverrides((prev) => ({ ...prev, [name]: value }));
      },
      unsetEnv: (name: string) => {
        setEnvOverrides((prev) => {
          if (!(name in prev)) return prev;
          const next = { ...prev };
          delete next[name];
          return next;
        });
      },
      login: (name: string) => {
        setCurrentUser(name);
        setChrootRoot('/');
        setCwd(homeOf(name));
      },
      chroot: (dir: string) => {
        setChrootRoot(dir);
        setCwd(dir);
      },
    }),
    [cwd, currentUser, chrootRoot, homeDir, history, theme, themeName, envOverrides, resolvePath],
  );

  const promptSegments = useCallback(
    (path: string, ok: boolean, command?: string): Segment[] => {
      const segs: Segment[] = [
        { text: `${currentUser}@${HOST}`, kind: currentUser === 'root' ? 'error' : 'exec' },
        { text: ' ' },
      ];
      if (chrootRoot !== '/') segs.push({ text: '(chroot) ', kind: 'flag' });
      segs.push({ text: PROMPT_ARROW + ' ', kind: ok ? 'accent' : 'error' });
      segs.push({ text: path, kind: 'path' });
      if (command !== undefined) {
        segs.push({ text: ' ' });
        segs.push({ text: command });
      }
      return segs;
    },
    [currentUser, chrootRoot],
  );

  const applyResult = useCallback((result: AppResult) => {
    setLastOk(result.ok);
    switch (result.kind) {
      case 'gui': {
        const host = { close: () => setActiveApp(null) };
        setActiveApp(result.render(host));
        break;
      }
      case 'clear':
        setLines([]);
        break;
      case 'output':
        setLines((prev) => [...prev, ...result.lines]);
        break;
      // 'none': nothing to render
    }
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const command = input;
      // Echo the typed command immediately, so async commands feel responsive.
      setLines((prev) => [...prev, { segments: promptSegments(promptPath, lastOk, command) }]);
      setInputAndCaret('');

      if (!command.trim()) return;

      setHistory((prev) => [command, ...prev]);
      setHistoryIndex(-1);

      const result = runCommand(command, buildShell());
      if (result instanceof Promise) {
        setRunning(true);
        result.then((res) => {
          applyResult(res);
          setRunning(false);
        });
      } else {
        applyResult(result);
      }
    },
    [input, promptSegments, promptPath, lastOk, buildShell, setInputAndCaret, applyResult],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowUp') {
        if (history.length === 0) return;
        e.preventDefault();
        const next = Math.min(historyIndex + 1, history.length - 1);
        setHistoryIndex(next);
        setInputAndCaret(history[next] ?? '');
      } else if (e.key === 'ArrowDown') {
        if (historyIndex < 0) return;
        e.preventDefault();
        const next = historyIndex - 1;
        setHistoryIndex(next);
        setInputAndCaret(next < 0 ? '' : history[next] ?? '');
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const { value, candidates } = complete(input, buildShell());
        if (value !== input) {
          setInputAndCaret(value);
        } else if (candidates.length > 1) {
          const echo: Line = { segments: promptSegments(promptPath, lastOk, input) };
          const list: Line = {
            segments: candidates.flatMap((c, i) => (i === 0 ? [c] : [{ text: '  ' }, c])),
          };
          setLines((prev) => [...prev, echo, list]);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
        requestAnimationFrame(syncCaret);
      } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setLines([]);
      } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        setLines((prev) => [...prev, { segments: promptSegments(promptPath, lastOk, input + '^C') }]);
        setInputAndCaret('');
        setHistoryIndex(-1);
      }
    },
    [history, historyIndex, input, buildShell, setInputAndCaret, promptSegments, promptPath, lastOk, syncCaret],
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    setCaret(e.target.selectionStart ?? e.target.value.length);
  }, []);

  // Build the highlighted input with an inline block cursor at the caret.
  const inputSpans = useMemo(() => {
    const classes = highlight(input);
    const spans: ReactNode[] = [];
    for (let i = 0; i <= input.length; i++) {
      if (i === caret) {
        spans.push(
          <span className={`term-cursor${focused ? '' : ' term-cursor--idle'}`} key="cursor">
            {input[i] ?? ' '}
          </span>,
        );
        if (i === input.length) break;
        continue; // the char at the caret is drawn inside the cursor span
      }
      spans.push(
        <span className={kindClass(classes[i])} key={i}>
          {input[i]}
        </span>,
      );
    }
    return spans;
  }, [input, caret, focused]);

  const renderLine = useCallback((line: Line, index: number) => {
    if (line.segments) {
      return (
        <div className="terminal-line" key={index}>
          {line.segments.map((s, i) => (
            <span className={kindClass(s.kind)} key={i}>
              {s.text === '' ? ' ' : s.text}
            </span>
          ))}
        </div>
      );
    }
    const cls = `terminal-line ${line.error ? 'tl-error' : kindClass(line.kind)}`.trim();
    return (
      <div className={cls} key={index}>
        {line.text ? line.text : ' '}
      </div>
    );
  }, []);

  const styleVars = useMemo(
    () =>
      ({
        '--bg': theme.bg,
        '--fg': theme.fg,
        '--green': theme.green,
        '--cyan': theme.cyan,
        '--red': theme.red,
        '--yellow': theme.yellow,
        '--blue': theme.blue,
        '--magenta': theme.magenta,
        '--gray': theme.gray,
        '--white': theme.white,
        '--cursor': theme.cursor,
      }) as React.CSSProperties,
    [theme],
  );

  return (
    <div className="terminal-container" style={styleVars} onClick={focusInput}>
      <div className="terminal-output">
        {lines.map(renderLine)}

        {running && <div className="terminal-line tl-muted">…</div>}

        {!booting && !activeApp && !running && (
          <form className="terminal-input-row" onSubmit={handleSubmit}>
            <span className="terminal-prompt">
              {promptSegments(promptPath, lastOk).map((s, i) => (
                <span className={kindClass(s.kind)} key={i}>
                  {s.text}
                </span>
              ))}
              <span>&nbsp;</span>
            </span>
            <div className="terminal-field">
              <input
                ref={inputRef}
                className="terminal-real-input"
                type="text"
                value={input}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onSelect={syncCaret}
                onClick={syncCaret}
                onKeyUp={syncCaret}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                aria-label={`${currentUser}@${HOST} prompt`}
              />
              <div className="terminal-mirror" aria-hidden="true">
                {inputSpans}
              </div>
            </div>
          </form>
        )}

        <div ref={bottomRef} />
      </div>

      {activeApp}
    </div>
  );
}
