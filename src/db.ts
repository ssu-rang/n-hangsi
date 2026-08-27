import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function createDatabase(filename: string = process.env.DATABASE_PATH || 'data/nhangsi.sqlite'): DatabaseSync {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      nickname TEXT NOT NULL CHECK(length(nickname) BETWEEN 1 AND 30),
      bio TEXT NOT NULL DEFAULT '',
      password TEXT,
      provider TEXT NOT NULL DEFAULT 'local',
      provider_user_id TEXT,
      UNIQUE(provider, provider_user_id),
      UNIQUE(username, provider)
    );
    CREATE TABLE IF NOT EXISTS poems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL,
      lines_text TEXT NOT NULL,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      author_name TEXT NOT NULL DEFAULT '익명',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author_name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS saved_poems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE,
      UNIQUE(user_id, poem_id)
    );
    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE,
      score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
      UNIQUE(user_id, poem_id)
    );
    CREATE INDEX IF NOT EXISTS idx_poems_author ON poems(author_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_comments_poem ON comments(poem_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_poems(user_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_ratings_poem ON ratings(poem_id);
  `);
  return db;
}
