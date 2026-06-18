import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { getPythonStatus, onPythonStatus, runPython } from '../../kernel/python';
import type { PythonStatus } from '../../kernel/python';
import './PySmash.css';

interface PySmashProps {
  name: string;
  initialContent: string;
  onSave: (content: string) => void;
  onExit: () => void;
}

const KEYWORDS =
  'False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield';
const BUILTINS =
  'print|len|range|int|str|float|list|dict|set|tuple|bool|open|enumerate|zip|map|filter|sum|min|max|abs|sorted|reversed|round|any|all|type|isinstance|input|repr|format|db';

const KEYWORD_LIST = KEYWORDS.split('|');
const BUILTIN_LIST = BUILTINS.split('|');

const TOKEN = new RegExp(
  [
    '(#[^\\n]*)', // 1 comment
    "([rfbRFB]{0,2}'''[\\s\\S]*?'''|[rfbRFB]{0,2}\"\"\"[\\s\\S]*?\"\"\"|[rfbRFB]{0,2}'(?:\\\\.|[^'\\\\])*'|[rfbRFB]{0,2}\"(?:\\\\.|[^\"\\\\])*\")", // 2 string
    '(\\b\\d[\\d_]*\\.?\\d*\\b)', // 3 number
    '(@\\w+)', // 4 decorator
    '(\\b(?:self|cls)\\b)', // 5 self/cls
    `(\\b(?:${KEYWORDS})\\b)`, // 6 keyword
    `(\\b(?:${BUILTINS})\\b)`, // 7 builtin
  ].join('|'),
  'g',
);

function highlight(code: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(code)) !== null) {
    if (m.index > last) nodes.push(code.slice(last, m.index));
    const cls = m[1]
      ? 'py-comment'
      : m[2]
        ? 'py-string'
        : m[3]
          ? 'py-number'
          : m[4]
            ? 'py-decorator'
            : m[5]
              ? 'py-self'
              : m[6]
                ? 'py-keyword'
                : 'py-builtin';
    nodes.push(
      <span className={cls} key={key++}>
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < code.length) nodes.push(code.slice(last));
  return nodes;
}

function wordBeforeCaret(code: string, caret: number): { prefix: string; start: number } | null {
  const match = code.slice(0, caret).match(/[A-Za-z_]\w*$/);
  return match ? { prefix: match[0], start: caret - match[0].length } : null;
}

