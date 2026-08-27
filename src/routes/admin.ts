import type { FastifyInstance } from 'fastify';
import { numericId } from '../request.js';
import type { Repository } from '../types.js';

export function registerAdminRoutes(app: FastifyInstance, repo: Repository): void {
  app.get('/admin/reports', async (_request, reply) => {
    return reply.view('admin/reports.njk', { reports: repo.listReports() });
  });

  app.post('/admin/reports/:id/reject', async (request, reply) => {
    return repo.updateReportStatus(numericId(request), 'rejected')
      ? reply.redirect('/admin/reports')
      : reply.view('error/404.njk', {}, 404);
  });

  app.post('/admin/reports/:id/resolve', async (request, reply) => {
    return repo.updateReportStatus(numericId(request), 'resolved')
      ? reply.redirect('/admin/reports')
      : reply.view('error/404.njk', {}, 404);
  });

  app.post('/admin/reports/:id/delete-poem', async (request, reply) => {
    return repo.deleteReportedPoem(numericId(request)) === 'deleted'
      ? reply.redirect('/admin/reports')
      : reply.view('error/404.njk', {}, 404);
  });
}
