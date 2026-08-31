import type { DatabaseSync } from 'node:sqlite';
import type { User } from '../shared/user.js';

const LINE_SEPARATOR = '\u001e';
const POEM_QUERY = `
  SELECT p.*,
    COALESCE(AVG(r.score), 0) AS rating,
    COUNT(DISTINCT r.id) AS rating_count,
    COUNT(DISTINCT c.id) AS comment_count
  FROM poems p
  LEFT JOIN ratings r ON r.poem_id = p.id
  LEFT JOIN comments c ON c.poem_id = p.id`;

export interface PoemData {
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

export interface CommentData {
  id: number;
  authorId: number;
  authorName: string;
  content: string;
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

export function listPoems(db: DatabaseSync, viewerId: number | null = null): PoemData[] {
  const rows = db.prepare(`${POEM_QUERY} GROUP BY p.id ORDER BY p.created_at DESC, p.id DESC`)
    .all() as unknown as PoemRow[];
  return rows.map(row => poemFromRow(db, row, viewerId));
}

export function listPopularPoems(db: DatabaseSync): PoemData[] {
  const rows = db.prepare(`
    ${POEM_QUERY}
    GROUP BY p.id
    ORDER BY rating DESC, rating_count DESC, comment_count DESC, p.created_at DESC, p.id DESC
  `).all() as unknown as PoemRow[];
  return rows.map(row => poemFromRow(db, row, null));
}

export function listTrendingPoems(db: DatabaseSync): PoemData[] {
  const rows = db.prepare(`
    ${POEM_QUERY}
    GROUP BY p.id
    ORDER BY
      CASE WHEN p.created_at >= datetime('now', '-1 day') THEN 0 ELSE 1 END,
      rating DESC,
      rating_count DESC,
      comment_count DESC,
      p.created_at DESC,
      p.id DESC
  `).all() as unknown as PoemRow[];
  return rows.map(row => poemFromRow(db, row, null));
}

export function listPoemsByAuthor(db: DatabaseSync, authorId: number): PoemData[] {
  const rows = db.prepare(`
    ${POEM_QUERY}
    WHERE p.author_id = ?
    GROUP BY p.id
    ORDER BY p.created_at DESC, p.id DESC
  `).all(authorId) as unknown as PoemRow[];
  return rows.map(row => poemFromRow(db, row, null));
}

export function listSavedPoems(db: DatabaseSync, userId: number): PoemData[] {
  const rows = db.prepare(`
    ${POEM_QUERY}
    JOIN saved_poems sp ON sp.poem_id = p.id
    WHERE sp.user_id = ?
    GROUP BY p.id
    ORDER BY sp.id DESC
  `).all(userId) as unknown as PoemRow[];
  return rows.map(row => poemFromRow(db, row, null, true));
}

export function getPoem(
  db: DatabaseSync,
  id: number,
  viewerId: number | null = null,
): PoemData | undefined {
  const row = db.prepare(`${POEM_QUERY} WHERE p.id = ? GROUP BY p.id`)
    .get(id) as unknown as PoemRow | undefined;
  return row ? poemFromRow(db, row, viewerId) : undefined;
}

export function createPoem(db: DatabaseSync, word: string, lines: string[], user: User | null): number {
  const result = db
    .prepare("INSERT INTO poems(word, lines_text, author_id, author_name, created_at) VALUES (?, ?, ?, ?, datetime('now'))")
    .run(word, lines.join(LINE_SEPARATOR), user?.id ?? null, user?.nickname ?? '익명');
  return Number(result.lastInsertRowid);
}

export function listComments(db: DatabaseSync, poemId: number): CommentData[] {
  const rows = db.prepare('SELECT * FROM comments WHERE poem_id = ? ORDER BY created_at, id')
    .all(poemId) as unknown as CommentRow[];
  return rows.map(row => ({
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name,
    content: row.content,
    createdAt: row.created_at,
  }));
}

export function addComment(db: DatabaseSync, poemId: number, content: string, user: User): void {
  db.prepare("INSERT INTO comments(poem_id, author_id, author_name, content, created_at) VALUES (?, ?, ?, ?, datetime('now'))")
    .run(poemId, user.id, user.nickname, content);
}

export function updateComment(
  db: DatabaseSync,
  poemId: number,
  commentId: number,
  authorId: number,
  content: string,
): boolean {
  const result = db.prepare(`
    UPDATE comments
    SET content = ?
    WHERE id = ? AND poem_id = ? AND author_id = ?
  `).run(content, commentId, poemId, authorId);
  return result.changes > 0;
}

export function savePoem(db: DatabaseSync, poemId: number, userId: number): void {
  db.prepare('INSERT OR IGNORE INTO saved_poems(user_id, poem_id) VALUES (?, ?)').run(userId, poemId);
}

export function unsavePoem(db: DatabaseSync, poemId: number, userId: number): void {
  db.prepare('DELETE FROM saved_poems WHERE user_id = ? AND poem_id = ?').run(userId, poemId);
}

export function ratePoem(db: DatabaseSync, poemId: number, userId: number, score: number): void {
  db.prepare(`
    INSERT INTO ratings(user_id, poem_id, score) VALUES (?, ?, ?)
    ON CONFLICT(user_id, poem_id) DO UPDATE SET score = excluded.score
  `).run(userId, poemId, score);
}

function poemFromRow(
  db: DatabaseSync,
  row: PoemRow,
  viewerId: number | null,
  savedOverride?: boolean,
): PoemData {
  const saved = savedOverride ?? (viewerId !== null && Boolean(
    db.prepare('SELECT 1 FROM saved_poems WHERE user_id = ? AND poem_id = ?').get(viewerId, row.id),
  ));
  return {
    id: row.id,
    word: row.word,
    lines: row.lines_text.split(LINE_SEPARATOR),
    authorId: row.author_id,
    authorName: row.author_name,
    rating: row.rating,
    ratingCount: row.rating_count,
    commentCount: row.comment_count,
    saved,
    createdAt: row.created_at,
  };
}
