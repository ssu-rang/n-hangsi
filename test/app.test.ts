import test from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../src/app/build.js';

const testSessionSecret = 'test-only-session-secret-0123456789-ABCDEF';
process.env.GOOGLE_CLIENT_ID = 'test-google-client';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:8080/login/oauth2/code/google';

let nextGoogleProfile = {
  sub: 'default-google-user',
  email: 'default@example.com',
  email_verified: true,
  name: '기본 사용자',
};

globalThis.fetch = async input => {
  const url = String(input);
  if (url === 'https://oauth2.googleapis.com/token') {
    return Response.json({ access_token: 'test-access-token' });
  }
  if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
    return Response.json(nextGoogleProfile);
  }
  throw new Error(`Unexpected fetch: ${url}`);
};

function testApp(adminEmail?: string) {
  return buildApp({
    databasePath: ':memory:',
    sessionSecret: testSessionSecret,
    appBaseUrl: 'http://localhost:8080',
    ...(adminEmail ? { adminEmail } : {}),
  });
}

async function client(app: FastifyInstance) {
  let cookie = '';
  async function request(options: InjectOptions) {
    const response = await app.inject({ ...options, headers: { ...options.headers, ...(cookie ? { cookie } : {}) } });
    const setCookie = response.headers['set-cookie'];
    if (setCookie) cookie = (Array.isArray(setCookie) ? setCookie.at(-1) : setCookie)?.split(';')[0] ?? '';
    return response;
  }
  const page = await request({ method: 'GET', url: '/poems/new' });
  const csrf = page.body.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(csrf);
  return { request, csrf, cookie: () => cookie };
}

function form(payload: Record<string, string | undefined>): string {
  return new URLSearchParams(Object.entries(payload).filter((entry): entry is [string, string] => entry[1] !== undefined)).toString();
}
const headers = { 'content-type': 'application/x-www-form-urlencoded' };

async function googleLogin(
  c: Awaited<ReturnType<typeof client>>,
  email: string,
  nickname: string,
): Promise<string> {
  nextGoogleProfile = {
    sub: `google-${email}`,
    email,
    email_verified: true,
    name: nickname,
  };
  let response = await c.request({ method: 'GET', url: '/oauth2/authorization/google' });
  const authorizationUrl = new URL(response.headers.location!);
  const state = authorizationUrl.searchParams.get('state');
  assert.ok(state);
  response = await c.request({
    method: 'GET',
    url: `/login/oauth2/code/google?code=test-code&state=${encodeURIComponent(state)}`,
  });
  assert.equal(response.headers.location, '/signup/nickname');
  const nicknamePage = await c.request({ method: 'GET', url: '/signup/nickname' });
  const nicknameCsrf = nicknamePage.body.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(nicknameCsrf);
  response = await c.request({
    method: 'POST',
    url: '/signup/nickname',
    headers,
    payload: form({ _csrf: nicknameCsrf, nickname }),
  });
  assert.equal(response.headers.location, '/');
  const page = await c.request({ method: 'GET', url: '/poems/new' });
  const csrf = page.body.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(csrf);
  return csrf;
}

