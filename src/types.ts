// Shared types for the SMASH browser terminal.

/** Semantic color roles, mapped to SMASH palette classes in CSS. */
export type Kind =
  | 'default'
  | 'error'
  | 'accent'
  | 'muted'
  | 'dir'
  | 'exec'
  | 'file'
  | 'path'
  | 'string'
  | 'flag'
  | 'cmd-bad'
  | 'label';

/** An inline run of text with a single color role. */
export interface Segment {
  text: string;
  kind?: Kind;
}

/** A single rendered output line. Either plain `text` or styled `segments`. */
export interface Line {
  text?: string;
  segments?: Segment[];
  /** Convenience flag: render the whole line in the error color. */
  error?: boolean;
  /** Color role for a plain-text line. */
  kind?: Kind;
}

/** Action returned by a command that the Terminal must handle imperatively. */
export interface NanoAction {
  type: 'nano';
  /** Absolute path of the file being edited. */
  path: string;
  /** Display name (basename). */
  name: string;
  /** Initial buffer contents. */
  content: string;
  /** True when the file does not yet exist on disk. */
  isNew: boolean;
}

export type Action = NanoAction;

/** Result of running a command. */
export interface CommandResult {
  lines: Line[];
  /** Clear the scrollback before appending `lines`. */
  clear?: boolean;
  /** An imperative action for the Terminal (e.g. open nano). */
  action?: Action | null;
  /** Whether the command succeeded (drives the prompt arrow color). */
  ok: boolean;
}

/** A SMASH color theme. */
export interface Theme {
  label: string;
  bg: string;
  fg: string;
  green: string;
  cyan: string;
  red: string;
  yellow: string;
  blue: string;
  magenta: string;
  gray: string;
  white: string;
  /** Block-cursor color. */
  cursor: string;
}

/** Execution context handed to each command. */
export interface CommandContext {
  cwd: string;
  setCwd: (path: string) => void;
  setTheme: (name: string) => void;
  /** Name of the active theme (for e.g. neofetch). */
  themeName: string;
  /** Command history, newest first. */
  history: string[];
}

/** Result of tab completion. */
export interface CompleteResult {
  /** The new full input line after applying the completion. */
  value: string;
  /** Candidates to display when the completion is ambiguous. */
  candidates: Segment[];
}

// --- Virtual filesystem ---------------------------------------------------

export interface FileNode {
  type: 'file';
  content: string;
  /** Executable bit (set via `chmod +x`). */
  exec?: boolean;
}

export interface DirNode {
  type: 'dir';
  children: Record<string, FsNode>;
}

export type FsNode = FileNode | DirNode;
