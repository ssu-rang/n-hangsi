import type { DatabaseSync } from 'node:sqlite';

const LINE_SEPARATOR = '\u001e';
const POEM_VIEW_QUERY = `
  SELECT p.*,
    COALESCE(AVG(r.score), 0) AS rating,
    COUNT(DISTINCT r.id) AS rating_count,
    COUNT(DISTINCT c.id) AS comment_count
  FROM poems p
  LEFT JOIN ratings r ON r.poem_id = p.id
  LEFT JOIN comments c ON c.poem_id = p.id`;

export interface User {
  id: number;
  username: string;
  nickname: string;
  bio: string;
  password: string | null;
  provider: string;
  provider_user_id: string | null;
}

export interface NewUser {
  username: string;
  nickname: string;
  password?: string | null;
  provider?: string;
  providerUserId?: string | null;
}

export interface PoemView {
  id: number;
  word: string;
  lines: string[];
  authorId: number | null;
  authorName: string;
  rating: number;
  ratingCount: number;
  commentCount: number;
  saved: boolean;
  createdAt: string | null;
}

export interface CommentView {
  id: number;
  authorId: number;
  authorName: string;
  content: string;
  createdAt: string | null;
}

export type ReportStatus = 'pending' | 'resolved' | 'rejected';

export interface ReportView {
  id: number;
  poemId: number;
  poemExists: boolean;
  word: string | null;
  lines: string[];
  authorId: number | null;
  authorName: string | null;
  reason: string;
  status: ReportStatus;
  createdAt: string | null;
}

interface PoemRow {
  id: number;
  word: string;
  lines_text: string;
  author_id: number | null;
  author_name: string;
  created_at: string;
  rating: number;
  rating_count: number;
  comment_count: number;
}

interface CommentRow {
  id: number;
  author_id: number;
  author_name: string;
  content: string;
  created_at: string;
}

interface ProfileStatsRow {
  average_rating: number | null;
  rating_count: number;
}

interface PoemIdRow {
  poem_id: number;
}

interface PendingVerificationRow {
  email: string;
  nickname: string;
  password_hash: string;
}

interface ReportRow {
  id: number;
  poem_id: number | null;
  reported_poem_id: number;
  word: string | null;
  lines_text: string | null;
  author_id: number | null;
  author_name: string | null;
  reason: string;
  status: ReportStatus;
  created_at: string;
}

