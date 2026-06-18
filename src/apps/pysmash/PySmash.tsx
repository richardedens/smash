import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { runPython } from '../../kernel/python';
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
  'print|len|range|int|str|float|list|dict|set|tuple|bool|open|enumerate|zip|map|filter|sum|min|max|abs|sorted|type|isinstance|input|db';

const TOKEN = new RegExp(
  [
    '(#[^\\n]*)', // 1 comment
    "('''[\\s\\S]*?'''|\"\"\"[\\s\\S]*?\"\"\"|'(?:\\\\.|[^'\\\\])*'|\"(?:\\\\.|[^\"\\\\])*\")", // 2 string
    '(\\b\\d[\\d_]*\\.?\\d*\\b)', // 3 number
    '(@\\w+)', // 4 decorator
    `(\\b(?:${KEYWORDS})\\b)`, // 5 keyword
    `(\\b(?:${BUILTINS})\\b)`, // 6 builtin
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
  nodes.push('\n'); // keep the final line height stable
  return nodes;
}

export default function PySmash({ name, initialContent, onSave, onExit }: PySmashProps) {
  const [code, setCode] = useState(initialContent);
  const [outputText, setOutputText] = useState('');
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('Ctrl+Enter to run · Ctrl+S to save · Ctrl+Q to quit');
  const [modified, setModified] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setStatus('Running… (first run loads Python, ~13 MB, self-hosted)');
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        void run();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        onExit();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const el = e.currentTarget;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const next = code.slice(0, start) + '    ' + code.slice(end);
        setCode(next);
        setModified(true);
        requestAnimationFrame(() => el.setSelectionRange(start + 4, start + 4));
      }
    },
    [code, run, save, onExit],
  );

  const syncScroll = useCallback(() => {
    if (preRef.current && textareaRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  return (
    <div className="pysmash">
      <div className="pysmash-title">
        <span>🐍 PySmash — {name}</span>
        <span className="pysmash-title-right">{modified ? '● modified' : ''}</span>
      </div>

      <div className="pysmash-editor">
        <pre className="pysmash-highlight" ref={preRef} aria-hidden="true">
          {highlight(code)}
        </pre>
        <textarea
          ref={textareaRef}
          className="pysmash-input"
          value={code}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(e) => {
            setCode(e.target.value);
            setModified(true);
          }}
          onKeyDown={handleKeyDown}
          onScroll={syncScroll}
        />
      </div>

      <div className="pysmash-output">
        <div className="pysmash-output-label">output</div>
        <pre className="pysmash-output-body">{outputText}</pre>
      </div>

      <div className="pysmash-bar">
        <span className={running ? 'pysmash-status pysmash-status--run' : 'pysmash-status'}>{status}</span>
        <span className="pysmash-keys">
          <span className="pysmash-key">^↵</span> Run&nbsp;&nbsp;
          <span className="pysmash-key">^S</span> Save&nbsp;&nbsp;
          <span className="pysmash-key">^Q</span> Quit
        </span>
      </div>
    </div>
  );
}
