import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import session from '@fastify/session';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import nunjucks from 'nunjucks';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { createDatabase } from '../db/client.js';
import { bodyOf } from '../shared/request.js';
import { findUserById } from '../db/users.js';
import { registerAuthRoutes } from '../auth/routes.js';
import { registerReportRoutes } from '../reports/routes.js';
import { registerPoemRoutes } from '../poems/routes.js';
import { registerUserRoutes } from '../users/routes.js';

export interface AppOptions {
  logger?: boolean;
  db?: DatabaseSync;
  databasePath?: string;
  sessionSecret?: string;
  trustProxy?: boolean | string | string[];
  appBaseUrl?: string;
  adminEmail?: string;
}

const sourceRoot = join(process.cwd(), 'src');
const protectedPaths = [
  /^\/profile(?:\/|$)/,
  /^\/poems\/\d+\/(comments|saves|ratings|reports)$/,
];

const staticAssets = [
  ['/css/app.css', 'css/app.css', 'text/css; charset=utf-8'],
  ['/js/server-app.js', 'js/server-app.js', 'text/javascript; charset=utf-8'],
  ['/images/nhangsi-logo.png', 'images/nhangsi-logo.png', 'image/png'],
] as const;

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const configuredSessionSecret = options.sessionSecret ?? process.env.SESSION_SECRET;
  const sessionSecret = configuredSessionSecret
    ?? (isProductionEnvironment() ? undefined : randomBytes(48).toString('base64url'));
  const appBaseUrl = options.appBaseUrl ?? process.env.APP_BASE_URL ?? 'http://localhost:8080';
  ensureConfiguration(sessionSecret, appBaseUrl, Boolean(options.appBaseUrl));

  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: options.trustProxy ?? configuredTrustProxy(),
  });
  const database = options.db ?? createDatabase(options.databasePath ?? process.env.DATABASE_PATH);
  if (!configuredSessionSecret) {
    app.log.warn('Using an ephemeral development session secret; sessions reset when the server restarts');
  }

  await registerCorePlugins(app, sessionSecret!);
  registerViewRenderer(app);
  registerStaticAssets(app);
  registerSecurityHooks(app, database, options.adminEmail ?? process.env.ADMIN_EMAIL);
  registerRoutes(app, database);
  registerErrorHandlers(app);

  app.addHook('onClose', async () => database.close());
  return app;
}

async function registerCorePlugins(app: FastifyInstance, sessionSecret: string): Promise<void> {
  await app.register(cookie);
  await app.register(session, {
    secret: sessionSecret,
    cookie: {
      secure: isProductionEnvironment(),
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
    noCache: !isProductionEnvironment(),
  });

  app.decorateRequest('currentUser', null);
  app.decorateRequest('isAdmin', false);
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

    return this
      .header('Cache-Control', 'no-store')
      .code(status)
      .type('text/html; charset=utf-8')
      .send(html);
  });
}

function registerStaticAssets(app: FastifyInstance): void {
  const staticRoot = join(sourceRoot, 'main/resources/static');

  for (const [url, filename, contentType] of staticAssets) {
    app.get(url, async (_request, reply) => {
      const contents = await readFile(join(staticRoot, filename));
      return reply
        .header('Cache-Control', 'no-cache, must-revalidate')
        .type(contentType)
        .send(contents);
    });
  }
}

