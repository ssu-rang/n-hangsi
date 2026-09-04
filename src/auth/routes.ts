import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { bodyOf, queryOf } from '../shared/request.js';
import { createUser, findOrLinkGoogleUser } from '../db/users.js';

type GoogleUserInfo = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

export function registerAuthRoutes(app: FastifyInstance, db: DatabaseSync): void {
  app.get('/login', async (request, reply) => {
    return reply.view('auth/login.njk', { oauthError: 'oauthError' in queryOf(request) });
  });

  app.get('/signup', async (_request, reply) => reply.redirect('/login'));

  app.get('/signup/nickname', async (request, reply) => {
    const profile = request.session.pendingGoogleProfile;
    if (!profile || profile.expiresAt <= Date.now()) {
      delete request.session.pendingGoogleProfile;
      return reply.redirect('/login');
    }
    return reply.view('auth/nickname.njk', {
      nickname: profile.suggestedNickname,
      error: 'error' in queryOf(request),
    });
  });

  app.post('/signup/nickname', async (request, reply) => {
    const profile = request.session.pendingGoogleProfile;
    if (!profile || profile.expiresAt <= Date.now()) {
      delete request.session.pendingGoogleProfile;
      return reply.redirect('/login');
    }

    const nickname = String(bodyOf(request).nickname ?? '').trim();
    if ([...nickname].length < 1 || [...nickname].length > 30) {
      return reply.view('auth/nickname.njk', {
        nickname,
        error: true,
      }, 400);
    }

    const existingUser = findOrLinkGoogleUser(db, profile.sub, profile.email);
    const user = existingUser ?? createUser(db, {
      username: profile.email,
      nickname,
      provider: 'google',
      providerUserId: profile.sub,
    });

    await request.session.regenerate();
    request.session.userId = user.id;
    request.session.userEmail = profile.email;
    await request.session.save();
    return reply.redirect('/');
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
      if (!profile.email || profile.email_verified !== true) {
        throw new Error('Google email is missing or unverified');
      }

      const user = findOrLinkGoogleUser(db, profile.sub, profile.email);
      if (user) {
        await request.session.regenerate();
        request.session.userId = user.id;
        request.session.userEmail = profile.email;
        await request.session.save();
        return reply.redirect('/');
      }

      await request.session.regenerate();
      request.session.pendingGoogleProfile = {
        sub: profile.sub,
        email: profile.email,
        suggestedNickname: String(profile.name ?? profile.email.split('@')[0] ?? '사용자').slice(0, 30),
        expiresAt: Date.now() + 10 * 60_000,
      };
      await request.session.save();
      return reply.redirect('/signup/nickname');
    } catch (error) {
      request.log.warn({ err: error }, 'Google OAuth login failed');
      return reply.redirect('/login?oauthError');
    }
  });
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

  const token = await tokenResponse.json() as { access_token: string };
  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!profileResponse.ok) throw new Error('Google user info request failed');

  return profileResponse.json() as Promise<GoogleUserInfo>;
}
