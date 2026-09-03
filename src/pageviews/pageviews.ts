import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';

type SummaryRow = {
  views: number;
  visitors: number;
};

type DailyRow = SummaryRow & {
  date: string;
};

type PageRow = SummaryRow & {
  path: string;
};

export function registerPageViews(app: FastifyInstance, db: DatabaseSync): void {
  const insertPageView = db.prepare(`
    INSERT INTO page_views(path, visitor_id, user_id, view_date)
    VALUES (?, ?, ?, date('now', '+9 hours'))
  `);

  app.addHook('onResponse', async (request, reply) => {
    if (!isPageView(request, reply)) return;

    const path = new URL(request.url, 'http://localhost').pathname;
    insertPageView.run(path, request.session.sessionId, request.currentUser?.id ?? null);
  });

  app.get('/admin/pageviews', async (_request, reply) => {
    const today = summary(db, `view_date = date('now', '+9 hours')`);
    const last7Days = summary(db, `view_date >= date('now', '+9 hours', '-6 days')`);
    const last30Days = summary(db, `view_date >= date('now', '+9 hours', '-29 days')`);
    const daily = db.prepare(`
      SELECT
        view_date AS date,
        count(*) AS views,
        count(DISTINCT visitor_id) AS visitors
      FROM page_views
      WHERE view_date >= date('now', '+9 hours', '-13 days')
      GROUP BY view_date
      ORDER BY date DESC
    `).all() as unknown as DailyRow[];
    const pages = db.prepare(`
      SELECT
        path,
        count(*) AS views,
        count(DISTINCT visitor_id) AS visitors
      FROM page_views
      WHERE view_date >= date('now', '+9 hours', '-29 days')
      GROUP BY path
      ORDER BY views DESC, path
      LIMIT 50
    `).all() as unknown as PageRow[];

    return reply.view('admin/pageviews.njk', {
      today,
      last7Days,
      last30Days,
      daily,
      pages,
    });
  });
}

function isPageView(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.method !== 'GET' || reply.statusCode < 200 || reply.statusCode >= 300) return false;
  if (!String(reply.getHeader('content-type') ?? '').startsWith('text/html')) return false;

  const path = new URL(request.url, 'http://localhost').pathname;
  return !path.startsWith('/admin') && !path.includes('.');
}

function summary(db: DatabaseSync, where: string): SummaryRow {
  return db.prepare(`
    SELECT count(*) AS views, count(DISTINCT visitor_id) AS visitors
    FROM page_views
    WHERE ${where}
  `).get() as unknown as SummaryRow;
}
