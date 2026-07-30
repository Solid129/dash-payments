import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route out of the globally-applied `JwtAuthGuard`.
 *
 * The guard is global and this decorator is the exception, rather than the other
 * way round, so that forgetting to annotate a new endpoint leaves it *protected*.
 * Every use of this decorator is a deliberate, reviewable decision.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
