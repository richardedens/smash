const VERSION = 'MS-DOS Version 6.22  (Browser Edition)';

// Simulated file system
const fileSystem = {
  'C:\\': {
    type: 'dir',
    children: {
      'AUTOEXEC.BAT': { type: 'file', content: '@ECHO OFF\nPROMPT $P$G\nPATH C:\\DOS;C:\\WINDOWS' },
      'CONFIG.SYS': { type: 'file', content: 'DEVICE=C:\\DOS\\HIMEM.SYS\nDEVICE=C:\\DOS\\EMM386.EXE NOEMS\nBUFFERS=20\nFILES=40\nDOS=HIGH,UMB' },
      'DOS': {
        type: 'dir',
        children: {
          'COMMAND.COM': { type: 'file', content: '' },
          'EDIT.COM': { type: 'file', content: '' },
          'FORMAT.COM': { type: 'file', content: '' },
          'FDISK.EXE': { type: 'file', content: '' },
          'HIMEM.SYS': { type: 'file', content: '' },
          'EMM386.EXE': { type: 'file', content: '' },
        },
      },
      'WINDOWS': {
        type: 'dir',
        children: {
          'WIN.COM': { type: 'file', content: '' },
          'WIN.INI': { type: 'file', content: '[windows]\nload=\nrun=\n\n[desktop]\nPattern=(None)\nWallpaper=(None)' },
          'SYSTEM.INI': { type: 'file', content: '[boot]\nshell=Explorer.exe\n\n[386Enh]\nEMMExclude=A000-EFFF' },
        },
      },
      'GAMES': {
        type: 'dir',
        children: {
          'DOOM.EXE': { type: 'file', content: '' },
          'WOLF3D.EXE': { type: 'file', content: '' },
          'QBASIC': {
            type: 'dir',
            children: {
              'GORILLA.BAS': { type: 'file', content: '' },
              'NIBBLES.BAS': { type: 'file', content: '' },
              'MONEY.BAS': { type: 'file', content: '' },
            },
          },
        },
      },
    },
  },
};

