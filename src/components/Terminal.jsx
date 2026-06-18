import { useState, useEffect, useRef, useCallback } from 'react';
import { executeCommand, BOOT_LINES, WELCOME_LINES } from '../commands/index.js';
import './Terminal.css';

const PROMPT_SUFFIX = '>'; // e.g. C:\>

export default function Terminal() {
  const [lines, setLines] = useState([]);
  const [input, setInput] = useState('');
  const [currentDir, setCurrentDir] = useState('C:\\');
  const [history, setHistory] = useState([]);
  const [, setHistoryIndex] = useState(-1);
  const [booting, setBooting] = useState(true);
  const [color, setColor] = useState({ bg: '#000000', fg: '#AAAAAA' });

  const inputRef = useRef(null);
  const bottomRef = useRef(null);

  const prompt = `${currentDir}${PROMPT_SUFFIX}`;

  // Boot sequence
  useEffect(() => {
    const allBootLines = [...BOOT_LINES, ...WELCOME_LINES];
    let idx = 0;

    const tick = () => {
      if (idx >= allBootLines.length) {
        setBooting(false);
        return;
      }
      setLines((prev) => [...prev, { text: allBootLines[idx] }]);
      idx++;
      setTimeout(tick, idx <= BOOT_LINES.length ? 80 : 30);
    };

    setTimeout(tick, 300);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, input]);

  // Focus input on click anywhere
  const handleContainerClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const trimmed = input.trim();

      // Echo the command with prompt
      const echoLine = { text: `${prompt} ${trimmed}`, isCommand: true };

      if (!trimmed) {
        setLines((prev) => [...prev, echoLine]);
        setInput('');
        return;
      }

      // Add to history
      setHistory((prev) => [trimmed, ...prev]);
      setHistoryIndex(-1);

      const output = executeCommand(trimmed, currentDir, setCurrentDir, setColor);

      // Check for cls
      if (output.length === 1 && output[0].cls) {
        setLines([]);
        setInput('');
        return;
      }

      setLines((prev) => [...prev, echoLine, ...output]);
      setInput('');
    },
    [input, prompt, currentDir]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHistoryIndex((prev) => {
          const next = Math.min(prev + 1, history.length - 1);
          setInput(history[next] ?? '');
          return next;
        });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHistoryIndex((prev) => {
          const next = Math.max(prev - 1, -1);
          setInput(next === -1 ? '' : (history[next] ?? ''));
          return next;
        });
      } else if (e.key === 'Tab') {
        e.preventDefault();
        // Simple tab completion stub
      }
    },
    [history]
  );

  return (
    <div
      className="terminal-container"
      style={{ backgroundColor: color.bg, color: color.fg }}
      onClick={handleContainerClick}
    >
      <div className="terminal-screen">
        <div className="terminal-output">
          {lines.map((line, i) => (
            <div
              key={i}
              className={`terminal-line${line.isCommand ? ' terminal-command' : ''}${line.error ? ' terminal-error' : ''}`}
            >
              {line.text || '\u00A0'}
            </div>
          ))}
        </div>

        {!booting && (
          <form className="terminal-input-row" onSubmit={handleSubmit}>
            <span className="terminal-prompt">{prompt}&nbsp;</span>
            <input
              ref={inputRef}
              className="terminal-input"
              style={{ color: color.fg }}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
            />
            <span className="terminal-cursor" aria-hidden="true" />
          </form>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
