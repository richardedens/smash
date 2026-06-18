// User management + chroot — a small security system on top of the kernel
// `users` module. Passwords are PBKDF2-hashed; login/su authenticate against
// them. `chroot` jails the session to a subtree of the filesystem.

import { addUser, authenticate, listUsers, removeUser, setPassword, userExists } from '../../kernel/users';
import { registerApp } from '../registry';
import type { AppContext, AppResult } from '../types';
import { fail, none, output } from '../types';

registerApp({
  name: 'useradd',
  summary: 'Create a user account',
  usage: 'useradd <name> [password]',
  async run({ args, shell }: AppContext): Promise<AppResult> {
    const name = args[0];
    if (!name) return fail('usage: useradd <name> [password]');
    if (!/^[a-z_][a-z0-9_-]*$/.test(name)) return fail(`useradd: invalid user name '${name}'`);
    if (userExists(name)) return fail(`useradd: user '${name}' already exists`);
    const record = addUser(name);
    if (!record) return fail(`useradd: could not create '${name}'`);
    shell.fs.mkdir(record.home);
    if (args[1]) await setPassword(name, args[1]);
    return output([{ text: `created ${name} (uid ${record.uid}, home ${record.home})`, kind: 'muted' }]);
  },
});

registerApp({
  name: 'userdel',
  summary: 'Delete a user account',
  usage: 'userdel <name>',
  run({ args }: AppContext): AppResult {
    const name = args[0];
    if (!name) return fail('usage: userdel <name>');
    return removeUser(name) ? none() : fail(`userdel: cannot remove '${name}'`);
  },
});

registerApp({
  name: 'passwd',
  summary: 'Set a user password',
  usage: 'passwd [user] <newpassword>',
  async run({ args, shell }: AppContext): Promise<AppResult> {
    const user = args.length >= 2 ? args[0] : shell.user;
    const password = args.length >= 2 ? args[1] : args[0];
    if (!password) return fail('usage: passwd [user] <newpassword>');
    if (!userExists(user)) return fail(`passwd: user '${user}' does not exist`);
    await setPassword(user, password);
    return output([{ text: `password updated for ${user}`, kind: 'muted' }]);
  },
});

for (const cmd of ['login', 'su'] as const) {
  registerApp({
    name: cmd,
    summary: cmd === 'login' ? 'Log in as a user' : 'Switch user',
    usage: `${cmd} <user> [password]`,
    async run({ args, shell }: AppContext): Promise<AppResult> {
      const name = args[0];
      if (!name) return fail(`usage: ${cmd} <user> [password]`);
      if (!userExists(name)) return fail(`${cmd}: user '${name}' does not exist`);
      if (!(await authenticate(name, args[1] ?? ''))) return fail(`${cmd}: Authentication failure`);
      shell.login(name);
      return none();
    },
  });
}

registerApp({
  name: 'logout',
  summary: 'Log out (return to the smash user)',
  usage: 'logout',
  run({ shell }: AppContext): AppResult {
    shell.login('smash');
    return none();
  },
});

registerApp({
  name: 'users',
  summary: 'List user accounts',
  usage: 'users',
  run: () => output([{ text: listUsers().join('  ') }]),
});

registerApp({
  name: 'chroot',
  summary: 'Run with a changed root directory (jail)',
  usage: 'chroot <dir>',
  run({ args, shell }: AppContext): AppResult {
    const dir = args[0];
    if (!dir) return fail('usage: chroot <dir>');
    const path = shell.resolve(dir);
    if (!shell.fs.isDir(path)) return fail(`chroot: ${dir}: Not a directory`);
    shell.chroot(path);
    return output([{ text: `entered chroot jail — run 'login smash' to leave`, kind: 'muted' }]);
  },
});
