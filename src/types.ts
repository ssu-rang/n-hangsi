import type { DatabaseSync } from 'node:sqlite';
import type { FastifyReply } from 'fastify';
import type { User, createRepository } from './repository.js';

export interface AppOptions {
  logger?: boolean;
  db?: DatabaseSync;
  databasePath?: string;
  sessionSecret?: string;
  trustProxy?: boolean | string | string[];
  emailSender?: EmailSender;
  appBaseUrl?: string;
  adminEmail?: string;
}

export interface EmailSender {
  sendVerification(email: string, verificationUrl: string): Promise<void>;
}

export type Repository = ReturnType<typeof createRepository>;
export type Fields = Record<string, string | undefined>;

declare module 'fastify' {
  interface Session {
    userId?: number;
    csrfToken?: string;
    oauthState?: string;
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
