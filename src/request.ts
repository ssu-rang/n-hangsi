import type { FastifyRequest } from 'fastify';
import type { Fields } from './types.js';

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

