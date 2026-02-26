import { FastifyReply } from 'fastify';

/**
 * Enterprise-level API response helpers.
 * ALL routes should use these instead of raw reply.send().
 *
 * Standard envelope:
 *   Success → { success: true, data: T, meta?: {...} }
 *   Error   → { success: false, error: { code, message, details? } }
 *   204     → no body
 */

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

/* ── Success responses ──────────────────────────────────────────────────────── */

export function sendSuccess<T>(reply: FastifyReply, data: T, statusCode = 200) {
  return reply.status(statusCode).send({ success: true, data });
}

export function sendCreated<T>(reply: FastifyReply, data: T) {
  return reply.status(201).send({ success: true, data });
}

export function sendPaginated<T>(
  reply: FastifyReply,
  data: T[],
  meta: { total: number; page: number; limit: number }
) {
  const pagination: PaginationMeta = {
    total: meta.total,
    page: meta.page,
    limit: meta.limit,
    total_pages: Math.ceil(meta.total / meta.limit),
  };
  return reply.send({ success: true, data, meta: pagination });
}

export function sendNoContent(reply: FastifyReply) {
  return reply.status(204).send();
}

export function sendAccepted<T>(reply: FastifyReply, message: string, data?: T) {
  return reply.status(202).send({ success: true, message, data });
}
