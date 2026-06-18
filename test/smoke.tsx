// Headless smoke test: validates the app platform logic (no DOM needed) and
// that the Terminal mounts + boots without throwing. Built via Vite SSR and
// run in Node with happy-dom (see /tmp/build-smoke.mjs).

import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();

const log = console.error.bind(console); // stderr, bypasses our console.error capture

let pass = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass += 1;
  } else {
    failed += 1;
    log(`FAIL: ${name} ${detail}`);
  }
}

async function logicTests() {
  const { fs, defaultEnv, HOME, HOST } = await import('../src/kernel/filesystem');
  const { THEMES, themeEnv } = await import('../src/kernel/themes');
  const { homeOf } = await import('../src/kernel/users');
  const { runCommand } = await import('../src/apps/runtime');

  let cwd = HOME;
  let user = 'smash';
  let chrootRoot = '/';
  const overrides: Record<string, string> = {};
  const resolve = (p: string): string => {
    let path = p || '.';
    const home = homeOf(user);
    if (path === '~') path = home;
    else if (path.startsWith('~/')) path = home + path.slice(1);
    const real = path.startsWith('/')
      ? fs.resolve('/', (chrootRoot === '/' ? '' : chrootRoot) + path)
      : fs.resolve(cwd, path);
    if (chrootRoot !== '/' && real !== chrootRoot && !real.startsWith(chrootRoot + '/')) return chrootRoot;
    return real;
  };
  const shell = {
    get cwd() {
      return cwd;
    },
    get user() {
      return user;
    },
    host: HOST,
    get chrootRoot() {
      return chrootRoot;
    },
    get env() {
      return { ...defaultEnv(cwd), USER: user, HOME: homeOf(user), ...themeEnv(THEMES.default), ...overrides };
    },
    history: [] as string[],
    theme: THEMES.default,
    themeName: 'default',
    fs,
    resolve,
    cd: (p: string) => {
      const abs = resolve(p);
      if (!fs.isDir(abs)) return false;
      cwd = abs;
      return true;
    },
    setTheme: () => true,
    setEnv: (name: string, value: string) => {
      overrides[name] = value;
    },
    unsetEnv: (name: string) => {
      delete overrides[name];
    },
    login: (name: string) => {
      user = name;
      chrootRoot = '/';
      cwd = homeOf(name);
    },
    chroot: (dir: string) => {
      chrootRoot = dir;
      cwd = dir;
    },
  };

  type Res = { kind: string; ok: boolean; lines?: { text?: string; segments?: { text: string }[] }[] };
  const toResult = (res: Res) => {
    const text =
      res.kind === 'output' && res.lines
        ? res.lines.map((l) => (l.segments ? l.segments.map((s) => s.text).join('') : l.text ?? '')).join('\n')
        : res.kind;
    return { text, ok: res.kind === 'output' ? res.ok : true, kind: res.kind };
  };
  const run = (cmd: string) => toResult(runCommand(cmd, shell) as Res);
  const arun = async (cmd: string) => toResult((await runCommand(cmd, shell)) as Res);

  check('ls home', run('ls').text.includes('README.md'), run('ls').text);
  check('help lists nano+hello', run('help').text.includes('nano') && run('help').text.includes('hello'));
  check('hello world', run('hello world').text.includes('Hello, world!'));
  check('ls /bin shows nano', run('ls /bin').text.includes('nano'));
  check('pwd', run('pwd').text === HOME, run('pwd').text);

  cwd = HOME;
  run('cd /');
  check('cd changes dir', run('pwd').text === '/', run('pwd').text);
  cwd = HOME;

  const rmNano = run('rm /bin/nano');
  check('cannot rm /bin/nano', rmNano.ok === false && rmNano.text.includes('Operation not permitted'), rmNano.text);

  fs.write(`${HOME}/prog.js`, "smash.print('hi from js', 2 + 2)");
  check('chmod +x prog.js', run('chmod +x prog.js').kind === 'none');
  check('run ./prog.js', run('./prog.js').text.includes('hi from js 4'), run('./prog.js').text);

  fs.write(`${HOME}/build.sh`, '# a comment\necho scripted\nwhoami');
  run('chmod +x build.sh');
  const sh = await arun('./build.sh');
  check('run ./build.sh', sh.text.includes('scripted') && sh.text.includes('smash'), sh.text);

  check('command not found', run('definitelynotacommand').text.includes('command not found'));

  // Theme colors as environment variables.
  check('env exposes SMASH_GREEN', run('env').text.includes(`SMASH_GREEN=${THEMES.default.green}`));
  run('export SMASH_GREEN=#abcdef');
  check('export sets color var', run('echo $SMASH_GREEN').text === '#abcdef', run('echo $SMASH_GREEN').text);
  run('unset SMASH_GREEN');
  check('unset reverts color var', run('echo $SMASH_GREEN').text === THEMES.default.green, run('echo $SMASH_GREEN').text);

  // ~/.smashrc sourcing: aliases, PATH, and running a binary from PATH.
  cwd = HOME;
  const srcRes = await runCommand('source ~/.smashrc', shell);
  check('source rc ok', srcRes.kind === 'output' && srcRes.ok, JSON.stringify(srcRes).slice(0, 120));
  check('alias ll works', run('ll').text.includes('README.md'), run('ll').text);
  check('rc extended PATH', run('echo $PATH').text.includes('/home/smash/bin'), run('echo $PATH').text);
  fs.write(`${HOME}/bin/tool.js`, "smash.print('on the path')");
  run('chmod +x bin/tool.js');
  check('runs binary from PATH', run('tool.js').text.includes('on the path'), run('tool.js').text);

  // Crypto + vault.
  const tok = await arun('encrypt hunter2 secret message');
  check('encrypt makes a token', tok.text.startsWith('smash1:'), tok.text.slice(0, 24));
  const dec = await arun(`decrypt hunter2 ${tok.text}`);
  check('decrypt roundtrips', dec.text === 'secret message', dec.text);
  const decBad = await arun(`decrypt wrongpass ${tok.text}`);
  check('decrypt rejects wrong pass', !decBad.ok);
  await arun('vault unlock mypass');
  await arun('vault set API_KEY sk-test-123');
  const vg = await arun('vault get API_KEY');
  check('vault get returns secret', vg.text === 'sk-test-123', vg.text);
  check('vault list shows key', (await arun('vault list')).text.includes('API_KEY'));

  // ai without a key gives a helpful error (offline-safe).
  const aiNoKey = await arun('ai hello there');
  check('ai needs an API key', !aiNoKey.ok && aiNoKey.text.includes('ANTHROPIC_API_KEY'), aiNoKey.text);

  // Multi-user + auth.
  user = 'smash';
  cwd = HOME;
  chrootRoot = '/';
  await arun('useradd alice wonderland');
  check('useradd lists alice', run('users').text.includes('alice'), run('users').text);
  const badLogin = await arun('login alice wrongpw');
  check('login rejects wrong password', !badLogin.ok, badLogin.text);
  await arun('login alice wonderland');
  check('login switches user', run('whoami').text === 'alice', run('whoami').text);
  check('home is per-user', run('pwd').text === '/home/alice', run('pwd').text);
  await arun('logout');
  check('logout returns to smash', run('whoami').text === 'smash');

  // chroot jail.
  cwd = HOME;
  run('mkdir jail');
  await arun('chroot jail');
  check('chroot pwd is /', run('pwd').text === '/', run('pwd').text);
  run('cd ..');
  check('chroot cannot escape', run('pwd').text === '/', run('pwd').text);
  await arun('login smash');
  check('login leaves the jail', run('pwd').text === '/home/smash', run('pwd').text);

  // Python apps registered (offline-safe paths — no Pyodide download).
  cwd = HOME;
  check('help lists pysmash + python', run('help').text.includes('pysmash') && run('help').text.includes('python'));
  check('python shows usage', (await arun('python')).text.includes('usage'));
  check('pip needs install', !(await arun('pip nonsense')).ok);
}

async function renderTest() {
  const errors: string[] = [];
  const origErr = console.error;
  console.error = (...a: unknown[]) => {
    errors.push(a.map((x) => (x instanceof Error ? x.stack ?? x.message : String(x))).join(' '));
  };

  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { default: Terminal } = await import('../src/components/Terminal');

  const container = document.createElement('div');
  document.body.appendChild(container);
  createRoot(container).render(React.createElement(React.StrictMode, null, React.createElement(Terminal)));
  await new Promise((r) => setTimeout(r, 1800));

  console.error = origErr;
  check('renders content', (container.textContent || '').length > 50);
  check('has prompt form', !!container.querySelector('form'));
  check('has cursor', !!container.querySelector('.term-cursor'));
  check('no render errors', errors.length === 0, errors.slice(0, 3).join(' | '));
}

async function main() {
  await logicTests();
  await renderTest();
  log(`\n=== ${pass} passed, ${failed} failed ===`);
  process.exit(failed ? 1 : 0);
}

main();
