import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { bodyOf, queryOf } from '../request.js';
import type { EmailSender, Repository } from '../types.js';
import { validateSignup } from '../validation.js';

interface GoogleToken {
  access_token: string;
}

interface GoogleUserInfo {
  sub: string;
  email?: string;
  name?: string;
}

export function registerAuthRoutes(
  app: FastifyInstance,
  repo: Repository,
  emailSender: EmailSender,
  appBaseUrl: string,
): void {
  app.get('/login', async (request, reply) => {
    const query = queryOf(request);
    return reply.view('auth/login.njk', {
      error: 'error' in query,
      oauthError: 'oauthError' in query,
      registered: 'registered' in query,
      verified: 'verified' in query,
    });
  });

  app.post('/login', async (request, reply) => {
    const body = bodyOf(request);
    const user = repo.findLocalUser(String(body.username ?? '').trim());
    const passwordMatches = user?.password
      ? await bcrypt.compare(String(body.password ?? ''), user.password)
      : false;

    if (!user || !passwordMatches) return reply.redirect('/login?error');

    await request.session.regenerate();
    request.session.userId = user.id;
    await request.session.save();
    return reply.redirect('/');
  });

  app.get('/signup', async (request, reply) => {
    return reply.view('auth/signup.njk', {
      form: {},
      errors: {},
      verificationError: 'verificationError' in queryOf(request),
    });
  });

  app.post('/signup', async (request, reply) => {
    const { form, errors } = validateSignup(bodyOf(request));
    if (repo.findLocalUser(form.email)) errors.email = '이미 사용 중인 이메일입니다.';

    if (Object.keys(errors).length > 0) {
      return reply.view('auth/signup.njk', { form, errors });
    }

    const token = randomBytes(32).toString('base64url');
    repo.savePendingEmailVerification(
      form.email,
      form.nickname,
      await bcrypt.hash(form.password, 12),
      hashToken(token),
      Date.now() + 30 * 60_000,
    );
    try {
      const verificationUrl = `${normalizedBaseUrl(appBaseUrl)}/verify-email?token=${encodeURIComponent(token)}`;
      await emailSender.sendVerification(form.email, verificationUrl);
      return reply.redirect(`/signup/check-email?email=${encodeURIComponent(form.email)}`);
    } catch (error) {
      repo.deletePendingEmailVerification(form.email);
      request.log.error(error);
      errors.email = '인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.';
      return reply.view('auth/signup.njk', { form, errors }, 503);
    }
  });

  app.get('/signup/check-email', async (request, reply) => {
    return reply.view('auth/check-email.njk', { email: queryOf(request).email ?? '' });
  });

  app.get('/verify-email', async (request, reply) => {
    const token = queryOf(request).token;
    if (!token) return reply.redirect('/signup?verificationError');
    const pending = repo.consumePendingEmailVerification(hashToken(token));
    if (!pending || repo.findLocalUser(pending.email)) {
      return reply.redirect('/signup?verificationError');
    }
    repo.createUser({
      username: pending.email,
      nickname: pending.nickname,
      password: pending.password_hash,
    });
    return reply.redirect('/login?verified');
  });

  app.post('/logout', async (request, reply) => {
    await request.session.destroy();
    return reply.redirect('/');
  });

  app.get('/oauth2/authorization/google', async (request, reply) => {
    const credentials = googleCredentials();
    if (!credentials) return reply.view('error/404.njk', {}, 404);

    const state = randomBytes(24).toString('hex');
    request.session.oauthState = state;

    const params = new URLSearchParams({
      client_id: credentials.clientId,
      redirect_uri: googleCallbackUrl(),
      response_type: 'code',
      scope: 'openid profile email',
      state,
    });
    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  app.get('/login/oauth2/code/google', async (request, reply) => {
    const query = queryOf(request);
    const credentials = googleCredentials();
    const validState = query.state && query.state === request.session.oauthState;
    if (!credentials || !query.code || !validState) return reply.redirect('/login?oauthError');

    delete request.session.oauthState;
    try {
      const profile = await fetchGoogleProfile(query.code, googleCallbackUrl(), credentials);
      let user = repo.findProviderUser('google', profile.sub);

      if (!user) {
        const username = profile.email ?? `google-${profile.sub}`;
        const nickname = String(profile.name ?? profile.email?.split('@')[0] ?? '사용자').slice(0, 30);
        user = repo.createUser({ username, nickname, provider: 'google', providerUserId: profile.sub });
      }

      await request.session.regenerate();
      request.session.userId = user.id;
      await request.session.save();
      return reply.redirect('/');
    } catch {
      return reply.redirect('/login?oauthError');
    }
  });
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function normalizedBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('APP_BASE_URL must use HTTP or HTTPS');
  }
  return url.toString().replace(/\/$/, '');
}

function googleCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

function googleCallbackUrl(): string {
  const configured = process.env.GOOGLE_REDIRECT_URI;
  if (!configured) throw new Error('GOOGLE_REDIRECT_URI is required for Google OAuth');
  return configured;
}

async function fetchGoogleProfile(
  code: string,
  redirectUri: string,
  credentials: { clientId: string; clientSecret: string },
): Promise<GoogleUserInfo> {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenResponse.ok) throw new Error('Google token exchange failed');

  const token = await tokenResponse.json() as GoogleToken;
  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!profileResponse.ok) throw new Error('Google user info request failed');

  return profileResponse.json() as Promise<GoogleUserInfo>;
}