export function createRepository(database: DatabaseSync) {
  function findUserById(id: number): User | undefined {
    return database.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as User | undefined;
  }

  function findLocalUser(username: string): User | undefined {
    return database
      .prepare("SELECT * FROM users WHERE username = ? AND provider = 'local'")
      .get(username.toLowerCase()) as unknown as User | undefined;
  }

  function findProviderUser(provider: string, providerUserId: string): User | undefined {
    return database
      .prepare('SELECT * FROM users WHERE provider = ? AND provider_user_id = ?')
      .get(provider, providerUserId) as unknown as User | undefined;
  }

  function createUser(input: NewUser): User {
    const {
      username,
      nickname,
      password = null,
      provider = 'local',
      providerUserId = null,
    } = input;
    const result = database
      .prepare(`
        INSERT INTO users(username, nickname, password, provider, provider_user_id)
        VALUES (?, ?, ?, ?, ?)`)
      .run(username.toLowerCase(), nickname, password, provider, providerUserId);

    return findUserById(Number(result.lastInsertRowid))!;
  }

  function savePendingEmailVerification(
    email: string,
    nickname: string,
    passwordHash: string,
    tokenHash: string,
    expiresAt: number,
  ): void {
    database.prepare('DELETE FROM pending_email_verifications WHERE expires_at <= ?').run(Date.now());
    database.prepare(`
      INSERT INTO pending_email_verifications(
        email, nickname, password_hash, token_hash, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        nickname = excluded.nickname,
        password_hash = excluded.password_hash,
        token_hash = excluded.token_hash,
        expires_at = excluded.expires_at,
        created_at = excluded.created_at
    `).run(email.toLowerCase(), nickname, passwordHash, tokenHash, expiresAt, Date.now());
  }

  function consumePendingEmailVerification(tokenHash: string): PendingVerificationRow | undefined {
    const pending = database.prepare(`
      SELECT email, nickname, password_hash
      FROM pending_email_verifications
      WHERE token_hash = ? AND expires_at > ?
    `).get(tokenHash, Date.now()) as unknown as PendingVerificationRow | undefined;
    if (!pending) return undefined;
    database.prepare('DELETE FROM pending_email_verifications WHERE email = ?').run(pending.email);
    return pending;
  }

  function deletePendingEmailVerification(email: string): void {
    database.prepare('DELETE FROM pending_email_verifications WHERE email = ?').run(email.toLowerCase());
  }

  function listPoems(keyword = '', viewerId: number | null = null): PoemView[] {
    const rows = database
      .prepare(`${POEM_VIEW_QUERY} GROUP BY p.id ORDER BY p.created_at DESC, p.id DESC`)
      .all() as unknown as PoemRow[];
    const query = keyword.trim().toLocaleLowerCase();

    return rows
      .map(row => toPoemView(row, viewerId))
      .filter(poem => matchesKeyword(poem, query));
  }

  function getPoem(id: number, viewerId: number | null = null): PoemView | undefined {
    const row = database
      .prepare(`${POEM_VIEW_QUERY} WHERE p.id = ? GROUP BY p.id`)
      .get(id) as unknown as PoemRow | undefined;

    return row ? toPoemView(row, viewerId) : undefined;
  }

  function createPoem(word: string, lines: string[], user: User | null): number {
    const result = database
      .prepare('INSERT INTO poems(word, lines_text, author_id, author_name) VALUES (?, ?, ?, ?)')
      .run(word, lines.join(LINE_SEPARATOR), user?.id ?? null, user?.nickname ?? '익명');

    return Number(result.lastInsertRowid);
  }

  function comments(poemId: number): CommentView[] {
    const rows = database
      .prepare('SELECT * FROM comments WHERE poem_id = ? ORDER BY created_at, id')
      .all(poemId) as unknown as CommentRow[];

    return rows.map(row => ({
      id: row.id,
      authorId: row.author_id,
      authorName: row.author_name,
      content: row.content,
      createdAt: formatDateTime(row.created_at),
    }));
  }

  function addComment(poemId: number, content: string, user: User): void {
    database
      .prepare('INSERT INTO comments(poem_id, author_id, author_name, content) VALUES (?, ?, ?, ?)')
      .run(poemId, user.id, user.nickname, content);
  }

  function save(poemId: number, userId: number): void {
    database
      .prepare('INSERT OR IGNORE INTO saved_poems(user_id, poem_id) VALUES (?, ?)')
      .run(userId, poemId);
  }

  function unsave(poemId: number, userId: number): void {
    database.prepare('DELETE FROM saved_poems WHERE user_id = ? AND poem_id = ?').run(userId, poemId);
  }

  function rate(poemId: number, userId: number, score: number): void {
    database
      .prepare(`
        INSERT INTO ratings(user_id, poem_id, score) VALUES (?, ?, ?)
        ON CONFLICT(user_id, poem_id) DO UPDATE SET score = excluded.score`)
      .run(userId, poemId, score);
  }

  function createReport(poemId: number, reporterUserId: number, reason: string): 'created' | 'duplicate' {
    const result = database.prepare(`
      INSERT OR IGNORE INTO reports(
        poem_id, reported_poem_id, reporter_user_id,
        poem_word, poem_lines_text, poem_author_id, poem_author_name, reason
      )
      SELECT id, id, ?, word, lines_text, author_id, author_name, ?
      FROM poems WHERE id = ?
    `).run(reporterUserId, reason, poemId);
    return result.changes === 1 ? 'created' : 'duplicate';
  }

  function listReports(): ReportView[] {
    const rows = database.prepare(`
      SELECT r.*,
        COALESCE(p.word, r.poem_word) word,
        COALESCE(p.lines_text, r.poem_lines_text) lines_text,
        COALESCE(p.author_id, r.poem_author_id) author_id,
        COALESCE(p.author_name, r.poem_author_name) author_name
      FROM reports r
      LEFT JOIN poems p ON p.id = r.poem_id
      ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,
               r.created_at DESC, r.id DESC
    `).all() as unknown as ReportRow[];
    return rows.map(row => ({
      id: row.id,
      poemId: row.reported_poem_id,
      poemExists: row.poem_id !== null,
      word: row.word,
      lines: row.lines_text?.split(LINE_SEPARATOR) ?? [],
      authorId: row.author_id,
      authorName: row.author_name,
      reason: row.reason,
      status: row.status,
      createdAt: formatDateTime(row.created_at),
    }));
  }

  function updateReportStatus(reportId: number, status: ReportStatus): boolean {
    return database.prepare('UPDATE reports SET status = ? WHERE id = ?').run(status, reportId).changes === 1;
  }

  function deleteReportedPoem(reportId: number): 'deleted' | 'not-found' {
    const report = database.prepare('SELECT poem_id FROM reports WHERE id = ?')
      .get(reportId) as unknown as { poem_id: number | null } | undefined;
    if (!report?.poem_id) return 'not-found';

    database.exec('BEGIN IMMEDIATE');
    try {
      database.prepare("UPDATE reports SET status = 'resolved' WHERE poem_id = ?").run(report.poem_id);
      const result = database.prepare('DELETE FROM poems WHERE id = ?').run(report.poem_id);
      database.exec('COMMIT');
      return result.changes === 1 ? 'deleted' : 'not-found';
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  function saved(userId: number): PoemView[] {
    const savedPoems = database
      .prepare('SELECT poem_id FROM saved_poems WHERE user_id = ? ORDER BY id DESC')
      .all(userId) as unknown as PoemIdRow[];

    return savedPoems.map(({ poem_id }) => getPoem(poem_id, userId)!);
  }

  function profile(userId: number) {
    const user = findUserById(userId);
    if (!user) return null;

    const poemRows = database
      .prepare(`${POEM_VIEW_QUERY} WHERE p.author_id = ? GROUP BY p.id ORDER BY p.created_at DESC, p.id DESC`)
      .all(userId) as unknown as PoemRow[];
    const poems = poemRows.map(row => toPoemView(row));
    const stats = database
      .prepare(`
        SELECT AVG(r.score) average_rating, COUNT(r.id) rating_count
        FROM ratings r JOIN poems p ON p.id = r.poem_id
        WHERE p.author_id = ?`)
      .get(userId) as unknown as ProfileStatsRow;

    return {
      user: {
        id: user.id,
        nickname: user.nickname,
        bio: user.bio,
        poemCount: poems.length,
        averageRating: stats.average_rating === null ? null : roundRating(stats.average_rating),
        ratingCount: stats.rating_count,
      },
      poems,
    };
  }

  function toPoemView(row: PoemRow, viewerId: number | null = null): PoemView {
    const saved = viewerId !== null && Boolean(
      database.prepare('SELECT 1 FROM saved_poems WHERE user_id = ? AND poem_id = ?').get(viewerId, row.id),
    );

    return {
      id: row.id,
      word: row.word,
      lines: row.lines_text.split(LINE_SEPARATOR),
      authorId: row.author_id,
      authorName: row.author_name,
      rating: roundRating(row.rating),
      ratingCount: row.rating_count,
      commentCount: row.comment_count,
      saved,
      createdAt: formatDateTime(row.created_at),
    };
  }

  return {
    findUserById,
    findLocalUser,
    findProviderUser,
    createUser,
    savePendingEmailVerification,
    consumePendingEmailVerification,
    deletePendingEmailVerification,
    listPoems,
    getPoem,
    createPoem,
    comments,
    addComment,
    save,
    unsave,
    rate,
    createReport,
    listReports,
    updateReportStatus,
    deleteReportedPoem,
    saved,
    profile,
    close: () => database.close(),
  };
}

function matchesKeyword(poem: PoemView, query: string): boolean {
  if (!query) return true;
  return poem.word.toLocaleLowerCase().includes(query)
    || poem.lines.some(line => line.toLocaleLowerCase().includes(query));
}

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 16).replaceAll('-', '.').replace('T', ' ');
}

function roundRating(value: number): number {
  return Number(Number(value).toFixed(1));
}
