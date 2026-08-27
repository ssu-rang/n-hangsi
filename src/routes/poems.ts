import type { FastifyInstance } from 'fastify';
import { bodyOf, numericId, queryOf } from '../request.js';
import type { Repository } from '../types.js';
import { validatePoem } from '../validation.js';

const validLineFilters = new Set(['2', '3', '4', '5']);

export function registerPoemRoutes(app: FastifyInstance, repo: Repository): void {
  app.get('/', async (request, reply) => {
    const requestedFilter = queryOf(request).lines;
    const lineFilter = requestedFilter && validLineFilters.has(requestedFilter) ? requestedFilter : 'all';
    const promptWord = '푸른하늘';
    const popularPoems = repo.listPoems()
      .filter(poem => matchesLineFilter(poem.word, lineFilter))
      .slice(0, 5);
    const promptPoems = repo.listPoems(promptWord)
      .filter(poem => poem.word === promptWord);

    return reply.view('home.njk', { popularPoems, promptPoems, lineFilter, promptWord });
  });

  app.get('/poems', async (request, reply) => {
    const query = queryOf(request);
    const keyword = query.keyword ?? '';
    return reply.view('poems/list.njk', {
      ...poemPage(repo, keyword, query.page),
      writeForm: { word: query.word ?? '', lines: [] },
      writeErrors: {},
    });
  });

  app.get('/poems/new', async (request, reply) => {
    const word = queryOf(request).word ?? '';
    return reply.view('poems/list.njk', {
      ...poemPage(repo, '', undefined),
      writeForm: { word, lines: [] },
      writeErrors: {},
    });
  });

  app.post('/poems', async (request, reply) => {
    const { form, errors } = validatePoem(bodyOf(request));
    if (Object.keys(errors).length > 0) {
      return reply.view('poems/list.njk', {
        ...poemPage(repo, '', undefined),
        writeForm: form,
        writeErrors: errors,
      });
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
      reportError: null,
      reportSubmitted: queryOf(request).report === 'submitted',
      reportDuplicate: queryOf(request).report === 'duplicate',
    });
  });

  app.post('/poems/:id/reports', async (request, reply) => {
    const poemId = numericId(request);
    const poem = repo.getPoem(poemId, request.currentUser!.id);
    if (!poem) return reply.view('error/404.njk', {}, 404);

    const reason = String(bodyOf(request).reason ?? '').trim();
    const reportError = validateReportReason(reason);
    if (reportError) {
      return reply.view('poems/detail.njk', {
        poem,
        comments: repo.comments(poemId),
        commentError: null,
        reportError,
        reportSubmitted: false,
        reportDuplicate: false,
      }, 400);
    }

    const result = repo.createReport(poemId, request.currentUser!.id, reason);
    return reply.redirect(`/poems/${poemId}?report=${result === 'created' ? 'submitted' : 'duplicate'}`);
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

function poemPage(repo: Repository, keyword: string, requestedPage: string | undefined) {
  const pageSize = 5;
  const allPoems = repo.listPoems(keyword);
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

function validateReportReason(reason: string): string | null {
  if ([...reason].length < 3) return '신고 사유를 3자 이상 입력해 주세요.';
  if ([...reason].length > 500) return '신고 사유는 500자 이하여야 합니다.';
  return null;
}
