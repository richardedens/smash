import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import './Nano.css';

const NANO_VERSION = '7.2';

interface NanoProps {
  /** Display name shown in the title bar. */
  name: string;
  /** Initial buffer contents. */
  initialContent: string;
  /** True when the file does not yet exist on disk. */
  isNew: boolean;
  /** Persist the buffer. Returns the number of lines written. */
  onSave: (content: string) => void;
  /** Close the editor. */
  onExit: () => void;
}

interface Cursor {
  row: number;
  col: number;
}

type Mode = 'edit' | 'exit-prompt' | 'save-prompt' | 'search' | 'help';

/** A pair: the visible label and the key chord that triggers it. */
const SHORTCUTS: { key: string; label: string }[][] = [
  [
    { key: '^G', label: 'Get Help' },
    { key: '^O', label: 'Write Out' },
    { key: '^W', label: 'Where Is' },
    { key: '^K', label: 'Cut' },
    { key: '^C', label: 'Location' },
  ],
  [
    { key: '^X', label: 'Exit' },
    { key: '^R', label: 'Read File' },
    { key: '^\\', label: 'Replace' },
    { key: '^U', label: 'Paste' },
    { key: '^J', label: 'Justify' },
  ],
];

const HELP_TEXT: string[] = [
  'SMASH nano — a tiny in-browser port of GNU nano.',
  '',
  '  ^O   Write the buffer to the file (save)',
  '  ^X   Exit (prompts to save if there are changes)',
  '  ^K   Cut the current line into the cutbuffer',
  '  ^U   Paste the cutbuffer below the current line',
  '  ^W   Search for text (Where Is)',
  '  ^A   Move to the start of the line',
  '  ^E   Move to the end of the line',
  '  ^C   Report the cursor position',
  '  ^G   Show this help text',
  '',
  '  Arrows / Home / End / PageUp / PageDown move the cursor.',
  '',
  'Press any key to return to the editor.',
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export default function Nano({ name, initialContent, isNew, onSave, onExit }: NanoProps) {
  const [lines, setLines] = useState<string[]>(() =>
    initialContent === '' ? [''] : initialContent.replace(/\n$/, '').split('\n'),
  );
  const [cursor, setCursor] = useState<Cursor>({ row: 0, col: 0 });
  const [prefCol, setPrefCol] = useState(0);
  const [modified, setModified] = useState(false);
  const [mode, setMode] = useState<Mode>('edit');
  const [status, setStatus] = useState<string>(isNew ? 'New File' : '');
  const [prompt, setPrompt] = useState('');
  const [cutBuffer, setCutBuffer] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);

  // Keep the editor focused so it always receives keystrokes.
  useEffect(() => {
    rootRef.current?.focus();
  }, [mode]);

  // Keep the cursor scrolled into view.
  useLayoutEffect(() => {
    cursorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [cursor, lines]);

  const moveTo = useCallback((row: number, col: number, line: string[]) => {
    const r = clamp(row, 0, line.length - 1);
    const c = clamp(col, 0, line[r].length);
    setCursor({ row: r, col: c });
  }, []);

  const write = useCallback(() => {
    const content = lines.join('\n');
    onSave(content);
    setModified(false);
    setStatus(`Wrote ${lines.length} line${lines.length === 1 ? '' : 's'}`);
  }, [lines, onSave]);

  const insertText = useCallback(
    (insert: string) => {
      setLines((prev) => {
        const next = [...prev];
        const line = next[cursor.row];
        if (insert === '\n') {
          const before = line.slice(0, cursor.col);
          const after = line.slice(cursor.col);
          next.splice(cursor.row, 1, before, after);
          setCursor({ row: cursor.row + 1, col: 0 });
          setPrefCol(0);
        } else {
          next[cursor.row] = line.slice(0, cursor.col) + insert + line.slice(cursor.col);
          const col = cursor.col + insert.length;
          setCursor({ row: cursor.row, col });
          setPrefCol(col);
        }
        return next;
      });
      setModified(true);
      setStatus('');
    },
    [cursor],
  );

  const backspace = useCallback(() => {
    setLines((prev) => {
      if (cursor.col === 0 && cursor.row === 0) return prev;
      const next = [...prev];
      if (cursor.col > 0) {
        const line = next[cursor.row];
        next[cursor.row] = line.slice(0, cursor.col - 1) + line.slice(cursor.col);
        setCursor({ row: cursor.row, col: cursor.col - 1 });
        setPrefCol(cursor.col - 1);
      } else {
        const prevLen = next[cursor.row - 1].length;
        next[cursor.row - 1] += next[cursor.row];
        next.splice(cursor.row, 1);
        setCursor({ row: cursor.row - 1, col: prevLen });
        setPrefCol(prevLen);
      }
      return next;
    });
    setModified(true);
    setStatus('');
  }, [cursor]);

  const del = useCallback(() => {
    setLines((prev) => {
      const next = [...prev];
      const line = next[cursor.row];
      if (cursor.col < line.length) {
        next[cursor.row] = line.slice(0, cursor.col) + line.slice(cursor.col + 1);
      } else if (cursor.row < next.length - 1) {
        next[cursor.row] += next[cursor.row + 1];
        next.splice(cursor.row + 1, 1);
      } else {
        return prev;
      }
      return next;
    });
    setModified(true);
    setStatus('');
  }, [cursor]);

  const cutLine = useCallback(() => {
    setLines((prev) => {
      setCutBuffer(prev[cursor.row]);
      const next = [...prev];
      if (next.length === 1) {
        next[0] = '';
      } else {
        next.splice(cursor.row, 1);
      }
      const row = clamp(cursor.row, 0, next.length - 1);
      setCursor({ row, col: 0 });
      return next;
    });
    setPrefCol(0);
    setModified(true);
    setStatus('Cut 1 line');
  }, [cursor]);

  const paste = useCallback(() => {
    if (cutBuffer === null) {
      setStatus('Cutbuffer is empty');
      return;
    }
    setLines((prev) => {
      const next = [...prev];
      next.splice(cursor.row + 1, 0, cutBuffer);
      setCursor({ row: cursor.row + 1, col: cutBuffer.length });
      return next;
    });
    setPrefCol(0);
    setModified(true);
    setStatus('');
  }, [cursor, cutBuffer]);

  const runSearch = useCallback(
    (query: string) => {
      if (!query) return;
      // Search forward from just after the cursor, wrapping around.
      const order: number[] = [];
      for (let i = 0; i < lines.length; i++) order.push((cursor.row + i) % lines.length);
      for (const row of order) {
        const from = row === cursor.row ? cursor.col + 1 : 0;
        const idx = lines[row].indexOf(query, from);
        if (idx >= 0) {
          setCursor({ row, col: idx });
          setPrefCol(idx);
          setStatus('');
          return;
        }
      }
      setStatus(`"${query}" not found`);
    },
    [cursor, lines],
  );

  const doExit = useCallback(() => {
    if (modified) {
      setMode('exit-prompt');
    } else {
      onExit();
    }
  }, [modified, onExit]);

  // --- Key handling -------------------------------------------------------

  const handleEditKey = useCallback(
    (e: React.KeyboardEvent) => {
      const { key } = e;

      if (e.ctrlKey || e.metaKey) {
        const lower = key.toLowerCase();
        const handlers: Record<string, () => void> = {
          x: () => doExit(),
          o: () => {
            setPrompt(name);
            setMode('save-prompt');
          },
          k: cutLine,
          u: paste,
          w: () => {
            setPrompt('');
            setMode('search');
          },
          g: () => setMode('help'),
          a: () => moveTo(cursor.row, 0, lines),
          e: () => moveTo(cursor.row, lines[cursor.row].length, lines),
          c: () =>
            setStatus(`line ${cursor.row + 1}/${lines.length}, col ${cursor.col + 1}`),
          d: del,
        };
        const handler = handlers[lower];
        if (handler) {
          e.preventDefault();
          handler();
        }
        return;
      }

      switch (key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (cursor.col > 0) {
            moveTo(cursor.row, cursor.col - 1, lines);
            setPrefCol(cursor.col - 1);
          } else if (cursor.row > 0) {
            const len = lines[cursor.row - 1].length;
            moveTo(cursor.row - 1, len, lines);
            setPrefCol(len);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (cursor.col < lines[cursor.row].length) {
            moveTo(cursor.row, cursor.col + 1, lines);
            setPrefCol(cursor.col + 1);
          } else if (cursor.row < lines.length - 1) {
            moveTo(cursor.row + 1, 0, lines);
            setPrefCol(0);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (cursor.row > 0) moveTo(cursor.row - 1, prefCol, lines);
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (cursor.row < lines.length - 1) moveTo(cursor.row + 1, prefCol, lines);
          break;
        case 'Home':
          e.preventDefault();
          moveTo(cursor.row, 0, lines);
          setPrefCol(0);
          break;
        case 'End':
          e.preventDefault();
          moveTo(cursor.row, lines[cursor.row].length, lines);
          setPrefCol(lines[cursor.row].length);
          break;
        case 'PageUp':
          e.preventDefault();
          moveTo(cursor.row - 12, prefCol, lines);
          break;
        case 'PageDown':
          e.preventDefault();
          moveTo(cursor.row + 12, prefCol, lines);
          break;
        case 'Enter':
          e.preventDefault();
          insertText('\n');
          break;
        case 'Backspace':
          e.preventDefault();
          backspace();
          break;
        case 'Delete':
          e.preventDefault();
          del();
          break;
        case 'Tab':
          e.preventDefault();
          insertText('    ');
          break;
        case 'Escape':
          e.preventDefault();
          break;
        default:
          if (key.length === 1) {
            e.preventDefault();
            insertText(key);
          }
      }
    },
    [backspace, cursor, del, doExit, insertText, lines, moveTo, name, paste, cutLine, prefCol],
  );

  const handlePromptKey = useCallback(
    (e: React.KeyboardEvent) => {
      e.preventDefault();
      if (e.key === 'Escape' || (e.ctrlKey && e.key.toLowerCase() === 'c')) {
        setStatus('Cancelled');
        setMode('edit');
        return;
      }
      if (e.key === 'Enter') {
        if (mode === 'save-prompt') {
          write();
          setMode('edit');
        } else if (mode === 'search') {
          runSearch(prompt);
          setMode('edit');
        }
        return;
      }
      if (e.key === 'Backspace') {
        setPrompt((p) => p.slice(0, -1));
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        setPrompt((p) => p + e.key);
      }
    },
    [mode, prompt, runSearch, write],
  );

  const handleExitPromptKey = useCallback(
    (e: React.KeyboardEvent) => {
      e.preventDefault();
      const k = e.key.toLowerCase();
      if (k === 'y') {
        write();
        onExit();
      } else if (k === 'n') {
        onExit();
      } else if (k === 'escape' || (e.ctrlKey && k === 'c')) {
        setStatus('Cancelled');
        setMode('edit');
      }
    },
    [onExit, write],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (mode === 'help') {
        e.preventDefault();
        setMode('edit');
        return;
      }
      if (mode === 'exit-prompt') return handleExitPromptKey(e);
      if (mode === 'save-prompt' || mode === 'search') return handlePromptKey(e);
      return handleEditKey(e);
    },
    [mode, handleEditKey, handleExitPromptKey, handlePromptKey],
  );

  // --- Render -------------------------------------------------------------

  const renderBody = () => {
    if (mode === 'help') {
      return (
        <div className="nano-body">
          {HELP_TEXT.map((line, i) => (
            <div className="nano-line" key={i}>
              {line || ' '}
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="nano-body">
        {lines.map((line, r) => {
          if (r !== cursor.row) {
            return (
              <div className="nano-line" key={r}>
                {line || ' '}
              </div>
            );
          }
          const before = line.slice(0, cursor.col);
          const at = line[cursor.col] ?? ' ';
          const after = line.slice(cursor.col + 1);
          return (
            <div className="nano-line" key={r}>
              {before}
              <span className="nano-cursor" ref={cursorRef}>
                {at === ' ' ? ' ' : at}
              </span>
              {after}
            </div>
          );
        })}
      </div>
    );
  };

  // The status / prompt line above the shortcut bar.
  const renderStatus = () => {
    if (mode === 'exit-prompt') {
      return (
        <div className="nano-status nano-status--prompt">
          Save modified buffer? (Answering &quot;No&quot; will DISCARD changes.)
        </div>
      );
    }
    if (mode === 'save-prompt') {
      return (
        <div className="nano-status nano-status--prompt">
          File Name to Write: {prompt}
          <span className="nano-cursor nano-cursor--inline">&nbsp;</span>
        </div>
      );
    }
    if (mode === 'search') {
      return (
        <div className="nano-status nano-status--prompt">
          Search: {prompt}
          <span className="nano-cursor nano-cursor--inline">&nbsp;</span>
        </div>
      );
    }
    if (status) {
      return <div className="nano-status nano-status--msg">[ {status} ]</div>;
    }
    return <div className="nano-status">&nbsp;</div>;
  };

  const renderShortcuts = () => {
    if (mode === 'exit-prompt') {
      return (
        <div className="nano-shortcuts">
          <div className="nano-bar-row">
            <span className="nano-key">Y</span> Yes
          </div>
          <div className="nano-bar-row">
            <span className="nano-key">N</span> No&nbsp;&nbsp;&nbsp;
            <span className="nano-key">^C</span> Cancel
          </div>
        </div>
      );
    }
    return (
      <div className="nano-shortcuts">
        {SHORTCUTS.map((row, i) => (
          <div className="nano-bar-row" key={i}>
            {row.map((s) => (
              <span className="nano-chord" key={s.key}>
                <span className="nano-key">{s.key}</span> {s.label}
              </span>
            ))}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      className="nano"
      tabIndex={0}
      ref={rootRef}
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => {
        // Keep keyboard focus on the editor instead of the terminal behind it.
        e.preventDefault();
        rootRef.current?.focus();
      }}
      role="textbox"
      aria-label={`nano editor: ${name}`}
    >
      <div className="nano-title">
        <span className="nano-title-left">GNU nano {NANO_VERSION}</span>
        <span className="nano-title-center">{name}</span>
        <span className="nano-title-right">{modified ? 'Modified' : ''}</span>
      </div>
      {renderBody()}
      {renderStatus()}
      {renderShortcuts()}
    </div>
  );
}
