import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

import { asPostgresError, PostgresError } from '../db/postgres-error';

/** The single error shape every failing request returns. */
export interface ErrorResponseBody {
  statusCode: number;
  /** Stable machine-readable code the frontend can branch on. */
  error: string;
  message: string;
  /** Per-field messages, so forms can show errors inline instead of as a toast. */
  fieldErrors?: Record<string, string>;
  path: string;
  timestamp: string;
}

/**
 * Turns everything — validation failures, thrown HttpExceptions, raw Postgres
 * errors, and genuine bugs — into one consistent envelope.
 *
 * Two deliberate choices:
 *  - Unexpected errors log the stack server-side but return a generic message.
 *    Leaking a stack trace or a SQL constraint name to the browser is an
 *    information disclosure, and the client can't act on it anyway.
 *  - Validation errors are flattened into `fieldErrors` so the frontend can
 *    attach each message to the input that caused it.
 *
 * Note what's *not* here: a "record not found" branch. Prisma used to
 * synthesize that (P2025) when an update/delete/findUniqueOrThrow affected
 * zero rows; Drizzle doesn't, so every call site that needs a 404 throws
 * `NotFoundException` itself and is handled by the ordinary `HttpException`
 * branch below — see the comment on `findOrThrow` in `db/query-helpers.ts`.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.buildBody(exception, request);

    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${body.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${body.statusCode}: ${body.message}`);
    }

    response.status(body.statusCode).json(body);
  }

  private buildBody(exception: unknown, request: Request): ErrorResponseBody {
    const base = { path: request.url, timestamp: new Date().toISOString() };

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return { ...base, statusCode: status, error: this.codeFor(status), message: payload };
      }

      const record = payload as Record<string, unknown>;
      const rawMessage = record.message;

      // Nest's ValidationPipe puts an array of strings here.
      if (Array.isArray(rawMessage)) {
        return {
          ...base,
          statusCode: status,
          error: 'validation_failed',
          message: 'The submitted data is invalid.',
          fieldErrors: this.flattenValidationMessages(rawMessage as string[]),
        };
      }

      return {
        ...base,
        statusCode: status,
        error: (record.error as string) ?? this.codeFor(status),
        message: (rawMessage as string) ?? exception.message,
        ...(record.fieldErrors ? { fieldErrors: record.fieldErrors as Record<string, string> } : {}),
      };
    }

    const postgresError = asPostgresError(exception);
    if (postgresError) {
      return { ...base, ...this.mapPostgresError(postgresError) };
    }

    return {
      ...base,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'internal_error',
      message: 'Something went wrong. Please try again.',
    };
  }

  /**
   * `class-validator` messages arrive as prose that starts with the property
   * name (`"amountMinor must be an integer"`). We key on that first token so the
   * UI can bind the message to the right input.
   */
  private flattenValidationMessages(messages: string[]): Record<string, string> {
    const fieldErrors: Record<string, string> = {};
    for (const message of messages) {
      const field = message.split(' ')[0];
      if (!fieldErrors[field]) {
        fieldErrors[field] = message;
      }
    }
    return fieldErrors;
  }

  /**
   * Maps raw Postgres SQLSTATE codes, surfaced directly on the error by the
   * `postgres` driver (`.code`, `.constraint_name`, `.column_name`, `.detail`)
   * — no ORM-level translation layer sits in between the way Prisma's error
   * codes did, so this reads the wire-protocol fields the database itself
   * sent back.
   */
  private mapPostgresError(
    error: InstanceType<typeof PostgresError> & {
      code?: string;
      constraint_name?: string;
      column_name?: string;
      detail?: string;
    },
  ): Pick<ErrorResponseBody, 'statusCode' | 'error' | 'message' | 'fieldErrors'> {
    switch (error.code) {
      case '23505': {
        // unique_violation. Composite-key violations don't populate
        // column_name, so fall back to sniffing the constraint name and the
        // human-readable detail Postgres already generated.
        const isEmail =
          error.column_name === 'email' ||
          Boolean(error.constraint_name?.includes('email')) ||
          Boolean(error.detail?.includes('(email)'));
        return {
          statusCode: HttpStatus.CONFLICT,
          error: 'already_exists',
          message: isEmail
            ? 'An account with that email address already exists.'
            : 'That record already exists.',
          ...(isEmail ? { fieldErrors: { email: 'An account with that email already exists.' } } : {}),
        };
      }
      case '23503': // foreign_key_violation
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'invalid_reference',
          message: 'The request refers to a record that does not exist.',
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'database_error',
          message: 'Something went wrong. Please try again.',
        };
    }
  }

  private codeFor(status: number): string {
    const codes: Record<number, string> = {
      400: 'bad_request',
      401: 'unauthorized',
      403: 'forbidden',
      404: 'not_found',
      409: 'conflict',
      422: 'unprocessable_entity',
      429: 'too_many_requests',
    };
    return codes[status] ?? 'error';
  }
}
