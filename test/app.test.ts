import test from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../src/app/build.js';
import { createDatabase } from '../src/db/client.js';
import { createPoem, listPopularPoems, ratePoem } from '../src/db/poems.js';
import { createUser } from '../src/db/users.js';
import { dailyWord, dailyWordCount } from '../src/poems/daily-word.js';

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

test('daily words do not repeat before the full rotation', () => {
  const words = Array.from({ length: dailyWordCount() }, (_, day) =>
    dailyWord(new Date(Date.UTC(2026, 7, 28 + day))),
  );
  assert.equal(dailyWordCount(), 496);
  assert.equal(new Set(words).size, words.length);
  assert.ok(words.every(word => [...word].length >= 2 && [...word].length <= 5));
});

test('popular poems rank higher ratings before newer low ratings', t => {
  const db = createDatabase(':memory:'); t.after(() => db.close());
  const author = createUser(db, {
    username: 'ranking-author@example.com',
    nickname: '작성자',
    provider: 'google',
    providerUserId: 'ranking-author',
  });
  const highRater = createUser(db, {
    username: 'high-rater@example.com',
    nickname: '고평가자',
    provider: 'google',
    providerUserId: 'high-rater',
  });
  const lowRater = createUser(db, {
    username: 'low-rater@example.com',
    nickname: '저평가자',
    provider: 'google',
    providerUserId: 'low-rater',
  });
  const highRatedPoem = createPoem(db, '행복', ['행복한', '복숭아'], author);
  const newerLowRatedPoem = createPoem(db, '우정', ['우리의', '정다운 날'], author);
  ratePoem(db, highRatedPoem, highRater.id, 5);
  ratePoem(db, newerLowRatedPoem, lowRater.id, 1);

  assert.deepEqual(listPopularPoems(db).map(poem => poem.id), [highRatedPoem, newerLowRatedPoem]);
});

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
  assert.match(emptyHome.body, /href="\/privacy">개인정보처리방침<\/a>/);
  assert.equal(emptyHome.body.match(/class="community-rank"/g)?.length, 5);
  assert.equal(emptyHome.body.match(/class="home-sponsor-sidebar"/g)?.length, 3);
  assert.equal(emptyHome.body.match(/class="home-sponsor-feed home-sponsor-feed-rank-/g)?.length, 3);
  assert.equal(emptyHome.body.match(/class="home-house-banner"/g)?.length, 1);
  assert.doesNotMatch(emptyHome.body, /home-house-banner"[^>]*data-ad-/);
  assert.match(emptyHome.body, /class="house-banner-content" href="\/ADVERTISING\.md"/);
  assert.equal(emptyHome.body.match(/popular-slot-empty/g)?.length, 5);
  assert.equal(emptyHome.headers['cache-control'], 'no-store');
  const privacyPage = await c.request({ method: 'GET', url: '/privacy' });
  assert.equal(privacyPage.statusCode, 200);
  assert.match(privacyPage.body, /<h1>개인정보처리방침<\/h1>/);
  assert.match(privacyPage.body, /ssurang\.contact@gmail\.com/);
  const advertisingPage = await c.request({ method: 'GET', url: '/ADVERTISING.md' });
  assert.equal(advertisingPage.statusCode, 200);
  assert.equal(advertisingPage.headers['content-type'], 'text/markdown; charset=utf-8');
  assert.equal(advertisingPage.body, '');
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
  const logo = await c.request({ method: 'GET', url: '/images/nhangsi-logo.v1.png' });
  assert.equal(logo.statusCode, 200);
  assert.equal(logo.headers['content-type'], 'image/png');
  assert.equal(logo.headers['cache-control'], 'public, max-age=31536000, immutable');
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

test('account deletion removes member activity and anonymizes authored poems', async t => {
  const app = await testApp(); t.after(() => app.close());
  const c = await client(app);
  const csrf = await googleLogin(c, 'withdraw@example.com', '탈퇴회원');

  let response = await c.request({
    method: 'POST',
    url: '/poems',
    headers,
    payload: form({
      _csrf: csrf,
      word: '이별',
      'lines[0]': '이제 떠나요',
      'lines[1]': '별처럼 남아요',
    }),
  });
  const poemUrl = response.headers.location;
  assert.ok(poemUrl);
  for (const [suffix, payload] of [
    ['comments', { content: '삭제될 댓글' }],
    ['ratings', { score: '5' }],
    ['saves', {}],
  ] as const) {
    response = await c.request({
      method: 'POST',
      url: `${poemUrl}/${suffix}`,
      headers,
      payload: form({ _csrf: csrf, ...payload }),
    });
    assert.equal(response.statusCode, 302);
  }

  const deletePage = await c.request({ method: 'GET', url: '/profile/delete' });
  const deleteCsrf = deletePage.body.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(deleteCsrf);
  response = await c.request({
    method: 'POST',
    url: '/profile/delete',
    headers,
    payload: form({ _csrf: deleteCsrf, confirmation: '삭제' }),
  });
  assert.equal(response.statusCode, 400);
  response = await c.request({
    method: 'POST',
    url: '/profile/delete',
    headers,
    payload: form({ _csrf: deleteCsrf, confirmation: '탈퇴' }),
  });
  assert.equal(response.statusCode, 302);
  assert.equal(response.headers.location, '/?accountDeleted');
  assert.equal((await c.request({ method: 'GET', url: '/profile' })).headers.location, '/login');

  const poem = await c.request({ method: 'GET', url: poemUrl });
  assert.equal(poem.statusCode, 200);
  assert.match(poem.body, /<strong>익명<\/strong>/);
  assert.doesNotMatch(poem.body, /탈퇴회원|삭제될 댓글/);

  const newCsrf = await googleLogin(c, 'withdraw@example.com', '재가입회원');
  assert.ok(newCsrf);
  assert.match((await c.request({ method: 'GET', url: '/profile' })).headers.location ?? '', /^\/users\/\d+$/);
});

test('protected routes and csrf are enforced', async t => {
  const app = await testApp(); t.after(() => app.close());
  const tokenlessResponse = await app.inject({
    method: 'POST',
    url: '/poems',
    headers,
    payload: form({
      word: '?ш낵',
      'lines[0]': '?щ옉?섍퀬',
      'lines[1]': '怨쇳븯寃??껋옄',
    }),
  });
  assert.equal(tokenlessResponse.statusCode, 403);

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
  await assert.rejects(
    buildApp({
      databasePath: ':memory:',
      sessionSecret: testSessionSecret,
      posthogKey: 'ph_test',
      posthogHost: 'http://insecure.example.com',
    }),
    /POSTHOG_HOST must use HTTPS/,
  );
});

test('PostHog is loaded only when configured and after browser consent', async t => {
  const app = await buildApp({
    databasePath: ':memory:',
    sessionSecret: testSessionSecret,
    appBaseUrl: 'http://localhost:8080',
    posthogKey: 'ph_test_public_key',
    posthogHost: 'https://us.i.posthog.com',
  });
  t.after(() => app.close());

  const home = await app.inject({ method: 'GET', url: '/' });
  assert.match(home.body, /src="\/js\/analytics\.js"/);
  assert.match(home.body, /data-posthog-key="ph_test_public_key"/);
  const analytics = await app.inject({ method: 'GET', url: '/js/analytics.js' });
  assert.equal(analytics.statusCode, 200);
  assert.match(analytics.body, /consent === "granted"/);
  assert.match(analytics.body, /autocapture: false/);
  assert.match(analytics.body, /disable_session_recording: true/);
  const sdk = await app.inject({ method: 'GET', url: '/js/posthog.js' });
  assert.equal(sdk.statusCode, 200);
  assert.match(sdk.headers['content-type'] ?? '', /text\/javascript/);
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

test('anonymous poem creation is also rate limited by IP across sessions', async t => {
  const app = await testApp(); t.after(() => app.close());
  let response;

  for (let attempt = 0; attempt < 31; attempt += 1) {
    const c = await client(app);
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
