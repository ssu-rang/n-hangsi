import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const UTC_TIMESTAMPS_MIGRATION = 'utc-timestamps-v1';
const ANONYMOUS_INTERACTIONS_MIGRATION = 'anonymous-interactions-v1';

export function createDatabase(filename: string = process.env.DATABASE_PATH || 'data/nhangsi.sqlite'): DatabaseSync {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      nickname TEXT NOT NULL CHECK(length(nickname) BETWEEN 1 AND 30),
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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE,
      author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      author_name TEXT NOT NULL DEFAULT '익명',
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS saved_poems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE,
      UNIQUE(user_id, poem_id)
    );
    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      visitor_id TEXT,
      poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE,
      score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
      UNIQUE(user_id, poem_id),
      UNIQUE(visitor_id, poem_id)
    );
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poem_id INTEGER REFERENCES poems(id) ON DELETE SET NULL,
      reported_poem_id INTEGER NOT NULL,
      reporter_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reporter_visitor_id TEXT,
      poem_word TEXT,
      poem_lines_text TEXT,
      poem_author_id INTEGER,
      poem_author_name TEXT,
      reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 500),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'resolved', 'rejected')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(poem_id, reporter_user_id)
    );
    CREATE TABLE IF NOT EXISTS comment_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id INTEGER REFERENCES comments(id) ON DELETE SET NULL,
      reported_comment_id INTEGER NOT NULL,
      poem_id INTEGER REFERENCES poems(id) ON DELETE SET NULL,
      reported_poem_id INTEGER NOT NULL,
      reporter_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reporter_visitor_id TEXT,
      comment_content TEXT NOT NULL,
      comment_author_id INTEGER,
      comment_author_name TEXT,
      reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 500),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'resolved', 'rejected')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(comment_id, reporter_user_id)
    );
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS page_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      view_date TEXT NOT NULL DEFAULT (date('now', '+9 hours')),
      viewed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reports_status_created
      ON reports(status, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_reports_poem ON reports(poem_id);
    CREATE INDEX IF NOT EXISTS idx_comment_reports_status_created
      ON comment_reports(status, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_comment_reports_comment ON comment_reports(comment_id);
    CREATE INDEX IF NOT EXISTS idx_poems_author ON poems(author_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_comments_poem ON comments(poem_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_poems(user_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_ratings_poem ON ratings(poem_id);
    CREATE INDEX IF NOT EXISTS idx_page_views_date
      ON page_views(view_date DESC);
    CREATE INDEX IF NOT EXISTS idx_page_views_path_date
      ON page_views(path, view_date DESC);
  `);
  ensureColumn(db, 'reports', 'poem_word', 'TEXT');
  ensureColumn(db, 'reports', 'poem_lines_text', 'TEXT');
  ensureColumn(db, 'reports', 'poem_author_id', 'INTEGER');
  ensureColumn(db, 'reports', 'poem_author_name', 'TEXT');
  ensureColumn(db, 'reports', 'reporter_visitor_id', 'TEXT');
  ensureColumn(db, 'comment_reports', 'reporter_visitor_id', 'TEXT');
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_poem_visitor
      ON reports(poem_id, reporter_visitor_id)
      WHERE reporter_visitor_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_reports_comment_visitor
      ON comment_reports(comment_id, reporter_visitor_id)
      WHERE reporter_visitor_id IS NOT NULL;
  `);
  migrateAnonymousInteractions(db);
  migrateTimestampsToUtc(db);
  return db;
}

function migrateAnonymousInteractions(database: DatabaseSync): void {
  const migrated = database.prepare('SELECT 1 FROM app_metadata WHERE key = ?')
    .get(ANONYMOUS_INTERACTIONS_MIGRATION);
  if (migrated) return;

  const commentAuthor = database.prepare('PRAGMA table_info(comments)').all()
    .find(column => (column as { name: string }).name === 'author_id') as { notnull: number } | undefined;
  const ratingColumns = database.prepare('PRAGMA table_info(ratings)').all() as unknown as Array<{
    name: string;
    notnull: number;
  }>;
  const ratingUser = ratingColumns.find(column => column.name === 'user_id');
  const hasVisitorId = ratingColumns.some(column => column.name === 'visitor_id');

  database.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE');
  try {
    if (commentAuthor?.notnull) {
      database.exec(`
        CREATE TABLE comments_anonymous (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE,
          author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          author_name TEXT NOT NULL DEFAULT '익명',
          content TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO comments_anonymous(id, poem_id, author_id, author_name, content, created_at)
          SELECT id, poem_id, author_id, author_name, content, created_at FROM comments;
        DROP TABLE comments;
        ALTER TABLE comments_anonymous RENAME TO comments;
      `);
    }

    if (ratingUser?.notnull || !hasVisitorId) {
      database.exec(`
        CREATE TABLE ratings_anonymous (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          visitor_id TEXT,
          poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE,
          score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
          UNIQUE(user_id, poem_id),
          UNIQUE(visitor_id, poem_id)
        );
        INSERT INTO ratings_anonymous(id, user_id, poem_id, score)
          SELECT id, user_id, poem_id, score FROM ratings;
        DROP TABLE ratings;
        ALTER TABLE ratings_anonymous RENAME TO ratings;
      `);
    }

    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_comments_poem ON comments(poem_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_ratings_poem ON ratings(poem_id);
    `);
    database.prepare('INSERT INTO app_metadata(key, value) VALUES (?, ?)')
      .run(ANONYMOUS_INTERACTIONS_MIGRATION, new Date().toISOString());
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  } finally {
    database.exec('PRAGMA foreign_keys = ON');
  }
}

function migrateTimestampsToUtc(database: DatabaseSync): void {
  const migrated = database.prepare('SELECT 1 FROM app_metadata WHERE key = ?')
    .get(UTC_TIMESTAMPS_MIGRATION);
  if (migrated) return;

  database.exec('BEGIN IMMEDIATE');
  try {
    for (const table of ['poems', 'comments', 'reports', 'comment_reports']) {
      database.exec(`UPDATE ${table} SET created_at = datetime(created_at, 'utc')`);
    }
    database.prepare('INSERT INTO app_metadata(key, value) VALUES (?, ?)')
      .run(UTC_TIMESTAMPS_MIGRATION, new Date().toISOString());
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function ensureColumn(database: DatabaseSync, table: string, column: string, definition: string): void {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>;
  if (!columns.some(candidate => candidate.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
