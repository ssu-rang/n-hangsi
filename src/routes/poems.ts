import type { FastifyInstance } from 'fastify';
import { bodyOf, numericId, queryOf } from '../request.js';
import type { Repository } from '../types.js';
import { validatePoem } from '../validation.js';

const validLineFilters = new Set(['2', '3', '4', '5plus']);

export function registerPoemRoutes(app: FastifyInstance, repo: Repository): void {
  app.get('/', async (request, reply) => {
    const requestedFilter = queryOf(request).lines;
    const lineFilter = requestedFilter && validLineFilters.has(requestedFilter) ? requestedFilter : 'all';
    const poems = repo.listPoems().filter(poem => matchesLineFilter(poem.word, lineFilter));

    return reply.view('home.njk', { poems, lineFilter, promptWord: '푸른하늘' });
  });

  app.get('/poems', async (request, reply) => {
    const keyword = queryOf(request).keyword ?? '';
    return reply.view('poems/list.njk', { poems: repo.listPoems(keyword), keyword });
  });

  app.get('/poems/new', async (request, reply) => {
    const word = queryOf(request).word ?? '';
    return reply.view('poems/write.njk', { form: { word, lines: [] }, errors: {} });
  });

  app.post('/poems', async (request, reply) => {
    const { form, errors } = validatePoem(bodyOf(request));
    if (Object.keys(errors).length > 0) {
      return reply.view('poems/write.njk', { form, errors });
    }

    const poemId = repo.createPoem(form.word, form.lines, request.currentUser);
    return reply.redirect(`/poems/${poemId}`);
  });

  app.get('/poems/:id', async (request, reply) => {
    const poem = repo.getPoem(numericId(request), request.currentUser?.id);
    if (!poem) return reply.view('error/404.njk', {}, 404);

    return reply.view('poems/detail.njk', {
      poem,
      comments: repo.comments(poem.id),
      commentError: null,
    });
  });

  app.post('/poems/:id/comments', async (request, reply) => {
    const poemId = numericId(request);
    const poem = repo.getPoem(poemId, request.currentUser!.id);
    if (!poem) return reply.view('error/404.njk', {}, 404);

    const content = String(bodyOf(request).content ?? '').trim();
    const commentError = validateComment(content);
    if (commentError) {
      return reply.view('poems/detail.njk', {
        poem,
        comments: repo.comments(poemId),
        commentError,
      });
    }

    repo.addComment(poemId, content, request.currentUser!);
    return reply.redirect(`/poems/${poemId}`);
  });

  app.post('/poems/:id/saves', async (request, reply) => {
    const poemId = numericId(request);
    if (!repo.getPoem(poemId)) return reply.view('error/404.njk', {}, 404);

    if (request.effectiveMethod === 'DELETE') repo.unsave(poemId, request.currentUser!.id);
    else repo.save(poemId, request.currentUser!.id);

    return reply.redirect(`/poems/${poemId}`);
  });

  app.delete('/poems/:id/saves', async (request, reply) => {
    const poemId = numericId(request);
    if (!repo.getPoem(poemId)) return reply.view('error/404.njk', {}, 404);

    repo.unsave(poemId, request.currentUser!.id);
    return reply.redirect(`/poems/${poemId}`);
  });

  app.post('/poems/:id/ratings', async (request, reply) => {
    const poemId = numericId(request);
    const score = Number(bodyOf(request).score);
    if (!repo.getPoem(poemId)) return reply.view('error/404.njk', {}, 404);
    if (!Number.isInteger(score) || score < 1 || score > 5) return reply.view('error/400.njk', {}, 400);

    repo.rate(poemId, request.currentUser!.id, score);
    return reply.redirect(`/poems/${poemId}`);
  });
}

function matchesLineFilter(word: string, filter: string): boolean {
  if (filter === 'all') return true;
  const length = [...word].length;
  return filter === '5plus' ? length >= 5 : length === Number(filter);
}

function validateComment(content: string): string | null {
  if (!content) return '댓글을 입력해 주세요.';
  if ([...content].length > 300) return '댓글은 300자 이하여야 합니다.';
  return null;
}