function registerSecurityHooks(
  app: FastifyInstance,
  database: import('node:sqlite').DatabaseSync,
  adminEmail: string | undefined,
): void {
  const rateLimiter = new InMemoryRateLimiter();

  app.addHook('onClose', async () => rateLimiter.close());

  app.addHook('preHandler', async request => {
    const userId = request.session.userId;
    request.currentUser = userId ? findUserById(database, userId) ?? null : null;
    request.isAdmin = Boolean(
      request.currentUser
      && adminEmail
      && request.session.userEmail?.toLowerCase() === adminEmail.trim().toLowerCase(),
    );
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

    if (isAdminPath(request.url) && !request.isAdmin) {
      return reply.view('error/403.njk', {}, 403);
    }

    if (isProtectedPath(request.url) && !request.currentUser) {
      return reply.redirect('/login');
    }

    for (const policy of rateLimitPolicies(request)) {
      const result = rateLimiter.consume(policy.key, policy.limit, policy.windowMs);
      if (!result.allowed) {
        return reply
          .header('Retry-After', String(Math.ceil(result.retryAfterMs / 1_000)))
          .code(429)
          .type('text/plain; charset=utf-8')
          .send('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
      }
    }
  });
}

function registerRoutes(
  app: FastifyInstance,
  database: import('node:sqlite').DatabaseSync,
): void {
  registerPoemRoutes(app, database);
  registerReportRoutes(app, database);
  registerUserRoutes(app, database);
  registerAuthRoutes(app, database);
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

function isAdminPath(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return /^\/admin(?:\/|$)/.test(path);
}

function ensureConfiguration(
  sessionSecret: string | undefined,
  appBaseUrl: string,
  appBaseUrlProvidedByOptions: boolean,
): void {
  if (!sessionSecret) throw new Error('SESSION_SECRET is required');
  if (sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  if (new Set(sessionSecret).size < 12) {
    throw new Error('SESSION_SECRET must contain at least 12 distinct characters');
  }

  let publicUrl: URL;
  try {
    publicUrl = new URL(appBaseUrl);
  } catch {
    throw new Error('APP_BASE_URL must be an absolute URL');
  }
  if (!['http:', 'https:'].includes(publicUrl.protocol)) {
    throw new Error('APP_BASE_URL must use HTTP or HTTPS');
  }
  if (isProductionEnvironment()) {
    if (!process.env.APP_BASE_URL && !appBaseUrlProvidedByOptions) {
      throw new Error('APP_BASE_URL is required in production');
    }
    if (publicUrl.protocol !== 'https:') throw new Error('APP_BASE_URL must use HTTPS in production');
  }

  const hasClientId = Boolean(process.env.GOOGLE_CLIENT_ID);
  const hasClientSecret = Boolean(process.env.GOOGLE_CLIENT_SECRET);
  if (isProductionEnvironment() && (!hasClientId || !hasClientSecret)) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production');
  }
  if (hasClientId !== hasClientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together');
  }
  if (hasClientId && !process.env.GOOGLE_REDIRECT_URI) {
    throw new Error('GOOGLE_REDIRECT_URI is required when Google OAuth is configured');
  }
  if (hasClientId) validateGoogleRedirectUri(process.env.GOOGLE_REDIRECT_URI!);
}

function validateGoogleRedirectUri(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('GOOGLE_REDIRECT_URI must be an absolute URL');
  }
  if (isProductionEnvironment() && url.protocol !== 'https:') {
    throw new Error('GOOGLE_REDIRECT_URI must use HTTPS in production');
  }
}

function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT_ID);
}

function configuredTrustProxy(): false | string[] {
  const proxies = process.env.TRUSTED_PROXIES?.split(',').map(value => value.trim()).filter(Boolean);
  return proxies?.length ? proxies : false;
}

interface RateLimitPolicy {
  key: string;
  limit: number;
  windowMs: number;
}

function rateLimitPolicies(request: import('fastify').FastifyRequest): RateLimitPolicy[] {
  const path = request.url.split('?')[0] ?? request.url;
  const ip = request.ip;
  const actor = request.currentUser ? `user:${request.currentUser.id}` : `session:${request.session.sessionId}`;

  if (request.method === 'GET' && path === '/oauth2/authorization/google') {
    return [{ key: `oauth:${ip}`, limit: 20, windowMs: 15 * 60_000 }];
  }
  if (request.method === 'POST' && path === '/poems') {
    return [{ key: `poem:${actor}:${ip}`, limit: request.currentUser ? 30 : 10, windowMs: 60 * 60_000 }];
  }
  if (request.method === 'POST' && /^\/poems\/\d+\/(comments|ratings|saves)$/.test(path)) {
    return [{ key: `interaction:${actor}`, limit: 60, windowMs: 15 * 60_000 }];
  }
  if (request.method === 'POST' && /^\/poems\/\d+\/reports$/.test(path)) {
    return [{ key: `report:${actor}`, limit: 10, windowMs: 60 * 60_000 }];
  }
  return [];
}

class InMemoryRateLimiter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();
  private readonly cleanupTimer = setInterval(() => this.cleanup(), 60_000).unref();

  consume(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();
    let entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      this.entries.set(key, entry);
    }
    entry.count += 1;
    return { allowed: entry.count <= limit, retryAfterMs: Math.max(0, entry.resetAt - now) };
  }

  close(): void {
    clearInterval(this.cleanupTimer);
    this.entries.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
  }
}