function completionsFor(prefix: string, code: string): string[] {
  const ids = new Set<string>([...KEYWORD_LIST, ...BUILTIN_LIST]);
  for (const id of code.match(/[A-Za-z_]\w*/g) ?? []) ids.add(id);
  return [...ids]
    .filter((id) => id !== prefix && id.toLowerCase().startsWith(prefix.toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 8);
}

export default function PySmash({ name, initialContent, onSave, onExit }: PySmashProps) {
  const [code, setCode] = useState(initialContent);
  const [caret, setCaret] = useState(0);
  const [outputText, setOutputText] = useState('');
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('Ctrl+Enter run · Ctrl+S save · Ctrl+Q quit · type for completions');
  const [modified, setModified] = useState(false);

  const [completions, setCompletions] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [popup, setPopup] = useState<{ top: number; left: number } | null>(null);

  const [pyStatus, setPyStatus] = useState<PythonStatus>(getPythonStatus);
  useEffect(() => onPythonStatus(setPyStatus), []);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLPreElement>(null);
  const codeRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const lineNumbers = useMemo(() => {
    const count = code.split('\n').length;
    return Array.from({ length: count }, (_, i) => i + 1).join('\n');
  }, [code]);

  // Position the completion popup just below the caret, measured from the
  // zero-width marker we inject into the (scroll-synced) highlight layer.
  useLayoutEffect(() => {
    if (!completions.length || !markerRef.current || !codeRef.current) {
      setPopup(null);
      return;
    }
    const m = markerRef.current.getBoundingClientRect();
    const c = codeRef.current.getBoundingClientRect();
    setPopup({ top: m.bottom - c.top, left: m.left - c.left });
  }, [completions, caret, code]);

  const refreshCompletions = useCallback((value: string, pos: number) => {
    const word = wordBeforeCaret(value, pos);
    if (word && word.prefix.length >= 1) {
      const list = completionsFor(word.prefix, value);
      if (list.length) {
        setCompletions(list);
        setSelected(0);
        return;
      }
    }
    setCompletions([]);
  }, []);

  const apply = useCallback((value: string, pos: number) => {
    setCode(value);
    setCaret(pos);
    setModified(true);
    requestAnimationFrame(() => textareaRef.current?.setSelectionRange(pos, pos));
  }, []);

  const insertAtSelection = useCallback(
    (text: string) => {
      const el = textareaRef.current;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      apply(code.slice(0, start) + text + code.slice(end), start + text.length);
      setCompletions([]);
    },
    [code, apply],
  );

  const acceptCompletion = useCallback(
    (candidate: string) => {
      const word = wordBeforeCaret(code, caret);
      if (!word) return;
      apply(code.slice(0, word.start) + candidate + code.slice(caret), word.start + candidate.length);
      setCompletions([]);
    },
    [code, caret, apply],
  );

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    const result = await runPython(code);
    setOutputText(result.text || (result.ok ? '(no output)' : '(error)'));
    setStatus(result.ok ? 'Finished' : 'Finished with errors');
    setRunning(false);
    textareaRef.current?.focus();
  }, [code, running]);

  const save = useCallback(() => {
    onSave(code);
    setModified(false);
    setStatus(`Saved ${name}`);
  }, [code, name, onSave]);

  const autoIndent = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const lineStart = code.lastIndexOf('\n', start - 1) + 1;
    const line = code.slice(lineStart, start);
    const indent = line.match(/^[ \t]*/)?.[0] ?? '';
    const extra = line.trimEnd().endsWith(':') ? '    ' : '';
    insertAtSelection('\n' + indent + extra);
  }, [code, insertAtSelection]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'Enter') return e.preventDefault(), void run();
      if (ctrl && e.key.toLowerCase() === 's') return e.preventDefault(), save();
      if (ctrl && e.key.toLowerCase() === 'q') return e.preventDefault(), onExit();
      if (ctrl && e.key === ' ') {
        e.preventDefault();
        return refreshCompletions(code, textareaRef.current?.selectionStart ?? caret);
      }

      if (completions.length) {
        if (e.key === 'ArrowDown') return e.preventDefault(), setSelected((s) => (s + 1) % completions.length);
        if (e.key === 'ArrowUp')
          return e.preventDefault(), setSelected((s) => (s - 1 + completions.length) % completions.length);
        if (e.key === 'Enter' || e.key === 'Tab') return e.preventDefault(), acceptCompletion(completions[selected]);
        if (e.key === 'Escape') return e.preventDefault(), setCompletions([]);
      }

      if (e.key === 'Tab') return e.preventDefault(), insertAtSelection('    ');
      if (e.key === 'Enter') return e.preventDefault(), autoIndent();
    },
    [
      run,
      save,
      onExit,
      completions,
      selected,
      acceptCompletion,
      insertAtSelection,
      autoIndent,
      refreshCompletions,
      code,
      caret,
    ],
  );

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const pos = e.target.selectionStart;
      setCode(value);
      setCaret(pos);
      setModified(true);
      refreshCompletions(value, pos);
    },
    [refreshCompletions],
  );

  const syncCaret = useCallback(() => {
    const el = textareaRef.current;
    if (el) setCaret(el.selectionStart);
    setCompletions([]);
  }, []);

  const syncScroll = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (preRef.current) {
      preRef.current.scrollTop = el.scrollTop;
      preRef.current.scrollLeft = el.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = el.scrollTop;
  }, []);

  const before = code.slice(0, caret);
  const after = code.slice(caret);

  return (
    <div className="pysmash">
      <div className="pysmash-title">
        <span>🐍 PySmash — {name}</span>
        <span className="pysmash-title-right">{modified ? '● modified' : ''}</span>
      </div>

      {running && (
        <div className="pysmash-progress">
          <div className="pysmash-progress-bar" />
        </div>
      )}

      <div className="pysmash-editor">
        <pre className="pysmash-gutter" ref={gutterRef} aria-hidden="true">
          {lineNumbers}
        </pre>
        <div className="pysmash-code" ref={codeRef}>
          <pre className="pysmash-highlight" ref={preRef} aria-hidden="true">
            {highlight(before)}
            <span className="pysmash-marker" ref={markerRef} />
            {highlight(after)}
            {'\n'}
          </pre>
          <textarea
            ref={textareaRef}
            className="pysmash-input"
            value={code}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={onChange}
            onKeyDown={handleKeyDown}
            onClick={syncCaret}
            onScroll={syncScroll}
          />
          {completions.length > 0 && popup && (
            <ul className="pysmash-complete" style={{ top: popup.top, left: popup.left }}>
              {completions.map((c, i) => (
                <li
                  key={c}
                  className={i === selected ? 'sel' : ''}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    acceptCompletion(c);
                  }}
                >
                  {c}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="pysmash-output">
        <div className="pysmash-output-label">output</div>
        <pre className="pysmash-output-body">{outputText}</pre>
      </div>

      <div className="pysmash-bar">
        <span className={running ? 'pysmash-status pysmash-status--run' : 'pysmash-status'}>
          {running ? (pyStatus.phase === 'loading' ? pyStatus.message : 'Running…') : status}
        </span>
        <span className="pysmash-keys">
          <span className="pysmash-key">^↵</span> Run&nbsp;&nbsp;
          <span className="pysmash-key">^S</span> Save&nbsp;&nbsp;
          <span className="pysmash-key">^Q</span> Quit
        </span>
      </div>
    </div>
  );
}
