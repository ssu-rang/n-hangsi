import test from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../src/app.js';

async function client(app: FastifyInstance) {
  let cookie = '';
  async function request(options: InjectOptions) {
    const response = await app.inject({ ...options, headers: { ...options.headers, ...(cookie ? { cookie } : {}) } });
    const setCookie = response.headers['set-cookie'];
    if (setCookie) cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0] ?? '';
    return response;
  }
  const page = await request({ method: 'GET', url: '/signup' });
  const csrf = page.body.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(csrf);
  return { request, csrf };
}

function form(payload: Record<string, string | undefined>): string {
  return new URLSearchParams(Object.entries(payload).filter((entry): entry is [string, string] => entry[1] !== undefined)).toString();
}
const headers = { 'content-type': 'application/x-www-form-urlencoded' };

test('public pages, poem validation and anonymous creation', async t => {
  const app = await buildApp({ databasePath: ':memory:' }); t.after(() => app.close());
  const c = await client(app);
  assert.equal((await c.request({ method: 'GET', url: '/poems' })).statusCode, 200);
  let response = await c.request({ method: 'POST', url: '/poems', headers, payload: form({ _csrf: c.csrf, word: '고양이', 'lines[0]': '다른 시작', 'lines[1]': '양처럼', 'lines[2]': '이렇게' }) });
  assert.equal(response.statusCode, 200); assert.match(response.body, /시작해야 합니다/);
  response = await c.request({ method: 'POST', url: '/poems', headers, payload: form({ _csrf: c.csrf, word: '고양이', 'lines[0]': '고요한 밤', 'lines[1]': '양처럼 포근한', 'lines[2]': '이 시간' }) });
  assert.equal(response.statusCode, 302); const location = response.headers.location; assert.ok(location);
  response = await c.request({ method: 'GET', url: location }); assert.equal(response.statusCode, 200); assert.match(response.body, /익명/);
  assert.equal((await c.request({ method: 'GET', url: '/' })).statusCode, 200);
  assert.equal((await c.request({ method: 'GET', url: '/css/app.css' })).headers['content-type'], 'text/css; charset=utf-8');
  assert.equal((await c.request({ method: 'GET', url: '/poems/999999' })).statusCode, 404);
});

test('signup, login, comment, rating, save and unsave flow', async t => {
  const app = await buildApp({ databasePath: ':memory:' }); t.after(() => app.close());
  const c = await client(app);
  let response = await c.request({ method: 'POST', url: '/signup', headers, payload: form({ _csrf: c.csrf, email: 'member@example.com', nickname: '회원', password: 'password123', passwordConfirm: 'password123' }) });
  assert.equal(response.headers.location, '/login?registered');
  response = await c.request({ method: 'POST', url: '/login', headers, payload: form({ _csrf: c.csrf, username: 'member@example.com', password: 'password123' }) }); assert.equal(response.headers.location, '/');
  response = await c.request({ method: 'POST', url: '/poems', headers, payload: form({ _csrf: c.csrf, word: '사과', 'lines[0]': '사랑하고', 'lines[1]': '과하게 웃자' }) });
  const poemUrl = response.headers.location; assert.ok(poemUrl); assert.match(poemUrl, /^\/poems\/\d+$/);
  for (const [suffix, payload] of [['comments', { content: '좋아요' }], ['ratings', { score: '5' }], ['saves', {}]] as const) {
    response = await c.request({ method: 'POST', url: `${poemUrl}/${suffix}`, headers, payload: form({ _csrf: c.csrf, ...payload }) }); assert.equal(response.statusCode, 302);
  }
  response = await c.request({ method: 'GET', url: poemUrl }); assert.match(response.body, /좋아요/); assert.match(response.body, /★ 5/); assert.match(response.body, /저장 취소/);
  response = await c.request({ method: 'POST', url: `${poemUrl}/saves`, headers, payload: form({ _csrf: c.csrf, _method: 'delete' }) }); assert.equal(response.statusCode, 302);
  assert.doesNotMatch((await c.request({ method: 'GET', url: poemUrl })).body, /저장 취소/);
});

test('protected routes and csrf are enforced', async t => {
  const app = await buildApp({ databasePath: ':memory:' }); t.after(() => app.close());
  const c = await client(app);
  assert.equal((await c.request({ method: 'GET', url: '/profile' })).headers.location, '/login');
  const response = await c.request({ method: 'POST', url: '/signup', headers, payload: form({ email: 'x@example.com' }) });
  assert.equal(response.statusCode, 403);
});
