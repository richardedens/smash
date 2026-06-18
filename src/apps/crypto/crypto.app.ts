// encrypt / decrypt — AES-GCM text crypto via the Web Crypto API.

import { decryptText, encryptText } from '../../kernel/crypto';
import { registerApp } from '../registry';
import type { AppContext, AppResult } from '../types';
import { fail, output } from '../types';

registerApp({
  name: 'encrypt',
  summary: 'Encrypt text with a passphrase (AES-GCM)',
  usage: 'encrypt <passphrase> <text...>',
  async run({ args }: AppContext): Promise<AppResult> {
    const passphrase = args[0];
    const message = args.slice(1).join(' ');
    if (!passphrase || !message) return fail('usage: encrypt <passphrase> <text...>');
    return output([{ text: await encryptText(message, passphrase), kind: 'string' }]);
  },
});

registerApp({
  name: 'decrypt',
  summary: 'Decrypt a smash ciphertext with a passphrase',
  usage: 'decrypt <passphrase> <token>',
  async run({ args }: AppContext): Promise<AppResult> {
    const passphrase = args[0];
    const token = args[1];
    if (!passphrase || !token) return fail('usage: decrypt <passphrase> <token>');
    try {
      return output([{ text: await decryptText(token, passphrase) }]);
    } catch (err) {
      return fail(`decrypt: ${err instanceof Error ? err.message : 'failed'}`);
    }
  },
});
