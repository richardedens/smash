// persist — manage the encrypted, auto-saved session.

import { clearSession, hasSavedSession, saveNow } from '../../kernel/session';
import { registerApp } from '../registry';
import type { AppContext, AppResult } from '../types';
import { fail, output, text } from '../types';

registerApp({
  name: 'persist',
  summary: 'Manage the saved (encrypted) session',
  usage: 'persist [status|save|clear]',
  async run({ args }: AppContext): Promise<AppResult> {
    const sub = args[0] ?? 'status';
    switch (sub) {
      case 'status':
        return text(
          hasSavedSession()
            ? 'session: saved (AES-GCM encrypted in localStorage), auto-restores on reload'
            : 'session: nothing saved yet — it saves automatically as you work',
        );
      case 'save':
        await saveNow();
        return output([{ text: 'session saved', kind: 'muted' }]);
      case 'clear':
        clearSession();
        return output([{ text: 'saved session cleared — reload to start from a fresh disk', kind: 'muted' }]);
      default:
        return fail('usage: persist [status|save|clear]');
    }
  },
});
