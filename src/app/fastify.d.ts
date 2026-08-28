import type { FastifyReply } from 'fastify';
import type { User } from '../shared/user.js';

declare module 'fastify' {
  interface Session {
    userId?: number;
    userEmail?: string;
    csrfToken?: string;
    oauthState?: string;
    pendingGoogleProfile?: {
      sub: string;
      email: string;
      suggestedNickname: string;
      expiresAt: number;
    };
  }

  interface FastifyRequest {
    currentUser: User | null;
    effectiveMethod: string;
    isAdmin: boolean;
  }

  interface FastifyReply {
    view(template: string, data?: Record<string, unknown>, status?: number): FastifyReply;
  }
}
