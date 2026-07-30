import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { getApiError } from '@/lib/api-client';

/**
 * Maps the API's `fieldErrors` envelope onto react-hook-form fields.
 *
 * This is what makes a server-side rejection — "that account isn't verified",
 * "exceeds your balance" — render exactly like a client-side validation failure:
 * inline, under the field, instead of a toast the user has to correlate with a
 * form by themselves. Falls back to `root` (a form-level message) if the error
 * doesn't name a field the form actually has.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly string[],
): string | undefined {
  const body = getApiError(error);
  if (!body) return 'Something went wrong. Please try again.';

  if (body.fieldErrors) {
    let matchedAny = false;
    for (const [field, message] of Object.entries(body.fieldErrors)) {
      if (knownFields.includes(field)) {
        setError(field as Path<T>, { type: 'server', message });
        matchedAny = true;
      }
    }
    if (matchedAny) return undefined;
  }

  return body.message;
}
