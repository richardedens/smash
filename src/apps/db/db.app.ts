// db — a real SQLite shell, backed by sql.js (SQLite in WebAssembly).
//
//   db CREATE TABLE notes(id INTEGER PRIMARY KEY, body TEXT)
//   db INSERT INTO notes(body) VALUES ('hello')
//   db SELECT * FROM notes
//   db .tables   db .schema   db .reset

import { getDatabase, persistDatabase, resetDatabase } from '../../kernel/database';
import type { QueryExecResult } from '../../kernel/database';
import { registerApp } from '../registry';
import type { AppContext, AppResult } from '../types';
import { fail, output } from '../types';
import type { Line } from '../../types';

function padTo(value: string, width: number): string {
  return value + ' '.repeat(Math.max(0, width - value.length));
}

function formatResult(result: QueryExecResult): Line[] {
  const widths = result.columns.map((col, i) =>
    Math.max(col.length, ...result.values.map((row) => String(row[i] ?? '').length)),
  );
  const header: Line = {
    segments: result.columns.map((col, i) => ({ text: padTo(col, widths[i]) + '  ', kind: 'accent' as const })),
  };
  const separator: Line = { text: widths.map((w) => '─'.repeat(w)).join('  '), kind: 'muted' };
  const rows: Line[] = result.values.map((row) => ({
    text: row.map((value, i) => padTo(String(value ?? ''), widths[i])).join('  '),
  }));
  return [header, separator, ...rows];
}

const USAGE: Line[] = [
  { text: 'db — SQLite in the browser', kind: 'accent' },
  { text: '  db <SQL>      run a statement (SELECT renders a table)' },
  { text: '  db .tables    list tables' },
  { text: '  db .schema    show the schema' },
  { text: '  db .reset     wipe the database' },
];

registerApp({
  name: 'db',
  summary: 'SQLite database (real, in-browser via sql.js)',
  usage: 'db <SQL> | db .tables | db .schema | db .reset',
  async run({ args, raw }: AppContext): Promise<AppResult> {
    const sub = args[0];
    if (!sub) return output(USAGE);

    if (sub === '.reset') {
      resetDatabase();
      return output([{ text: 'database reset', kind: 'muted' }]);
    }

    const database = await getDatabase();

    if (sub === '.tables') {
      const res = database.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
      if (!res.length) return output([{ text: '(no tables)', kind: 'muted' }]);
      return output(res[0].values.map((r) => ({ text: String(r[0]) })));
    }

    if (sub === '.schema') {
      const res = database.exec('SELECT sql FROM sqlite_master WHERE sql NOT NULL ORDER BY name');
      if (!res.length) return output([{ text: '(empty)', kind: 'muted' }]);
      return output(res[0].values.map((r) => ({ text: String(r[0]), kind: 'string' })));
    }

    try {
      if (/^\s*(select|pragma|with|explain)/i.test(raw)) {
        const results = database.exec(raw);
        if (!results.length) return output([{ text: '(no rows)', kind: 'muted' }]);
        return output(results.flatMap(formatResult));
      }
      database.run(raw);
      persistDatabase();
      return output([{ text: `OK — ${database.getRowsModified()} row(s) changed`, kind: 'muted' }]);
    } catch (err) {
      return fail(`db: ${err instanceof Error ? err.message : 'SQL error'}`);
    }
  },
});
