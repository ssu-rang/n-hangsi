import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { listPoemsByAuthor, listSavedPoems } from '../db/poems.js';
import { findUserById, getProfileStats } from '../db/users.js';
import { toPoemView } from '../poems/view.js';
import { numericId } from '../shared/request.js';

export function registerUserRoutes(app: FastifyInstance, db: DatabaseSync): void {
  app.get('/users/:id', async (request, reply) => {
    const userId = numericId(request);
    const user = findUserById(db, userId);
    if (!user) return reply.view('error/404.njk', {}, 404);

    const authoredPoems = listPoemsByAuthor(db, userId).map(toPoemView);
    const stats = getProfileStats(db, userId);

    return reply.view('users/profile.njk', {
      user: {
        id: user.id,
        nickname: user.nickname,
        bio: user.bio,
        poemCount: authoredPoems.length,
        averageRating: stats.averageRating === null ? null : roundRating(stats.averageRating),
        ratingCount: stats.ratingCount,
      },
      poems: authoredPoems,
    });
  });

  app.get('/profile', async (request, reply) => {
    return reply.redirect(`/users/${request.currentUser!.id}`);
  });

  app.get('/profile/saves', async (request, reply) => {
    return reply.view('users/saves.njk', {
      poems: listSavedPoems(db, request.currentUser!.id).map(toPoemView),
    });
  });
}

function roundRating(value: number): number {
  return Number(Number(value).toFixed(1));
}
