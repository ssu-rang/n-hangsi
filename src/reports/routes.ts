import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { getPoem, listComments } from '../db/poems.js';
import {
  commentExists,
  createCommentReport,
  createReport,
  deleteReportedComment,
  deleteReportedPoem,
  listCommentReports,
  listReports,
  updateCommentReportStatus,
  updateReportStatus,
} from '../db/reports.js';
import { toCommentView, toPoemView } from '../poems/view.js';
import { formatKoreaDateTime } from '../shared/date-time.js';
import { bodyOf, numericId } from '../shared/request.js';

export function registerReportRoutes(app: FastifyInstance, db: DatabaseSync): void {
  app.post('/poems/:id/reports', async (request, reply) => {
    const poemId = numericId(request);
    const poemData = getPoem(db, poemId, request.currentUser!.id);
    if (!poemData) return reply.view('error/404.njk', {}, 404);
    const poem = toPoemView(poemData);

    const reason = String(bodyOf(request).reason ?? '').trim();
    const reportError = validateReportReason(reason);
    if (reportError) {
      return reply.view('poems/detail.njk', {
        poem,
        comments: listComments(db, poemId).map(toCommentView),
        commentError: null,
        reportError,
        reportSubmitted: false,
        reportDuplicate: false,
      }, 400);
    }

    const outcome = createReport(db, poemId, request.currentUser!.id, reason) ? 'submitted' : 'duplicate';
    return reply.redirect(`/poems/${poemId}?report=${outcome}`);
  });

  app.post('/poems/:id/comments/:commentId/reports', async (request, reply) => {
    const poemId = numericId(request);
    const commentId = Number((request.params as { commentId?: string }).commentId);
    if (!Number.isInteger(commentId) || !commentExists(db, poemId, commentId)) {
      return reply.view('error/404.njk', {}, 404);
    }

    const reason = String(bodyOf(request).reason ?? '').trim();
    const reportError = validateReportReason(reason);
    if (reportError) {
      const poemData = getPoem(db, poemId, request.currentUser!.id);
      if (!poemData) return reply.view('error/404.njk', {}, 404);
      return reply.view('poems/detail.njk', {
        poem: toPoemView(poemData),
        comments: listComments(db, poemId).map(toCommentView),
        commentError: null,
        reportError: null,
        commentReportError: reportError,
        commentReportId: commentId,
      }, 400);
    }

    const outcome = createCommentReport(db, poemId, commentId, request.currentUser!.id, reason)
      ? 'submitted' : 'duplicate';
    return reply.redirect(`/poems/${poemId}?commentReport=${outcome}&commentId=${commentId}#comment-${commentId}`);
  });

  app.get('/admin/reports', async (_request, reply) => {
    return reply.view('admin/reports.njk', {
      reports: listReports(db).map(report => ({
        ...report,
        createdAt: formatKoreaDateTime(report.createdAt),
      })),
      commentReports: listCommentReports(db).map(report => ({
        ...report,
        createdAt: formatKoreaDateTime(report.createdAt),
      })),
    });
  });

  app.post('/admin/reports/:id/reject', async (request, reply) => {
    return updateReportStatus(db, numericId(request), 'rejected')
      ? reply.redirect('/admin/reports')
      : reply.view('error/404.njk', {}, 404);
  });

  app.post('/admin/reports/:id/resolve', async (request, reply) => {
    return updateReportStatus(db, numericId(request), 'resolved')
      ? reply.redirect('/admin/reports')
      : reply.view('error/404.njk', {}, 404);
  });

  app.post('/admin/reports/:id/delete-poem', async (request, reply) => {
    return deleteReportedPoem(db, numericId(request))
      ? reply.redirect('/admin/reports')
      : reply.view('error/404.njk', {}, 404);
  });

  app.post('/admin/comment-reports/:id/reject', async (request, reply) => {
    return updateCommentReportStatus(db, numericId(request), 'rejected')
      ? reply.redirect('/admin/reports')
      : reply.view('error/404.njk', {}, 404);
  });

  app.post('/admin/comment-reports/:id/resolve', async (request, reply) => {
    return updateCommentReportStatus(db, numericId(request), 'resolved')
      ? reply.redirect('/admin/reports')
      : reply.view('error/404.njk', {}, 404);
  });

  app.post('/admin/comment-reports/:id/delete-comment', async (request, reply) => {
    return deleteReportedComment(db, numericId(request))
      ? reply.redirect('/admin/reports')
      : reply.view('error/404.njk', {}, 404);
  });
}

function validateReportReason(reason: string): string | null {
  if ([...reason].length < 3) return '신고 사유를 3자 이상 입력해 주세요.';
  if ([...reason].length > 500) return '신고 사유는 500자 이하여야 합니다.';
  return null;
}
