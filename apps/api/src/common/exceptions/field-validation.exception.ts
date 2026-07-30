import { BadRequestException } from '@nestjs/common';

/**
 * A 400 that carries per-field messages, matching the shape the ValidationPipe
 * produces.
 *
 * Business rules that can only be checked against the database — "you don't have
 * that much available", "that account isn't verified" — should feel identical to
 * a client-side validation failure once they reach the form. This is what makes
 * that possible: the frontend has one code path for both.
 */
export class FieldValidationException extends BadRequestException {
  constructor(fieldErrors: Record<string, string>, message = 'The submitted data is invalid.') {
    super({
      error: 'validation_failed',
      message,
      fieldErrors,
    });
  }
}