function getNode(path) {
  const normalized = path.toUpperCase().replace(/\//g, '\\');
  if (normalized === 'C:\\' || normalized === 'C:') return fileSystem['C:\\'];
  const parts = normalized.replace(/^C:\\/, '').split('\\').filter(Boolean);
  let node = fileSystem['C:\\'];
  for (const part of parts) {
    if (!node.children || !node.children[part]) return null;
    node = node.children[part];
  }
  return node;
}

function resolvePath(current, input) {
  if (!input) return current;
  const upper = input.toUpperCase().trim();
  if (upper === '..') {
    const parts = current.replace(/\\$/, '').split('\\');
    if (parts.length <= 1) return 'C:\\';
    parts.pop();
    return parts.join('\\') + '\\';
  }
  if (upper === '\\' || upper === 'C:\\' || upper === 'C:') return 'C:\\';
  if (upper.startsWith('C:\\')) {
    return upper.endsWith('\\') ? upper : upper + '\\';
  }
  const base = current.endsWith('\\') ? current : current + '\\';
  return base + upper + '\\';
}

function formatFileSize(name, node) {
  if (node.type === 'dir') return null;
  // Simulate file sizes
  const sizes = {
    'COMMAND.COM': 54619,
    'AUTOEXEC.BAT': 128,
    'CONFIG.SYS': 256,
    'WIN.COM': 43612,
    'WIN.INI': 512,
    'SYSTEM.INI': 384,
    'DOOM.EXE': 709905,
    'WOLF3D.EXE': 523168,
    'GORILLA.BAS': 32321,
    'NIBBLES.BAS': 24691,
    'MONEY.BAS': 18432,
  };
  return sizes[name] || Math.floor(Math.random() * 50000) + 1024;
}


export function executeCommand(input, currentDir, setCurrentDir, setColor) {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toUpperCase();
  const args = parts.slice(1);
  const rawArgs = trimmed.slice(parts[0].length).trim();

  switch (cmd) {
    case 'HELP': {
      return [
        { text: '' },
        { text: 'For more information on a specific command, type HELP command-name' },
        { text: '' },
        { text: 'CLS         Clears the screen.' },
        { text: 'COLOR       Sets the default console foreground and background colors.' },
        { text: 'DATE        Displays or sets the date.' },
        { text: 'DIR         Displays a list of files and subdirectories in a directory.' },
        { text: 'ECHO        Displays messages, or turns command echoing on or off.' },
        { text: 'EXIT        Quits the COMMAND.COM program (command interpreter).' },
        { text: 'HELP        Provides Help information for Windows commands.' },
        { text: 'MD          Creates a directory.' },
        { text: 'MEM         Displays the amount of used and free memory.' },
        { text: 'PATH        Displays or sets a search path for executable files.' },
        { text: 'RD          Removes a directory.' },
        { text: 'REN         Renames a file or files.' },
        { text: 'TIME        Displays or sets the system time.' },
        { text: 'TYPE        Displays the contents of a text file.' },
        { text: 'VER         Displays the Windows version.' },
        { text: 'VOL         Displays a disk volume label and serial number.' },
        { text: '' },
      ];
    }

    case 'CLS':
      return [{ cls: true }];

    case 'VER':
      return [
        { text: '' },
        { text: VERSION },
        { text: '' },
      ];

    case 'ECHO': {
      if (!rawArgs) return [{ text: 'ECHO is on.' }];
      if (rawArgs.toUpperCase() === 'ON') return [{ text: 'ECHO is on.' }];
      if (rawArgs.toUpperCase() === 'OFF') return [{ text: 'ECHO is off.' }];
      return [{ text: rawArgs }];
    }

    case 'DATE': {
      const now = new Date();
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const d = String(now.getDate()).padStart(2, '0');
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const y = now.getFullYear();
      return [
        { text: `Current date is ${days[now.getDay()]} ${m}-${d}-${y}` },
        { text: 'Enter new date (mm-dd-yy): ' },
      ];
    }

    case 'TIME': {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      const cs = String(now.getMilliseconds()).slice(0, 2).padStart(2, '0');
      return [
        { text: `Current time is ${h}:${min}:${s}.${cs}` },
        { text: 'Enter new time: ' },
      ];
    }

    case 'VOL': {
      return [
        { text: '' },
        { text: ' Volume in drive C is SMASH_DISK' },
        { text: ' Volume Serial Number is 1337-B00T' },
        { text: '' },
      ];
    }

    case 'DIR': {
      const targetPath = args[0] ? resolvePath(currentDir, args[0]) : currentDir;
      const node = getNode(targetPath);
      if (!node || node.type !== 'dir') {
        return [{ text: `File Not Found`, error: true }];
      }

      const now = new Date();
      const d = String(now.getDate()).padStart(2, '0');
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const y = String(now.getFullYear()).slice(-2);
      const dateStr = `${m}-${d}-${y}`;
      const h = now.getHours() % 12 || 12;
      const min = String(now.getMinutes()).padStart(2, '0');
      const ampm = now.getHours() >= 12 ? 'p' : 'a';
      const timeStr = `${h}:${min}${ampm}`;

      const lines = [
        { text: '' },
        { text: ` Volume in drive C is SMASH_DISK` },
        { text: ` Volume Serial Number is 1337-B00T` },
        { text: '' },
        { text: ` Directory of ${targetPath}` },
        { text: '' },
      ];

      let fileCount = 0;
      let dirCount = 0;
      let totalBytes = 0;

      const entries = Object.entries(node.children || {});
      for (const [name, child] of entries) {
        if (child.type === 'dir') {
          dirCount++;
          lines.push({
            text: `${dateStr}  ${timeStr}    <DIR>          ${name}`,
          });
        } else {
          const size = formatFileSize(name, child);
          totalBytes += size;
          fileCount++;
          lines.push({
            text: `${dateStr}  ${timeStr}    ${String(size).padStart(14)} ${name}`,
          });
        }
      }

      lines.push({ text: '' });
      lines.push({
        text: `       ${fileCount} file(s)    ${String(totalBytes).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} bytes`,
      });
      lines.push({
        text: `       ${dirCount} dir(s)  2,096,640 bytes free`,
      });
      lines.push({ text: '' });

      return lines;
    }

    case 'CD':
    case 'CHDIR': {
      if (!rawArgs) return [{ text: currentDir }];
      const newPath = resolvePath(currentDir, rawArgs);
      const node = getNode(newPath);
      if (!node || node.type !== 'dir') {
        return [{ text: `Invalid directory`, error: true }];
      }
      setCurrentDir(newPath);
      return [];
    }

    case 'TYPE': {
      if (!rawArgs) return [{ text: 'Required parameter missing', error: true }];
      const dirNode = getNode(currentDir);
      const fileName = rawArgs.toUpperCase();
      const fileNode = dirNode?.children?.[fileName];
      if (!fileNode || fileNode.type !== 'file') {
        return [{ text: `File not found - ${rawArgs.toUpperCase()}`, error: true }];
      }
      if (!fileNode.content) {
        return [{ text: `${rawArgs.toUpperCase()} is not a text file or is empty`, error: true }];
      }
      return fileNode.content.split('\n').map((line) => ({ text: line }));
    }

    case 'PATH':
      return [{ text: 'PATH=C:\\DOS;C:\\WINDOWS' }];

    case 'MEM': {
      return [
        { text: '' },
        { text: 'Memory Type         Total    =    Used    +    Free' },
        { text: '----------------  --------   --------   --------' },
        { text: 'Conventional         640K        48K        592K' },
        { text: 'Upper                 96K        35K         61K' },
        { text: 'Reserved             384K       384K          0K' },
        { text: 'Extended (XMS)    15,360K     1,024K    14,336K' },
        { text: '----------------  --------   --------   --------' },
        { text: 'Total memory      16,480K     1,491K    14,989K' },
        { text: '' },
        { text: 'Total under 1 MB     736K        83K        653K' },
        { text: '' },
        { text: 'Largest executable program size      592K (606,208 bytes)' },
        { text: 'Largest free upper memory block       61K  (62,464 bytes)' },
        { text: 'MS-DOS is resident in the high memory area.' },
        { text: '' },
      ];
    }

    case 'COLOR': {
      const colorMap = {
        '07': { bg: '#000000', fg: '#AAAAAA' },
        '0A': { bg: '#000000', fg: '#00AA00' },
        '0B': { bg: '#000000', fg: '#00AAAA' },
        '0C': { bg: '#000000', fg: '#AA0000' },
        '0E': { bg: '#000000', fg: '#AAAA00' },
        '0F': { bg: '#000000', fg: '#FFFFFF' },
        '1F': { bg: '#0000AA', fg: '#FFFFFF' },
        '2F': { bg: '#00AA00', fg: '#FFFFFF' },
        '4F': { bg: '#AA0000', fg: '#FFFFFF' },
        '70': { bg: '#AAAAAA', fg: '#000000' },
      };
      const attr = (args[0] || '').toUpperCase();
      if (!attr) {
        return [
          { text: 'Sets the default console foreground and background colors.' },
          { text: '' },
          { text: 'COLOR [attr]' },
          { text: '' },
          { text: '  attr     Specifies color attribute of console output' },
          { text: '' },
          { text: 'Color attributes are specified by TWO hex digits:' },
          { text: '  0 = Black    8 = Gray' },
          { text: '  1 = Blue     9 = Light Blue' },
          { text: '  2 = Green    A = Light Green' },
          { text: '  3 = Aqua     B = Light Aqua' },
          { text: '  4 = Red      C = Light Red' },
          { text: '  5 = Purple   D = Light Purple' },
          { text: '  6 = Yellow   E = Light Yellow' },
          { text: '  7 = White    F = Bright White' },
          { text: '' },
          { text: 'Example: COLOR 0A  (black background, green text)' },
          { text: '' },
        ];
      }
      if (colorMap[attr]) {
        setColor(colorMap[attr]);
        return [];
      }
      return [{ text: `Invalid color attribute: ${attr}`, error: true }];
    }

    case 'MD':
    case 'MKDIR':
      if (!rawArgs) return [{ text: 'The syntax of the command is incorrect.', error: true }];
      return [{ text: `Directory created (simulated): ${rawArgs.toUpperCase()}` }];

    case 'RD':
    case 'RMDIR':
      if (!rawArgs) return [{ text: 'The syntax of the command is incorrect.', error: true }];
      return [{ text: `Directory removed (simulated): ${rawArgs.toUpperCase()}` }];

    case 'REN':
    case 'RENAME':
      if (args.length < 2) return [{ text: 'The syntax of the command is incorrect.', error: true }];
      return [{ text: `File renamed (simulated): ${args[0].toUpperCase()} -> ${args[1].toUpperCase()}` }];

    case 'EXIT':
      return [
        { text: '' },
        { text: 'It is now safe to turn off your computer.' },
        { text: '' },
      ];

    case 'FORMAT':
      return [
        { text: '' },
        { text: 'WARNING: ALL DATA ON NON-REMOVABLE DISK' },
        { text: 'DRIVE C: WILL BE LOST!' },
        { text: 'Proceed with Format (Y/N)?N' },
        { text: '' },
        { text: 'Format aborted.' },
        { text: '' },
      ];

    case 'DELTREE':
      return [
        { text: '' },
        { text: 'Delete directory "' + (rawArgs || '') + '" and all its subdirectories? [yn]n' },
        { text: '' },
      ];

    default:
      return [
        { text: `Bad command or file name`, error: true },
      ];
  }
}

export const BOOT_LINES = [
  'Starting MS-DOS...',
  '',
  'HIMEM is testing extended memory...',
  'EMM386 not installed - no EMS memory available.',
  '',
  'MS-DOS Version 6.22',
  '',
  'C:\\AUTOEXEC.BAT is processing...',
  '',
];

export const WELCOME_LINES = [
  '',
  '    ███████╗███╗   ███╗ █████╗ ███████╗██╗  ██╗',
  '    ██╔════╝████╗ ████║██╔══██╗██╔════╝██║  ██║',
  '    ███████╗██╔████╔██║███████║███████╗███████║',
  '    ╚════██║██║╚██╔╝██║██╔══██║╚════██║██╔══██║',
  '    ███████║██║ ╚═╝ ██║██║  ██║███████║██║  ██║',
  '    ╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝',
  '',
  '    The Ultimate Browser Terminal',
  `    ${VERSION}`,
  '',
  '    Type HELP for a list of available commands.',
  '',
];
