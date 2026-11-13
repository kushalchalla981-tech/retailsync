/**
 * HTTP contract shared by every /api route: one error envelope, zod input
 * validation, and the id primitives that keep malformed values out of SQL.
 *
 * Error envelope (every non-2xx response):
 *   { "error": { "code": "UPPER_SNAKE", "message": "...", "details"?: {...}, "requestId": "..." } }
 *
 * - AppError                      -> its own status / code / message / details
 * - Fastify built-in 4xx errors   -> passed through with their own code (e.g. FST_ERR_CTP_INVALID_JSON)
 * - anything else                 -> 500 INTERNAL_ERROR, fixed message; the real
 *                                    error is logged server-side only, never echoed
 * - unknown route                 -> 404 ROUTE_NOT_FOUND
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

export type ErrorDetails = Record<string, unknown>;

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: ErrorDetails | undefined;

  constructor(statusCode: number, code: string, message: string, details?: ErrorDetails) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function notFound(code: string, message: string): AppError {
  return new AppError(404, code, message);
}

export function conflict(code: string, message: string, details?: ErrorDetails): AppError {
  return new AppError(409, code, message, details);
}

export function unprocessable(code: string, message: string, details?: ErrorDetails): AppError {
  return new AppError(422, code, message, details);
}

export const INTERNAL_ERROR_MESSAGE = 'Internal server error';

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: ErrorDetails;
    requestId: string;
  };
}

export function errorBody(request: FastifyRequest, code: string, message: string, details?: ErrorDetails): ErrorBody {
  return {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
      requestId: request.id,
    },
  };
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

export type InputLocation = 'params' | 'query' | 'body';

export interface ValidationIssue {
  path: string;
  message: string;
}

/**
 * Parse request input with a zod schema. On failure throws 400
 * VALIDATION_FAILED with `details.issues` whose paths are prefixed by the
 * input location (e.g. `query.limit`). Rejected values are never echoed.
 */
export function parseInput<S extends z.ZodType>(schema: S, value: unknown, where: InputLocation): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
    path: [where, ...issue.path.map((segment) => String(segment))].join('.'),
    message: issue.message,
  }));
  throw new AppError(400, 'VALIDATION_FAILED', 'Request validation failed', { issues });
}

/** BIGINT id as a decimal string: positive, no leading zero, at most 18 digits (always fits BIGINT). */
export const dbId = z.string().regex(/^[1-9][0-9]{0,17}$/, 'Expected a positive integer id');

/** JSON-body id: a decimal string, or a positive safe integer normalized to a string. */
export const bodyDbId = z.union([
  dbId,
  z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .transform((value) => String(value)),
]);

/** Cart / order / customer ids (gen_random_uuid()). */
export const uuidId = z.uuid();

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

function clientErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' && Number.isInteger(status) && status >= 400 && status < 500 ? status : undefined;
}

function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  details?: ErrorDetails,
): FastifyReply {
  return reply.code(status).type('application/json; charset=utf-8').send(errorBody(request, code, message, details));
}

/** Install the error and not-found handlers. Call before registering any route plugin. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof AppError) {
      const log = error.statusCode >= 500 ? request.log.error.bind(request.log) : request.log.info.bind(request.log);
      log({ code: error.code, statusCode: error.statusCode }, error.message);
      return sendError(request, reply, error.statusCode, error.code, error.message, error.details);
    }

    const status = clientErrorStatus(error);
    if (status !== undefined) {
      const fastifyError = error as { code?: unknown; message?: unknown };
      const code = typeof fastifyError.code === 'string' && fastifyError.code.length > 0 ? fastifyError.code : 'BAD_REQUEST';
      const message = typeof fastifyError.message === 'string' ? fastifyError.message : 'Bad request';
      request.log.info({ code, statusCode: status }, message);
      return sendError(request, reply, status, code, message);
    }

    request.log.error({ err: error }, 'unhandled error');
    return sendError(request, reply, 500, 'INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE);
  });

  app.setNotFoundHandler((request, reply) => {
    request.log.info({ method: request.method, url: request.url }, 'route not found');
    return sendError(request, reply, 404, 'ROUTE_NOT_FOUND', `Route ${request.method} ${request.url.split('?')[0]} not found`);
  });
}
