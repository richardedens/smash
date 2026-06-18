// vault — an encrypted, passphrase-protected secret store (persisted in
// localStorage). Keep API keys and other secrets here; the `ai` command reads
// them from the unlocked vault.

import {
  getSecret,
  isInitialized,
  isUnlocked,
  listSecrets,
  lock,
  removeSecret,
  setSecret,
  unlock,
} from '../../kernel/vault';
import { registerApp } from '../registry';
import type { AppContext, AppResult } from '../types';
import { fail, none, output, text } from '../types';

function usage(): AppResult {
  return output([
    { text: 'vault — encrypted secret store', kind: 'accent' },
    { text: '  vault unlock <passphrase>   unlock (creates it on first use)' },
    { text: '  vault lock' },
    { text: '  vault set <name> <value>' },
    { text: '  vault get <name>' },
    { text: '  vault list' },
    { text: '  vault rm <name>' },
    { text: '  vault status' },
  ]);
}

registerApp({
  name: 'vault',
  summary: 'Encrypted secret store (API keys, etc.)',
  usage: 'vault unlock|lock|set|get|list|rm|status',
  async run({ args }: AppContext): Promise<AppResult> {
    const sub = args[0];
    try {
      switch (sub) {
        case 'unlock': {
          if (!args[1]) return fail('usage: vault unlock <passphrase>');
          await unlock(args[1]);
          return output([{ text: 'vault unlocked', kind: 'accent' }]);
        }
        case 'lock':
          lock();
          return output([{ text: 'vault locked', kind: 'muted' }]);
        case 'status':
          return text(
            `vault: ${isInitialized() ? 'initialized' : 'not initialized'}, ${isUnlocked() ? 'unlocked' : 'locked'}`,
          );
        case 'set': {
          const name = args[1];
          const value = args.slice(2).join(' ');
          if (!name || !value) return fail('usage: vault set <name> <value>');
          await setSecret(name, value);
          return none();
        }
        case 'get': {
          const name = args[1];
          if (!name) return fail('usage: vault get <name>');
          if (!isUnlocked()) return fail('vault is locked — run: vault unlock <passphrase>');
          const value = getSecret(name);
          return value !== undefined ? text(value) : fail(`vault: no secret named '${name}'`);
        }
        case 'list': {
          const keys = listSecrets();
          return keys.length ? output(keys.map((k) => ({ text: k }))) : output([{ text: '(empty)', kind: 'muted' }]);
        }
        case 'rm': {
          const name = args[1];
          if (!name) return fail('usage: vault rm <name>');
          return (await removeSecret(name)) ? none() : fail(`vault: no secret named '${name}'`);
        }
        default:
          return usage();
      }
    } catch (err) {
      return fail(`vault: ${err instanceof Error ? err.message : 'error'}`);
    }
  },
});
