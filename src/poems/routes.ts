import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import {
  addComment,
  createPoem,
  getPoem,
  listComments,
  listPopularPoems,
  listPoems,
  listTrendingPoems,
  ratePoem,
  savePoem,
  unsavePoem,
} from '../db/poems.js';
import { bodyOf, numericId, queryOf } from '../shared/request.js';
import { dailyWord } from './daily-word.js';
import { validatePoem } from './validation.js';
import { matchesKeyword, toCommentView, toPoemView } from './view.js';

const validLineFilters = new Set(['2', '3', '4', '5']);

export function registerPoemRoutes(app: FastifyInstance, db: DatabaseSync): void {
  app.get('/', async (request, reply) => {
    const requestedFilter = queryOf(request).lines;
    const lineFilter = requestedFilter && validLineFilters.has(requestedFilter) ? requestedFilter : 'all';
    const accountDeleted = 'accountDeleted' in queryOf(request);
    const promptWord = dailyWord();
    const rankedPoems = listPopularPoems(db).map(toPoemView);
    const popularPoems = listTrendingPoems(db).map(toPoemView)
      .filter(poem => matchesLineFilter(poem.word, lineFilter))
      .slice(0, 5);
    const promptPoems = rankedPoems.filter(poem => poem.word === promptWord);

    return reply.view('home.njk', { accountDeleted, popularPoems, promptPoems, lineFilter, promptWord });
  });

  app.get('/poems', async (request, reply) => {
    const query = queryOf(request);
    const keyword = query.keyword ?? '';
    return reply.view('poems/list.njk', {
      ...poemPage(db, keyword, query.page),
      writeForm: { word: query.word ?? '', lines: [] },
      writeErrors: {},
    });
  });

  app.get('/poems/new', async (request, reply) => {
    const word = queryOf(request).word ?? '';
    return reply.view('poems/list.njk', {
      ...poemPage(db, '', undefined),
      writeForm: { word, lines: [] },
      writeErrors: {},
    });
  });

  app.post('/poems', async (request, reply) => {
    const { form, errors } = validatePoem(bodyOf(request));
    if (Object.keys(errors).length > 0) {
      return reply.view('poems/list.njk', {
        ...poemPage(db, '', undefined),
        writeForm: form,
        writeErrors: errors,
      });
    }

    const poemId = createPoem(db, form.word, form.lines, request.currentUser);
    return reply.redirect(`/poems/${poemId}`);
  });

  app.get('/poems/:id', async (request, reply) => {
    const poemData = getPoem(db, numericId(request), request.currentUser?.id);
    if (!poemData) return reply.view('error/404.njk', {}, 404);
    const poem = toPoemView(poemData);

    return reply.view('poems/detail.njk', {
      poem,
      comments: listComments(db, poem.id).map(toCommentView),
      commentError: null,
      reportError: null,
      reportSubmitted: queryOf(request).report === 'submitted',
      reportDuplicate: queryOf(request).report === 'duplicate',
    });
  });

  app.post('/poems/:id/comments', async (request, reply) => {
    const poemId = numericId(request);
    const poemData = getPoem(db, poemId, request.currentUser!.id);
    if (!poemData) return reply.view('error/404.njk', {}, 404);
    const poem = toPoemView(poemData);

    const content = String(bodyOf(request).content ?? '').trim();
    const commentError = validateComment(content);
    if (commentError) {
      return reply.view('poems/detail.njk', {
        poem,
        comments: listComments(db, poemId).map(toCommentView),
        commentError,
      });
    }

    addComment(db, poemId, content, request.currentUser!);
    return reply.redirect(`/poems/${poemId}`);
  });

  app.post('/poems/:id/saves', async (request, reply) => {
    const poemId = numericId(request);
    if (!getPoem(db, poemId)) return reply.view('error/404.njk', {}, 404);

    if (request.effectiveMethod === 'DELETE') unsavePoem(db, poemId, request.currentUser!.id);
    else savePoem(db, poemId, request.currentUser!.id);

    return reply.redirect(`/poems/${poemId}`);
  });

  app.delete('/poems/:id/saves', async (request, reply) => {
    const poemId = numericId(request);
    if (!getPoem(db, poemId)) return reply.view('error/404.njk', {}, 404);

    unsavePoem(db, poemId, request.currentUser!.id);
    return reply.redirect(`/poems/${poemId}`);
  });

  app.post('/poems/:id/ratings', async (request, reply) => {
    const poemId = numericId(request);
    const score = Number(bodyOf(request).score);
    if (!getPoem(db, poemId)) return reply.view('error/404.njk', {}, 404);
    if (!Number.isInteger(score) || score < 1 || score > 5) return reply.view('error/400.njk', {}, 400);

    ratePoem(db, poemId, request.currentUser!.id, score);
    return reply.redirect(`/poems/${poemId}`);
  });
}

function poemPage(db: DatabaseSync, keyword: string, requestedPage: string | undefined) {
  const pageSize = 5;
  const allPoems = listPoems(db).map(toPoemView).filter(poem => matchesKeyword(poem, keyword));
  const totalPages = Math.max(1, Math.ceil(allPoems.length / pageSize));
  const parsedPage = Number(requestedPage);
  const currentPage = Number.isInteger(parsedPage) && parsedPage > 0
    ? Math.min(parsedPage, totalPages)
    : 1;
  const start = (currentPage - 1) * pageSize;
  let firstVisiblePage = Math.max(1, currentPage - 2);
  const lastVisiblePage = Math.min(totalPages, firstVisiblePage + 4);
  firstVisiblePage = Math.max(1, lastVisiblePage - 4);

  return {
    poems: allPoems.slice(start, start + pageSize),
    keyword,
    currentPage,
    totalPages,
    pages: Array.from(
      { length: lastVisiblePage - firstVisiblePage + 1 },
      (_, index) => firstVisiblePage + index,
    ),
  };
}

function matchesLineFilter(word: string, filter: string): boolean {
  if (filter === 'all') return true;
  const length = [...word].length;
  return length === Number(filter);
}

function validateComment(content: string): string | null {
  if (!content) return '댓글을 입력해 주세요.';
  if ([...content].length > 300) return '댓글은 300자 이하여야 합니다.';
  return null;
}
