// ai — call a hosted LLM (Anthropic / OpenAI / Mistral) from the browser.
//
// API keys are read from the unlocked vault first, then the environment:
//   vault unlock <pass> && vault set ANTHROPIC_API_KEY sk-ant-...
//   (or)  export ANTHROPIC_API_KEY=sk-ant-...
//
// Usage: ai [--provider=anthropic|openai|mistral] [--model=ID] <prompt...>

import { getSecret } from '../../kernel/vault';
import { registerApp } from '../registry';
import type { AppContext, AppResult, ShellApi } from '../types';
import { fail, output } from '../types';

interface Provider {
  keyName: string;
  defaultModel: string;
  url: string;
  request(key: string, model: string, prompt: string): { headers: Record<string, string>; body: unknown };
  extract(json: unknown): string;
}

const PROVIDERS: Record<string, Provider> = {
  anthropic: {
    keyName: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-opus-4-8',
    url: 'https://api.anthropic.com/v1/messages',
    request: (key, model, prompt) => ({
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        // Required for direct calls from a browser (CORS).
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: { model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] },
    }),
    extract: (json) => {
      const content = (json as { content?: { type: string; text?: string }[] }).content ?? [];
      return content
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('');
    },
  },
  openai: {
    keyName: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    url: 'https://api.openai.com/v1/chat/completions',
    request: (key, model, prompt) => ({
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: { model, messages: [{ role: 'user', content: prompt }] },
    }),
    extract: (json) => extractChatCompletion(json),
  },
  mistral: {
    keyName: 'MISTRAL_API_KEY',
    defaultModel: 'mistral-large-latest',
    url: 'https://api.mistral.ai/v1/chat/completions',
    request: (key, model, prompt) => ({
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: { model, messages: [{ role: 'user', content: prompt }] },
    }),
    extract: (json) => extractChatCompletion(json),
  },
};

function extractChatCompletion(json: unknown): string {
  const choices = (json as { choices?: { message?: { content?: string } }[] }).choices ?? [];
  return choices[0]?.message?.content ?? '';
}

function lookupKey(name: string, shell: ShellApi): string | undefined {
  return getSecret(name) ?? shell.env[name];
}

registerApp({
  name: 'ai',
  summary: 'Ask an LLM (Anthropic/OpenAI/Mistral)',
  usage: 'ai [--provider=anthropic|openai|mistral] [--model=ID] <prompt>',
  async run({ args, shell }: AppContext): Promise<AppResult> {
    let providerName = 'anthropic';
    let model = '';
    const promptParts: string[] = [];
    for (const a of args) {
      if (a.startsWith('--provider=')) providerName = a.slice('--provider='.length);
      else if (a.startsWith('--model=')) model = a.slice('--model='.length);
      else promptParts.push(a);
    }

    const provider = PROVIDERS[providerName];
    if (!provider) return fail(`ai: unknown provider '${providerName}' (anthropic, openai, mistral)`);

    const prompt = promptParts.join(' ').trim();
    if (!prompt) return fail('usage: ai [--provider=…] [--model=…] <prompt>');

    const key = lookupKey(provider.keyName, shell);
    if (!key) {
      return fail(
        `ai: no API key. Set ${provider.keyName} via 'vault unlock <pass> && vault set ${provider.keyName} <key>' or 'export ${provider.keyName}=<key>'`,
      );
    }

    const { headers, body } = provider.request(key, model || provider.defaultModel, prompt);
    try {
      const res = await fetch(provider.url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        return fail(`ai: ${providerName} ${res.status} ${res.statusText} — ${detail}`);
      }
      const text = provider.extract(await res.json());
      const lines = [
        { text: `${providerName}/${model || provider.defaultModel}`, kind: 'muted' as const },
        ...text.split('\n').map((l) => ({ text: l })),
      ];
      return output(lines);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'request failed';
      return fail(`ai: ${message} (a browser CORS block or network error)`);
    }
  },
});
