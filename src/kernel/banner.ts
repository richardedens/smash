import type { Line } from '../types';

const LOGO: string[] = [
  '   _____ __  __    _    ____  _   _ ',
  '  / ____|  \\/  |  / \\  / ___|| | | |',
  '  \\___ \\| |\\/| | / _ \\ \\___ \\| |_| |',
  '   ___) | |  | |/ ___ \\ ___) |  _  |',
  '  |____/|_|  |_/_/   \\_\\____/|_| |_|',
];

/** The boot banner shown when the terminal first loads. */
export function bannerLines(): Line[] {
  const out: Line[] = [{ text: '' }];
  for (const row of LOGO) out.push({ text: row, kind: 'accent' });
  out.push({ text: '' });
  out.push({ text: '  A Linux terminal that lives in your browser — v1.0', kind: 'muted' });
  out.push({
    segments: [
      { text: '  Type ', kind: 'muted' },
      { text: 'help', kind: 'accent' },
      { text: ' for commands, ', kind: 'muted' },
      { text: 'neofetch', kind: 'accent' },
      { text: ' for info, or ', kind: 'muted' },
      { text: 'nano notes.txt', kind: 'accent' },
      { text: ' to edit a file.', kind: 'muted' },
    ],
  });
  out.push({ text: '' });
  return out;
}
