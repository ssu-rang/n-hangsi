import test from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../src/app/build.js';
import { createDatabase } from '../src/db/client.js';
import { createPoem, listPopularPoems, listTrendingPoems, ratePoem } from '../src/db/poems.js';
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

test('trending poems prioritize the last day and fill remaining places with older poems by rating', t => {
  const db = createDatabase(':memory:'); t.after(() => db.close());
  const author = createUser(db, {
    username: 'trending-author@example.com',
    nickname: '작성자',
    provider: 'google',
    providerUserId: 'trending-author',
  });
  const rater = createUser(db, {
    username: 'trending-rater@example.com',
    nickname: '평가자',
    provider: 'google',
    providerUserId: 'trending-rater',
  });
  const recentPoem = createPoem(db, '오늘', ['오늘의', '늘 좋은 작품'], author);
  const olderHighRatedPoem = createPoem(db, '과거', ['과감한', '거장의 작품'], author);
  const olderLowRatedPoem = createPoem(db, '추억', ['추억의', '억센 작품'], author);
  ratePoem(db, recentPoem, rater.id, 1);
  ratePoem(db, olderHighRatedPoem, rater.id, 5);
  ratePoem(db, olderLowRatedPoem, rater.id, 2);
  db.prepare("UPDATE poems SET created_at = datetime('now', '-2 days') WHERE id IN (?, ?)")
    .run(olderHighRatedPoem, olderLowRatedPoem);

  assert.deepEqual(
    listTrendingPoems(db).map(poem => poem.id),
    [recentPoem, olderHighRatedPoem, olderLowRatedPoem],
  );
});

