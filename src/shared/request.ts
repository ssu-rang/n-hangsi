import type { FastifyRequest } from 'fastify';

export type Fields = Record<string, string | undefined>;

export function fields(value: unknown): Fields {
  return value && typeof value === 'object' ? value as Fields : {};
}

export function bodyOf(request: FastifyRequest): Fields {
  return fields(request.body);
}

export function queryOf(request: FastifyRequest): Fields {
  return fields(request.query);
}

export function numericId(request: FastifyRequest): number {
  return Number(fields(request.params).id);
}
