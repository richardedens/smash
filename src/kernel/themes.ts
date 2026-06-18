import type { Theme } from '../types';

/** SMASH color palettes, switchable at runtime via the `theme` command. */
export const THEMES: Record<string, Theme> = {
  default: {
    label: 'Tokyo Night (default)',
    bg: '#1a1b26',
    fg: '#a9b1d6',
    green: '#9ece6a',
    cyan: '#7dcfff',
    red: '#f7768e',
    yellow: '#e0af68',
    blue: '#7aa2f7',
    magenta: '#bb9af7',
    gray: '#565f89',
    white: '#c0caf5',
    cursor: '#c0caf5',
  },
  dracula: {
    label: 'Dracula',
    bg: '#282a36',
    fg: '#f8f8f2',
    green: '#50fa7b',
    cyan: '#8be9fd',
    red: '#ff5555',
    yellow: '#f1fa8c',
    blue: '#6272a4',
    magenta: '#bd93f9',
    gray: '#6272a4',
    white: '#f8f8f2',
    cursor: '#f8f8f2',
  },
  gruvbox: {
    label: 'Gruvbox Dark',
    bg: '#282828',
    fg: '#ebdbb2',
    green: '#b8bb26',
    cyan: '#8ec07c',
    red: '#fb4934',
    yellow: '#fabd2f',
    blue: '#83a598',
    magenta: '#d3869b',
    gray: '#928374',
    white: '#fbf1c7',
    cursor: '#ebdbb2',
  },
  nord: {
    label: 'Nord',
    bg: '#2e3440',
    fg: '#d8dee9',
    green: '#a3be8c',
    cyan: '#88c0d0',
    red: '#bf616a',
    yellow: '#ebcb8b',
    blue: '#81a1c1',
    magenta: '#b48ead',
    gray: '#4c566a',
    white: '#eceff4',
    cursor: '#d8dee9',
  },
  matrix: {
    label: 'Matrix',
    bg: '#001100',
    fg: '#00ff66',
    green: '#00ff66',
    cyan: '#33ff99',
    red: '#ff5555',
    yellow: '#aaff00',
    blue: '#00cc88',
    magenta: '#66ffaa',
    gray: '#007733',
    white: '#ccffcc',
    cursor: '#00ff66',
  },
  light: {
    label: 'One Light',
    bg: '#fafafa',
    fg: '#383a42',
    green: '#50a14f',
    cyan: '#0184bc',
    red: '#e45649',
    yellow: '#c18401',
    blue: '#4078f2',
    magenta: '#a626a4',
    gray: '#a0a1a7',
    white: '#000000',
    cursor: '#383a42',
  },
};

export const DEFAULT_THEME = 'default';

/** Theme color fields exposed as `SMASH_*` environment variables. */
export const COLOR_KEYS = [
  'bg',
  'fg',
  'green',
  'cyan',
  'red',
  'yellow',
  'blue',
  'magenta',
  'gray',
  'white',
  'cursor',
] as const;

type ColorKey = (typeof COLOR_KEYS)[number];

/** The env-var name for a color, e.g. `green` -> `SMASH_GREEN`. */
export function colorEnvName(key: ColorKey): string {
  return `SMASH_${key.toUpperCase()}`;
}

/** A theme's colors as environment variables: { SMASH_BG, SMASH_GREEN, ... }. */
export function themeEnv(theme: Theme): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of COLOR_KEYS) env[colorEnvName(key)] = theme[key];
  return env;
}

/** Apply any `SMASH_*` color overrides from `env` on top of a base theme. */
export function applyColorOverrides(base: Theme, env: Record<string, string>): Theme {
  const theme: Theme = { ...base };
  for (const key of COLOR_KEYS) {
    const value = env[colorEnvName(key)];
    if (value) theme[key] = value;
  }
  return theme;
}