test('public pages, poem validation and anonymous creation', async t => {
  const app = await testApp(); t.after(() => app.close());
  const c = await client(app);
  const initialExplorePage = await c.request({ method: 'GET', url: '/poems' });
  assert.equal(initialExplorePage.statusCode, 200);
  assert.match(initialExplorePage.body, /aria-current="page"[^>]*>1<\/a>/);
  const emptyHome = await c.request({ method: 'GET', url: '/' });
  assert.equal(emptyHome.body.match(/class="community-rank"/g)?.length, 5);
  assert.equal(emptyHome.body.match(/class="sidebar-ad"/g)?.length, 3);
  assert.equal(emptyHome.body.match(/class="feed-ad feed-ad-rank-/g)?.length, 3);
  assert.equal(emptyHome.body.match(/class="hero-ad"/g)?.length, 1);
  assert.equal(emptyHome.body.match(/popular-slot-empty/g)?.length, 5);
  assert.equal(emptyHome.headers['cache-control'], 'no-store');
  const writePage = await c.request({ method: 'GET', url: '/poems/new' });
  assert.match(writePage.body, /maxlength="5"/);
  let response = await c.request({ method: 'POST', url: '/poems', headers, payload: form({ _csrf: c.csrf, word: '가나다라마바' }) });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /제시어는 2~5자여야 합니다/);
  response = await c.request({ method: 'POST', url: '/poems', headers, payload: form({ _csrf: c.csrf, word: '고양이', 'lines[0]': '다른 시작', 'lines[1]': '양처럼', 'lines[2]': '이렇게' }) });
  assert.equal(response.statusCode, 200); assert.match(response.body, /시작해야 합니다/);
  response = await c.request({ method: 'POST', url: '/poems', headers, payload: form({ _csrf: c.csrf, word: '고양이', 'lines[0]': '고요한 밤', 'lines[1]': '양처럼 포근한', 'lines[2]': '이 시간' }) });
  assert.equal(response.statusCode, 302); const location = response.headers.location; assert.ok(location);
  response = await c.request({ method: 'GET', url: location }); assert.equal(response.statusCode, 200); assert.match(response.body, /익명/);
  for (let index = 0; index < 5; index += 1) {
    response = await c.request({ method: 'POST', url: '/poems', headers, payload: form({ _csrf: c.csrf, word: '사과', 'lines[0]': '사과 한 입', 'lines[1]': '과일 한 조각' }) });
    assert.equal(response.statusCode, 302);
  }
  response = await c.request({ method: 'GET', url: '/' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.match(/class="community-rank"/g)?.length, 5);
  assert.doesNotMatch(response.body, /오늘의 제시어/);
  const explorePage = await c.request({ method: 'GET', url: '/poems' });
  assert.doesNotMatch(explorePage.body, /EXPLORE/);
  assert.equal(explorePage.body.match(/class="explore-ranking-item/g)?.length, 5);
  assert.match(explorePage.body, /page=2/);
  const secondExplorePage = await c.request({ method: 'GET', url: '/poems?page=2' });
  assert.equal(secondExplorePage.body.match(/class="explore-ranking-item/g)?.length, 5);
  assert.equal(secondExplorePage.body.match(/class="explore-ranking-item is-empty"/g)?.length, 4);
  assert.doesNotMatch((await c.request({ method: 'GET', url: '/poems/new' })).body, /CREATE/);
  const stylesheet = await c.request({ method: 'GET', url: '/css/app.css' });
  assert.equal(stylesheet.headers['content-type'], 'text/css; charset=utf-8');
  assert.equal(stylesheet.headers['cache-control'], 'no-cache, must-revalidate');
  assert.equal((await c.request({ method: 'GET', url: '/poems/999999' })).statusCode, 404);
});

test('Google login, nickname, comment, rating, save and unsave flow', async t => {
  const app = await testApp(); t.after(() => app.close());
  const c = await client(app);
  const anonymousSessionCookie = c.cookie();
  const authenticatedCsrf = await googleLogin(c, 'member@example.com', '회원');
  assert.notEqual(c.cookie(), anonymousSessionCookie);
  let response = await c.request({ method: 'POST', url: '/poems', headers, payload: form({ _csrf: authenticatedCsrf, word: '사과', 'lines[0]': '사랑하고', 'lines[1]': '과하게 웃자' }) });
  assert.equal(response.statusCode, 302, response.body);
  const poemUrl = response.headers.location; assert.ok(poemUrl); assert.match(poemUrl, /^\/poems\/\d+$/);
  for (const [suffix, payload] of [['comments', { content: '좋아요' }], ['ratings', { score: '5' }], ['saves', {}]] as const) {
    response = await c.request({ method: 'POST', url: `${poemUrl}/${suffix}`, headers, payload: form({ _csrf: authenticatedCsrf, ...payload }) }); assert.equal(response.statusCode, 302);
  }
  response = await c.request({ method: 'GET', url: poemUrl }); assert.match(response.body, /좋아요/); assert.match(response.body, /★ 5/); assert.match(response.body, /저장 취소/);
  const profileRedirect = await c.request({ method: 'GET', url: '/profile' });
  assert.match(profileRedirect.headers.location ?? '', /^\/users\/\d+$/);
  const profilePage = await c.request({ method: 'GET', url: profileRedirect.headers.location! });
  assert.equal(profilePage.statusCode, 200); assert.match(profilePage.body, /사과/);
  const savesPage = await c.request({ method: 'GET', url: '/profile/saves' });
  assert.equal(savesPage.statusCode, 200); assert.match(savesPage.body, /사과/);
  response = await c.request({ method: 'POST', url: `${poemUrl}/saves`, headers, payload: form({ _csrf: authenticatedCsrf, _method: 'delete' }) }); assert.equal(response.statusCode, 302);
  assert.doesNotMatch((await c.request({ method: 'GET', url: poemUrl })).body, /저장 취소/);
});

test('protected routes and csrf are enforced', async t => {
  const app = await testApp(); t.after(() => app.close());
  const c = await client(app);
  assert.equal((await c.request({ method: 'GET', url: '/profile' })).headers.location, '/login');
  assert.equal((await c.request({ method: 'GET', url: '/signup' })).headers.location, '/login');
  assert.equal((await c.request({
    method: 'POST',
    url: '/login',
    headers,
    payload: form({ _csrf: c.csrf }),
  })).statusCode, 404);
  const response = await c.request({ method: 'POST', url: '/signup/nickname', headers, payload: form({ nickname: '사용자' }) });
  assert.equal(response.statusCode, 403);
});

test('Google login rejects an unverified email', async t => {
  const app = await testApp(); t.after(() => app.close());
  const c = await client(app);
  nextGoogleProfile = {
    sub: 'unverified-google-user',
    email: 'unverified@example.com',
    email_verified: false,
    name: '미인증 사용자',
  };

  let response = await c.request({ method: 'GET', url: '/oauth2/authorization/google' });
  const authorizationUrl = new URL(response.headers.location!);
  const state = authorizationUrl.searchParams.get('state');
  assert.ok(state);
  response = await c.request({
    method: 'GET',
    url: `/login/oauth2/code/google?code=test-code&state=${encodeURIComponent(state)}`,
  });
  assert.equal(response.headers.location, '/login?oauthError');
  assert.equal((await c.request({ method: 'GET', url: '/signup/nickname' })).headers.location, '/login');
});

test('configuration rejects weak session secrets', async () => {
  await assert.rejects(
    buildApp({ databasePath: ':memory:', sessionSecret: 'short' }),
    /at least 32 characters/,
  );
  await assert.rejects(
    buildApp({ databasePath: ':memory:', sessionSecret: 'a'.repeat(32) }),
    /at least 12 distinct characters/,
  );
});

test('anonymous poem creation is rate limited', async t => {
  const app = await testApp(); t.after(() => app.close());
  const c = await client(app);
  let response;
  for (let attempt = 0; attempt < 11; attempt += 1) {
    response = await c.request({
      method: 'POST',
      url: '/poems',
      headers,
      payload: form({ _csrf: c.csrf }),
    });
  }
  assert.equal(response!.statusCode, 429);
  assert.ok(Number(response!.headers['retry-after']) > 0);
});

test('reports are deduplicated and admin actions are server-authorized', async t => {
  const app = await testApp('admin@example.com'); t.after(() => app.close());
  const anonymous = await client(app);
  assert.equal((await anonymous.request({ method: 'GET', url: '/admin/reports' })).statusCode, 403);

  const member = await client(app);
  const memberCsrf = await googleLogin(member, 'member-report@example.com', '신고자');
  let response = await member.request({
    method: 'POST',
    url: '/poems',
    headers,
    payload: form({ _csrf: memberCsrf, word: '바다', 'lines[0]': '바람이', 'lines[1]': '다가온다' }),
  });
  const poemUrl = response.headers.location; assert.ok(poemUrl);
  response = await member.request({
    method: 'POST',
    url: `${poemUrl}/reports`,
    headers,
    payload: form({ _csrf: memberCsrf, reason: '부적절한 내용을 포함하고 있습니다.' }),
  });
  assert.equal(response.headers.location, `${poemUrl}?report=submitted`);
  response = await member.request({
    method: 'POST',
    url: `${poemUrl}/reports`,
    headers,
    payload: form({ _csrf: memberCsrf, reason: '같은 작품을 다시 신고합니다.' }),
  });
  assert.equal(response.headers.location, `${poemUrl}?report=duplicate`);
  assert.equal((await member.request({ method: 'GET', url: '/admin/reports' })).statusCode, 403);

  const admin = await client(app);
  const adminCsrf = await googleLogin(admin, 'admin@example.com', '관리자');
  response = await admin.request({ method: 'GET', url: '/admin/reports' });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /부적절한 내용을 포함하고 있습니다/);
  assert.match(response.body, /바람이/);
  assert.match(response.body, /pending/);
  const reportId = response.body.match(/\/admin\/reports\/(\d+)\/reject/)?.[1];
  assert.ok(reportId);

  response = await admin.request({ method: 'POST', url: `/admin/reports/${reportId}/reject`, headers, payload: '' });
  assert.equal(response.statusCode, 403);
  response = await admin.request({
    method: 'POST',
    url: `/admin/reports/${reportId}/reject`,
    headers,
    payload: form({ _csrf: adminCsrf }),
  });
  assert.equal(response.headers.location, '/admin/reports');
  assert.match((await admin.request({ method: 'GET', url: '/admin/reports' })).body, /rejected/);

  response = await admin.request({
    method: 'POST',
    url: `/admin/reports/${reportId}/resolve`,
    headers,
    payload: form({ _csrf: adminCsrf }),
  });
  assert.equal(response.headers.location, '/admin/reports');
  assert.match((await admin.request({ method: 'GET', url: '/admin/reports' })).body, /resolved/);

  response = await admin.request({
    method: 'POST',
    url: `/admin/reports/${reportId}/delete-poem`,
    headers,
    payload: form({ _csrf: adminCsrf }),
  });
  assert.equal(response.headers.location, '/admin/reports');
  assert.equal((await admin.request({ method: 'GET', url: poemUrl })).statusCode, 404);
  const reportsAfterDeletion = await admin.request({ method: 'GET', url: '/admin/reports' });
  assert.match(reportsAfterDeletion.body, /삭제된 작품/);
  assert.match(reportsAfterDeletion.body, /바람이/);
  assert.match(reportsAfterDeletion.body, /resolved/);
});
