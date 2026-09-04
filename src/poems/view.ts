import type { CommentData, PoemData } from '../db/poems.js';
import { formatKoreaDateTime } from '../shared/date-time.js';

export type PoemView = Omit<PoemData, 'createdAt'> & {
  createdAt: string | null;
};

export type CommentView = Omit<CommentData, 'createdAt'> & {
  createdAt: string | null;
};

export function toPoemView(poem: PoemData): PoemView {
  return {
    ...poem,
    rating: Number(poem.rating.toFixed(1)),
    createdAt: formatKoreaDateTime(poem.createdAt),
  };
}

export function toCommentView(comment: CommentData): CommentView {
  return { ...comment, createdAt: formatKoreaDateTime(comment.createdAt) };
}

export function matchesKeyword(poem: PoemView, query: string): boolean {
  const keyword = query.trim().toLocaleLowerCase();
  return !keyword || poem.word.toLocaleLowerCase().includes(keyword)
    || poem.lines.some(line => line.toLocaleLowerCase().includes(keyword));
}
