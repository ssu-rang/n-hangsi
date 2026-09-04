import type { DatabaseSync } from 'node:sqlite';

const LINE_SEPARATOR = '\u001e';
export type ReportStatus = 'resolved' | 'rejected';

export type ReportData = {
  id: number;
  poemId: number;
  poemExists: boolean;
  word: string | null;
  lines: string[];
  authorId: number | null;
  authorName: string | null;
  reason: string;
  status: 'pending' | ReportStatus;
  createdAt: string;
};

export type CommentReportData = {
  id: number;
  commentId: number;
  commentExists: boolean;
  poemId: number;
  poemExists: boolean;
  content: string;
  authorId: number | null;
  authorName: string | null;
  reason: string;
  status: 'pending' | ReportStatus;
  createdAt: string;
};

type ReportRow = {
  id: number;
  poem_id: number | null;
  reported_poem_id: number;
  word: string | null;
  lines_text: string | null;
  author_id: number | null;
  author_name: string | null;
  reason: string;
  status: 'pending' | ReportStatus;
  created_at: string;
};

export function createReport(
  db: DatabaseSync,
  poemId: number,
  reporterId: number | null,
  visitorId: string | null,
  reason: string,
): boolean {
  const result = db.prepare(`
    INSERT OR IGNORE INTO reports(
      poem_id, reported_poem_id, reporter_user_id, reporter_visitor_id,
      poem_word, poem_lines_text, poem_author_id, poem_author_name, reason, created_at
    )
    SELECT id, id, ?, ?, word, lines_text, author_id, author_name, ?, datetime('now')
    FROM poems WHERE id = ?
  `).run(reporterId, visitorId, reason, poemId);
  return result.changes === 1;
}

export function createCommentReport(
  db: DatabaseSync,
  poemId: number,
  commentId: number,
  reporterId: number | null,
  visitorId: string | null,
  reason: string,
): boolean {
  const result = db.prepare(`
    INSERT OR IGNORE INTO comment_reports(
      comment_id, reported_comment_id, poem_id, reported_poem_id, reporter_user_id, reporter_visitor_id,
      comment_content, comment_author_id, comment_author_name, reason, created_at
    )
    SELECT c.id, c.id, c.poem_id, c.poem_id, ?, ?, c.content, c.author_id, c.author_name, ?, datetime('now')
    FROM comments c WHERE c.id = ? AND c.poem_id = ?
  `).run(reporterId, visitorId, reason, commentId, poemId);
  return result.changes === 1;
}

export function commentExists(db: DatabaseSync, poemId: number, commentId: number): boolean {
  return Boolean(db.prepare('SELECT 1 FROM comments WHERE id = ? AND poem_id = ?').get(commentId, poemId));
}

export function listCommentReports(db: DatabaseSync): CommentReportData[] {
  return db.prepare(`
    SELECT cr.id, cr.reported_comment_id commentId, cr.reported_poem_id poemId,
      cr.comment_content content, cr.comment_author_id authorId,
      cr.comment_author_name authorName, cr.reason, cr.status, cr.created_at createdAt,
      cr.comment_id IS NOT NULL commentExists, cr.poem_id IS NOT NULL poemExists
    FROM comment_reports cr
    ORDER BY CASE cr.status WHEN 'pending' THEN 0 ELSE 1 END,
             cr.created_at DESC, cr.id DESC
  `).all() as unknown as CommentReportData[];
}

export function listReports(db: DatabaseSync): ReportData[] {
  const rows = db.prepare(`
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
    createdAt: row.created_at,
  }));
}

export function updateReportStatus(db: DatabaseSync, reportId: number, status: ReportStatus): boolean {
  return db.prepare('UPDATE reports SET status = ? WHERE id = ?').run(status, reportId).changes === 1;
}

export function updateCommentReportStatus(db: DatabaseSync, reportId: number, status: ReportStatus): boolean {
  return db.prepare('UPDATE comment_reports SET status = ? WHERE id = ?').run(status, reportId).changes === 1;
}

export function deleteReportedComment(db: DatabaseSync, reportId: number): boolean {
  const report = db.prepare('SELECT comment_id FROM comment_reports WHERE id = ?')
    .get(reportId) as unknown as { comment_id: number | null } | undefined;
  if (!report?.comment_id) return false;

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare("UPDATE comment_reports SET status = 'resolved' WHERE comment_id = ?").run(report.comment_id);
    const result = db.prepare('DELETE FROM comments WHERE id = ?').run(report.comment_id);
    db.exec('COMMIT');
    return result.changes === 1;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function deleteReportedPoem(db: DatabaseSync, reportId: number): boolean {
  const report = db.prepare('SELECT poem_id FROM reports WHERE id = ?')
    .get(reportId) as unknown as { poem_id: number | null } | undefined;
  if (!report?.poem_id) return false;

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare("UPDATE reports SET status = 'resolved' WHERE poem_id = ?").run(report.poem_id);
    const result = db.prepare('DELETE FROM poems WHERE id = ?').run(report.poem_id);
    db.exec('COMMIT');
    return result.changes === 1;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
