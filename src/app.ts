import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import session from '@fastify/session';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import nunjucks from 'nunjucks';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createDatabase } from './db.js';
import { bodyOf } from './request.js';
import { createRepository } from './repository.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerPoemRoutes } from './routes/poems.js';
import { registerUserRoutes } from './routes/users.js';
import type { AppOptions, Repository } from './types.js';

const sourceRoot = join(process.cwd(), 'src');
const protectedPaths = [
  /^\/profile(?:\/|$)/,
  /^\/poems\/\d+\/(comments|saves|ratings)$/,
];

const staticAssets = [
  ['/css/app.css', 'css/app.css', 'text/css; charset=utf-8'],
  ['/js/server-app.js', 'js/server-app.js', 'text/javascript; charset=utf-8'],
  ['/images/nhangsi-logo.png', 'images/nhangsi-logo.png', 'image/png'],
] as const;

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  ensureProductionConfiguration();

  const app = Fastify({ logger: options.logger ?? false, trustProxy: true });
  const database = options.db ?? createDatabase(options.databasePath ?? process.env.DATABASE_PATH);
  const repository = createRepository(database);

  await registerCorePlugins(app);
  registerViewRenderer(app);
  registerStaticAssets(app);
  registerSecurityHooks(app, repository);
  registerRoutes(app, repository);
  registerErrorHandlers(app);

  app.addHook('onClose', async () => repository.close());
  return app;
}

async function registerCorePlugins(app: FastifyInstance): Promise<void> {
  await app.register(cookie);
  await app.register(session, {
    secret: process.env.SESSION_SECRET || 'local-development-secret-change-me',
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    },
    saveUninitialized: false,
  });
  await app.register(formbody, {
    parser: (body: string) => Object.fromEntries(new URLSearchParams(body)),
  });
}

function registerViewRenderer(app: FastifyInstance): void {
  const views = nunjucks.configure(join(sourceRoot, 'views'), {
    autoescape: true,
    noCache: process.env.NODE_ENV !== 'production',
  });

  app.decorateRequest('currentUser', null);
  app.decorateReply('view', function (
    this: FastifyReply,
    template: string,
    data: Record<string, unknown> = {},
    status = 200,
  ) {
    const csrfToken = this.request.session.csrfToken ||= randomBytes(24).toString('hex');
    const html = views.render(template, {
      ...data,
      currentUser: this.request.currentUser,
      csrfToken,
      oauthEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    });

    return this.code(status).type('text/html; charset=utf-8').send(html);
  });
}

function registerStaticAssets(app: FastifyInstance): void {
  const staticRoot = join(sourceRoot, 'main/resources/static');

  for (const [url, filename, contentType] of staticAssets) {
    app.get(url, async (_request, reply) => {
      const contents = await readFile(join(staticRoot, filename));
      return reply.type(contentType).send(contents);
    });
  }
}

function registerSecurityHooks(app: FastifyInstance, repository: Repository): void {
  app.addHook('preHandler', async request => {
    const userId = request.session.userId;
    request.currentUser = userId ? repository.findUserById(userId) ?? null : null;
  });

  app.addHook('preHandler', async (request, reply) => {
    const body = bodyOf(request);
    const changesState = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);

    if (changesState && body._csrf !== request.session.csrfToken) {
      return reply.view('error/403.njk', {}, 403);
    }

    request.effectiveMethod = request.method === 'POST' && body._method
      ? body._method.toUpperCase()
      : request.method;

    if (isProtectedPath(request.url) && !request.currentUser) {
      return reply.redirect('/login');
    }
  });
}

function registerRoutes(app: FastifyInstance, repository: Repository): void {
  registerPoemRoutes(app, repository);
  registerUserRoutes(app, repository);
  registerAuthRoutes(app, repository);
}

function registerErrorHandlers(app: FastifyInstance): void {
  app.get('/error/403', async (_request, reply) => reply.view('error/403.njk', {}, 403));
  app.setNotFoundHandler(async (_request, reply) => reply.view('error/404.njk', {}, 404));
  app.setErrorHandler(async (error, request, reply) => {
    request.log.error(error);
    if (isBadRequest(error)) {
      return reply.view('error/400.njk', {}, 400);
    }
    return reply.view('error/500.njk', { traceId: request.id }, 500);
  });
}

function isBadRequest(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; validation?: unknown };
  return candidate.code === 'FST_ERR_BAD_STATUS_CODE' || Boolean(candidate.validation);
}

function isProtectedPath(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return protectedPaths.some(pattern => pattern.test(path));
}

function ensureProductionConfiguration(): void {
  if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required in production');
  }
}
