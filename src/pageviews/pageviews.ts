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

export function registerPageViews(app: FastifyInstance, db: DatabaseSync, appBaseUrl: string): void {
  const insertPageView = db.prepare(`
    INSERT INTO page_views(path, visitor_id, user_id, referrer_source, view_date)
    VALUES (?, ?, ?, ?, date('now', '+9 hours'))
  `);

  app.addHook('onResponse', async (request, reply) => {
    if (!isPageView(request, reply)) return;

    const path = new URL(request.url, 'http://localhost').pathname;
    insertPageView.run(path, request.session.sessionId, request.currentUser?.id ?? null,
      classifyReferrer(request.headers.referer, appBaseUrl));
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

    const sourceCounts = db.prepare(`
      SELECT referrer_source AS source, count(*) AS visits
      FROM page_views
      WHERE view_date >= date('now', '+9 hours', '-29 days')
        AND referrer_source IS NOT NULL
      GROUP BY referrer_source
    `).all() as unknown as Array<{ source: string; visits: number }>;
    const sources = Object.entries(referrerLabels).map(([source, label]) => ({
      label, visits: sourceCounts.find(row => row.source === source)?.visits ?? 0,
    }));

    return reply.view('admin/pageviews.njk', {
      sources,
      today,
      last7Days,
      last30Days,
      daily,
      pages,
    });
  });
}

const referrerLabels = {
  naver: '네이버', google: 'Google', instagram: 'Instagram', x: 'X', direct: '직접 유입', other: '기타',
};

// Only category values are persisted; internal navigation is not a new arrival.
export function classifyReferrer(referrer: string | undefined, appBaseUrl: string): string | null {
  if (!referrer) return 'direct';
  try {
    const url = new URL(referrer);
    if (!['http:', 'https:'].includes(url.protocol)) return 'other';
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (host === new URL(appBaseUrl).hostname.toLowerCase()) return null;
    const matches = (domain: string) => host === domain || host.endsWith(`.${domain}`);
    if (matches('naver.com') || matches('naver.me')) return 'naver';
    if (matches('google.com') || matches('google.co.kr') || matches('google.co.jp')
      || matches('google.co.uk') || matches('google.de') || matches('google.fr')) return 'google';
    if (matches('instagram.com')) return 'instagram';
    if (matches('x.com') || matches('twitter.com') || matches('t.co')) return 'x';
    return 'other';
  } catch {
    return 'other';
  }
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
