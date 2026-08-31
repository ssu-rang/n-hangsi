import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDatabase } from '../src/db/client.js';

test('legacy server-local timestamps are migrated to UTC exactly once', t => {
  const directory = mkdtempSync(join(tmpdir(), 'nhangsi-date-migration-'));
  const filename = join(directory, 'legacy.sqlite');
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const legacy = new DatabaseSync(filename);
  legacy.exec(`
    CREATE TABLE poems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL,
      lines_text TEXT NOT NULL,
      author_id INTEGER,
      author_name TEXT NOT NULL DEFAULT '익명',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    INSERT INTO poems(word, lines_text, created_at)
    VALUES ('기존', '기록', '2026-08-30 19:47:47');
  `);
  const expected = legacy.prepare("SELECT datetime('2026-08-30 19:47:47', 'utc') value")
    .get() as unknown as { value: string };
  legacy.close();

  const migrated = createDatabase(filename);
  const firstValue = migrated.prepare('SELECT created_at value FROM poems WHERE id = 1')
    .get() as unknown as { value: string };
  assert.equal(firstValue.value, expected.value);
  assert.ok(migrated.prepare("SELECT 1 FROM app_metadata WHERE key = 'utc-timestamps-v1'").get());
  migrated.close();

  const reopened = createDatabase(filename);
  const secondValue = reopened.prepare('SELECT created_at value FROM poems WHERE id = 1')
    .get() as unknown as { value: string };
  assert.equal(secondValue.value, firstValue.value);
  reopened.close();
});
