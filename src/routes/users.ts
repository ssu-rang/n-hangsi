import type { FastifyInstance } from 'fastify';
import { numericId } from '../request.js';
import type { Repository } from '../types.js';

export function registerUserRoutes(app: FastifyInstance, repo: Repository): void {
  app.get('/users/:id', async (request, reply) => {
    const profile = repo.profile(numericId(request));
    return profile
      ? reply.view('users/profile.njk', profile)
      : reply.view('error/404.njk', {}, 404);
  });

  app.get('/profile', async (request, reply) => {
    return reply.redirect(`/users/${request.currentUser!.id}`);
  });

  app.get('/profile/saves', async (request, reply) => {
    return reply.view('users/saves.njk', {
      poems: repo.saved(request.currentUser!.id),
    });
  });
}
