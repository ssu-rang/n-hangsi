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

test('member-only comments and ratings are migrated for anonymous interactions', t => {
  const directory = mkdtempSync(join(tmpdir(), 'nhangsi-anonymous-migration-'));
  const filename = join(directory, 'legacy.sqlite');
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const legacy = new DatabaseSync(filename);
  legacy.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id INTEGER PRIMARY KEY, nickname TEXT NOT NULL);
    CREATE TABLE poems (
      id INTEGER PRIMARY KEY,
      word TEXT NOT NULL,
      lines_text TEXT NOT NULL,
      author_id INTEGER,
      author_name TEXT NOT NULL DEFAULT '익명',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE comments (
      id INTEGER PRIMARY KEY,
      poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author_name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE ratings (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE,
      score INTEGER NOT NULL,
      UNIQUE(user_id, poem_id)
    );
    CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO app_metadata(key, value) VALUES ('utc-timestamps-v1', 'already-migrated');
  `);
  legacy.close();

  const migrated = createDatabase(filename);
  const commentAuthor = migrated.prepare('PRAGMA table_info(comments)').all()
    .find(column => (column as { name: string }).name === 'author_id') as { notnull: number };
  const ratingColumns = migrated.prepare('PRAGMA table_info(ratings)').all() as unknown as Array<{
    name: string;
    notnull: number;
  }>;
  assert.equal(commentAuthor.notnull, 0);
  assert.equal(ratingColumns.find(column => column.name === 'user_id')?.notnull, 0);
  assert.ok(ratingColumns.some(column => column.name === 'visitor_id'));
  const reportColumns = migrated.prepare('PRAGMA table_info(reports)').all() as unknown as Array<{ name: string }>;
  const commentReportColumns = migrated.prepare('PRAGMA table_info(comment_reports)').all() as unknown as Array<{
    name: string;
  }>;
  assert.ok(reportColumns.some(column => column.name === 'reporter_visitor_id'));
  assert.ok(commentReportColumns.some(column => column.name === 'reporter_visitor_id'));
  assert.ok(migrated.prepare("SELECT 1 FROM app_metadata WHERE key = 'anonymous-interactions-v1'").get());
  migrated.close();
});

test('referrer migration preserves existing page views and is safe to reopen', t => {
  const directory = mkdtempSync(join(tmpdir(), 'nhangsi-referrer-migration-'));
  const filename = join(directory, 'legacy.sqlite');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const legacy = new DatabaseSync(filename);
  legacy.exec(`
    CREATE TABLE page_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      user_id INTEGER,
      view_date TEXT NOT NULL,
      viewed_at TEXT NOT NULL
    );
    INSERT INTO page_views(path, visitor_id, view_date, viewed_at)
    VALUES ('/poems/1', 'existing-visitor', '2026-09-01', '2026-09-01 01:00:00');
  `);
  legacy.close();
  for (let i = 0; i < 2; i++) {
    const migrated = createDatabase(filename);
    try {
      const rows = migrated.prepare('SELECT * FROM page_views').all();
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.path, '/poems/1');
      assert.equal(rows[0]?.visitor_id, 'existing-visitor');
      assert.equal(rows[0]?.viewed_at, '2026-09-01 01:00:00');
      assert.equal(rows[0]?.referrer_source, null);
    } finally { migrated.close(); }
  }
});