test('home hero recommends the highest-ranked poem for today\'s word', async t => {
  const db = createDatabase(':memory:');
  const author = createUser(db, {
    username: 'hero-author@example.com',
    nickname: '추천작가',
    provider: 'google',
    providerUserId: 'hero-author',
  });
  const highRater = createUser(db, {
    username: 'hero-high@example.com',
    nickname: '고평가자',
    provider: 'google',
    providerUserId: 'hero-high',
  });
  const lowRater = createUser(db, {
    username: 'hero-low@example.com',
    nickname: '저평가자',
    provider: 'google',
    providerUserId: 'hero-low',
  });
  const word = dailyWord();
  const highRatedPoem = createPoem(db, word, ['인기 작품 첫째 줄', '인기 작품 둘째 줄'], author);
  const newerLowRatedPoem = createPoem(db, word, ['최신 작품 첫째 줄', '최신 작품 둘째 줄'], author);
  ratePoem(db, highRatedPoem, highRater.id, 5);
  ratePoem(db, newerLowRatedPoem, lowRater.id, 1);

  const app = await buildApp({
    db,
    sessionSecret: testSessionSecret,
    appBaseUrl: 'http://localhost:8080',
  });
  t.after(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/' });
  const hero = response.body.match(/<div class="featured-work">([\s\S]*?)<\/div>\s*<\/div>/)?.[1];
  assert.ok(hero);
  assert.match(hero, /인기 작품 첫째 줄/);
  assert.doesNotMatch(hero, /최신 작품 첫째 줄/);
  const latest = response.body.match(/<section class="latest-work"[\s\S]*?<\/section>/)?.[0];
  assert.ok(latest);
  assert.match(latest, /최신 작품 첫째 줄/);
  assert.doesNotMatch(latest, /인기 작품 첫째 줄/);
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
  assert.match(initialExplorePage.body, /<meta name="description"/);
  assert.match(initialExplorePage.body, /<meta name="robots" content="index, follow">/);
  assert.match(initialExplorePage.body, /<link rel="canonical" href="http:\/\/localhost:8080\/poems">/);
  assert.match(initialExplorePage.body, /<meta property="og:title" content="N행시 마당 \| N행시">/);
  assert.match(initialExplorePage.body, /aria-current="page"[^>]*>1<\/a>/);
  const emptyHome = await c.request({ method: 'GET', url: '/' });
  assert.match(emptyHome.body, /<title>N행시 - 매일 새로운 N행시<\/title>/);
  assert.match(emptyHome.body, /<meta property="og:title" content="N행시 - 매일 새로운 N행시">/);
  assert.match(emptyHome.body, /<link rel="icon" type="image\/png" href="\/images\/nhangsi-logo\.v1\.png">/);
  assert.match(emptyHome.body, />5행시<\/a>/);
  assert.doesNotMatch(emptyHome.body, />5글자<\/a>/);
  assert.match(emptyHome.body, /href="\/privacy">개인정보처리방침<\/a>/);
  assert.equal(emptyHome.body.match(/class="community-rank"/g)?.length ?? 0, 0);
  assert.equal(emptyHome.body.match(/class="trending-item trending-rank-\d is-empty" aria-hidden="true"/g)?.length, 5);
  assert.equal(emptyHome.body.match(/class="home-sponsor-sidebar"/g)?.length, 3);
  assert.equal(emptyHome.body.match(/class="home-sponsor-feed home-sponsor-feed-rank-/g)?.length, 3);
  assert.doesNotMatch(emptyHome.body, /home-sponsor-between|home-mobile-between/);
  assert.equal(emptyHome.body.match(/class="latest-work"/g)?.length, 1);
  assert.match(emptyHome.body, /방금 올라온 N행시/);
  assert.doesNotMatch(emptyHome.body, /class="home-house-banner"|광고 자리 비어있습니다/);
  assert.doesNotMatch(emptyHome.body, /popular-slot-empty/);
  assert.equal(emptyHome.headers['cache-control'], 'no-store');
  const privacyPage = await c.request({ method: 'GET', url: '/privacy' });
  assert.equal(privacyPage.statusCode, 200);
  assert.match(privacyPage.body, /<h1>개인정보처리방침<\/h1>/);

  const loginPage = await c.request({ method: 'GET', url: '/login' });
  assert.match(loginPage.body, /<meta name="robots" content="noindex, nofollow">/);

  const robots = await c.request({ method: 'GET', url: '/robots.txt' });
  assert.equal(robots.statusCode, 200);
  assert.equal(robots.headers['content-type'], 'text/plain; charset=utf-8');
  assert.equal(robots.headers['cache-control'], 'no-cache, must-revalidate');
  assert.match(robots.body, /^User-agent: \*\nAllow: \//);
  assert.match(robots.body, /Sitemap: http:\/\/localhost:8080\/sitemap.xml/);

  const sitemap = await c.request({ method: 'GET', url: '/sitemap.xml' });
  assert.equal(sitemap.statusCode, 200);
  assert.match(sitemap.headers['content-type'] ?? '', /application\/xml/);
  assert.match(sitemap.body, /<loc>http:\/\/localhost:8080\/poems<\/loc>/);
  assert.match(privacyPage.body, /ssurang\.contact@gmail\.com/);
  const advertisingPage = await c.request({ method: 'GET', url: '/advertising' });
  assert.equal(advertisingPage.statusCode, 200);
  assert.match(advertisingPage.body, /<h1>N행시 광고 안내<\/h1>/);
  assert.match(advertisingPage.body, /최대 <strong>2주<\/strong>/);
  assert.match(advertisingPage.body, /href="mailto:ssurang\.contact@gmail\.com"/);
  assert.match(advertisingPage.body, /Instagram DM/);
  const writePage = await c.request({ method: 'GET', url: '/poems/new' });
  assert.match(writePage.body, /maxlength="5"/);
  let response = await c.request({ method: 'POST', url: '/poems', headers, payload: form({ _csrf: c.csrf, word: '가나다라마바' }) });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /제시어는 2~5자여야 합니다/);
  response = await c.request({ method: 'POST', url: '/poems', headers, payload: form({ _csrf: c.csrf, word: '고양이', 'lines[0]': '다른 시작', 'lines[1]': '양처럼', 'lines[2]': '이렇게' }) });
  assert.equal(response.statusCode, 200); assert.match(response.body, /data-line-error>.*시작해야 합니다/);
  response = await c.request({ method: 'POST', url: '/poems', headers, payload: form({ _csrf: c.csrf, word: 'ㄱㅏ' }) });
  assert.equal(response.statusCode, 200); assert.match(response.body, /제시어는 완성된 한글로 입력해 주세요/);
  response = await c.request({ method: 'POST', url: '/poems', headers, payload: form({ _csrf: c.csrf, word: '고양이', 'lines[0]': '고요한 밤', 'lines[1]': '양처럼 포근한', 'lines[2]': '이 시간' }) });
  assert.equal(response.statusCode, 302); const location = response.headers.location; assert.ok(location);
  response = await c.request({ method: 'GET', url: location });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /익명/);
  assert.match(response.body, /<title>고양이 N행시 - 익명의 작품 \| N행시<\/title>/);
  assert.match(response.body, /<meta property="og:title" content="고양이 N행시 - 익명의 작품 \| N행시">/);
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
  const naverVerification = await c.request({
    method: 'GET',
    url: '/naver9e961206c1a4e17f70eaed13312b77dd.html',
  });
  assert.equal(naverVerification.statusCode, 200);
  assert.equal(naverVerification.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(
    naverVerification.body.trim(),
    'naver-site-verification: naver9e961206c1a4e17f70eaed13312b77dd.html',
  );
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
  response = await c.request({ method: 'GET', url: poemUrl }); assert.match(response.body, /좋아요/); assert.match(response.body, /★ 5/); assert.match(response.body, /bookmark-button is-saved/);
  assert.match(response.body, /aria-label="저장 취소"/);
  assert.match(response.body, /<details class="report-disclosure">/);
  assert.match(response.body, /class="report-icon-button" aria-label="작품 신고"/);
  assert.match(response.body, /신고 사유를 구체적으로 적어주세요/);
  assert.match(response.body, /placeholder="의견을 남겨주세요"/);
  assert.match(response.body, /class="detail-comment-ad"/);
  const commentId = response.body.match(new RegExp(`${poemUrl}/comments/(\\d+)`))?.[1];
  assert.ok(commentId);
  response = await c.request({
    method: 'POST',
    url: `${poemUrl}/comments/${commentId}`,
    headers,
    payload: form({ _csrf: authenticatedCsrf, content: '수정한 댓글' }),
  });
  assert.equal(response.statusCode, 302);
  const editedPoemPage = await c.request({ method: 'GET', url: poemUrl });
  assert.match(editedPoemPage.body, /수정한 댓글/);
  assert.doesNotMatch(editedPoemPage.body, /좋아요/);
  const otherMember = await client(app);
  const otherCsrf = await googleLogin(otherMember, 'other-commenter@example.com', '다른회원');
  response = await otherMember.request({
    method: 'POST',
    url: `${poemUrl}/comments/${commentId}`,
    headers,
    payload: form({ _csrf: otherCsrf, content: '남의 댓글 수정' }),
  });
  assert.equal(response.statusCode, 403);
  const profileRedirect = await c.request({ method: 'GET', url: '/profile' });
  assert.match(profileRedirect.headers.location ?? '', /^\/users\/\d+$/);
  const profilePage = await c.request({ method: 'GET', url: profileRedirect.headers.location! });
  assert.equal(profilePage.statusCode, 200); assert.match(profilePage.body, /사과/);
  assert.doesNotMatch(profilePage.body, /아직 소개가 없습니다/);
  const savesPage = await c.request({ method: 'GET', url: '/profile/saves' });
  assert.equal(savesPage.statusCode, 200); assert.match(savesPage.body, /사과/);
  assert.doesNotMatch(savesPage.body, /다시 읽고 싶은 문장을 모아두었어요/);
  response = await c.request({ method: 'POST', url: `${poemUrl}/saves`, headers, payload: form({ _csrf: authenticatedCsrf, _method: 'delete' }) }); assert.equal(response.statusCode, 302);
  assert.doesNotMatch((await c.request({ method: 'GET', url: poemUrl })).body, /bookmark-button is-saved/);

  response = await c.request({ method: 'POST', url: '/logout', headers, payload: form({ _csrf: authenticatedCsrf }) });
  assert.equal(response.headers.location, '/');
  nextGoogleProfile = {
    sub: 'google-member@example.com',
    email: 'member@example.com',
    email_verified: true,
    name: 'Google 기본 이름',
  };
  response = await c.request({ method: 'GET', url: '/oauth2/authorization/google' });
  const state = new URL(response.headers.location!).searchParams.get('state');
  assert.ok(state);
  response = await c.request({
    method: 'GET',
    url: `/login/oauth2/code/google?code=test-code&state=${encodeURIComponent(state)}`,
  });
  assert.equal(response.headers.location, '/');
  assert.match((await c.request({ method: 'GET', url: '/profile' })).headers.location ?? '', /^\/users\/\d+$/);
});

test('Google login links a legacy account without asking for a nickname again', async t => {
  const db = createDatabase(':memory:');
  createUser(db, { username: 'legacy@example.com', nickname: '기존닉네임' });
  const app = await buildApp({
    db,
    sessionSecret: testSessionSecret,
    appBaseUrl: 'http://localhost:8080',
  });
  t.after(() => app.close());
  const c = await client(app);
  nextGoogleProfile = {
    sub: 'google-legacy-user',
    email: 'legacy@example.com',
    email_verified: true,
    name: '바뀐 Google 이름',
  };

  let response = await c.request({ method: 'GET', url: '/oauth2/authorization/google' });
  const state = new URL(response.headers.location!).searchParams.get('state');
  assert.ok(state);
  response = await c.request({
    method: 'GET',
    url: `/login/oauth2/code/google?code=test-code&state=${encodeURIComponent(state)}`,
  });
  assert.equal(response.headers.location, '/');
  const profileRedirect = await c.request({ method: 'GET', url: '/profile' });
  const profile = await c.request({ method: 'GET', url: profileRedirect.headers.location! });
  assert.match(profile.body, /기존닉네임/);
  assert.doesNotMatch(profile.body, /바뀐 Google 이름/);
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

test('members can report comments once and admins can review and delete them', async t => {
  const app = await testApp('admin@example.com'); t.after(() => app.close());
  const member = await client(app);
  const anonymous = await client(app);
  const authorCsrf = await googleLogin(member, 'comment-author@example.com', '댓글작성자');
  let response = await member.request({
    method: 'POST', url: '/poems', headers,
    payload: form({ _csrf: authorCsrf, word: '여름', 'lines[0]': '여유로운', 'lines[1]': '름으로 끝난다' }),
  });
  const poemUrl = response.headers.location; assert.ok(poemUrl);
  await member.request({
    method: 'POST', url: `${poemUrl}/comments`, headers,
    payload: form({ _csrf: authorCsrf, content: '신고할 댓글' }),
  });
  const detail = await member.request({ method: 'GET', url: poemUrl });
  const commentId = detail.body.match(new RegExp(`${poemUrl}/comments/(\\d+)`))?.[1];
  assert.ok(commentId);
  assert.match(detail.body, /aria-label="댓글 신고"/);

  const reporter = await client(app);
  const reporterCsrf = await googleLogin(reporter, 'comment-reporter@example.com', '신고자');
  assert.equal((await anonymous.request({
    method: 'POST', url: `${poemUrl}/comments/${commentId}/reports`,
    headers, payload: form({ reason: '부적절한 댓글입니다.' }),
  })).statusCode, 403);

  response = await reporter.request({
    method: 'POST', url: `${poemUrl}/comments/${commentId}/reports`, headers,
    payload: form({ _csrf: reporterCsrf, reason: '부적절한 댓글입니다.' }),
  });
  assert.equal(response.statusCode, 302);
  assert.match(response.headers.location ?? '', /commentReport=submitted/);

  response = await reporter.request({
    method: 'POST', url: `${poemUrl}/comments/${commentId}/reports`, headers,
    payload: form({ _csrf: reporterCsrf, reason: '중복 신고입니다.' }),
  });
  assert.match(response.headers.location ?? '', /commentReport=duplicate/);

  const admin = await client(app);
  const adminCsrf = await googleLogin(admin, 'admin@example.com', '관리자');
  response = await admin.request({ method: 'GET', url: '/admin/reports' });
  assert.match(response.body, /댓글 신고/);
  assert.match(response.body, /신고할 댓글/);
  const reportId = response.body.match(/\/admin\/comment-reports\/(\d+)\/delete-comment/)?.[1];
  assert.ok(reportId);

  response = await admin.request({
    method: 'POST', url: `/admin/comment-reports/${reportId}/delete-comment`,
    headers, payload: form({ _csrf: adminCsrf }),
  });
  assert.equal(response.statusCode, 302);
  assert.doesNotMatch((await member.request({ method: 'GET', url: poemUrl })).body, /신고할 댓글/);
});
