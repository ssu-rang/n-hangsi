import type { CommentData, PoemData } from '../db/poems.js';

export interface PoemView extends Omit<PoemData, 'createdAt'> {
  createdAt: string | null;
}

export interface CommentView extends Omit<CommentData, 'createdAt'> {
  createdAt: string | null;
}

export function toPoemView(poem: PoemData): PoemView {
  return {
    ...poem,
    rating: Number(poem.rating.toFixed(1)),
    createdAt: formatDateTime(poem.createdAt),
  };
}

export function toCommentView(comment: CommentData): CommentView {
  return { ...comment, createdAt: formatDateTime(comment.createdAt) };
}

export function matchesKeyword(poem: PoemView, query: string): boolean {
  const keyword = query.trim().toLocaleLowerCase();
  return !keyword || poem.word.toLocaleLowerCase().includes(keyword)
    || poem.lines.some(line => line.toLocaleLowerCase().includes(keyword));
}

function formatDateTime(value: string | null): string | null {
  return value ? value.slice(0, 16).replaceAll('-', '.').replace('T', ' ') : null;
}
