import type { DatabaseSync } from 'node:sqlite';

const LINE_SEPARATOR = '\u001e';
export type ReportStatus = 'resolved' | 'rejected';

export interface ReportData {
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
  status: 'pending' | ReportStatus;
  created_at: string;
}

export function createReport(db: DatabaseSync, poemId: number, reporterId: number, reason: string): boolean {
  const result = db.prepare(`
    INSERT OR IGNORE INTO reports(
      poem_id, reported_poem_id, reporter_user_id,
      poem_word, poem_lines_text, poem_author_id, poem_author_name, reason
    )
    SELECT id, id, ?, word, lines_text, author_id, author_name, ?
    FROM poems WHERE id = ?
  `).run(reporterId, reason, poemId);
  return result.changes === 1;
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
