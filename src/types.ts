import type { DatabaseSync } from 'node:sqlite';
import type { FastifyReply } from 'fastify';
import type { User, createRepository } from './repository.js';

export interface AppOptions {
  logger?: boolean;
  db?: DatabaseSync;
  databasePath?: string;
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
  }

  interface FastifyReply {
    view(template: string, data?: Record<string, unknown>, status?: number): FastifyReply;
  }
}

