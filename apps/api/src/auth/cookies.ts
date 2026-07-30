import { CookieOptions, Response } from 'express';

/**
 * Cookie handling for the token pair.
 *
 * Tokens live in cookies rather than in `localStorage` because `httpOnly` means
 * JavaScript — including any script that manages to run on the page — cannot read
 * them. That trades XSS token theft for CSRF exposure, which is the better trade
 * because CSRF has a complete, cheap defence: `sameSite`.
 */

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** Must match the controller route, so the browser only sends it where it's used. */
export const REFRESH_COOKIE_PATH = '/api/auth';

function baseOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    // 'lax' still blocks cross-site POSTs (the CSRF case that matters) while
    // surviving top-level navigation back into the app. 'strict' would log the
    // user out every time they followed a link in from elsewhere.
    sameSite: 'lax',
    secure: isProduction,
  };
}

export function setAuthCookies(
  response: Response,
  tokens: { accessToken: string; refreshToken: string },
  options: { isProduction: boolean; accessTtlMs: number; refreshTtlMs: number },
): void {
  const base = baseOptions(options.isProduction);

  response.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...base,
    path: '/',
    maxAge: options.accessTtlMs,
  });

  // Scoped to the auth routes: the refresh token is not attached to ordinary API
  // calls, so it is exposed on far fewer requests than the access token.
  response.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...base,
    path: REFRESH_COOKIE_PATH,
    maxAge: options.refreshTtlMs,
  });
}

export function clearAuthCookies(response: Response, isProduction: boolean): void {
  const base = baseOptions(isProduction);
  // Path must match what was set, or the browser silently keeps the old cookie.
  response.clearCookie(ACCESS_TOKEN_COOKIE, { ...base, path: '/' });
  response.clearCookie(REFRESH_TOKEN_COOKIE, { ...base, path: REFRESH_COOKIE_PATH });
}

/** `'15m'` -> `900000`. Supports the s/m/h/d suffixes used in config. */
export function durationToMs(duration: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(duration.trim());
  if (!match) {
    throw new Error(`Unsupported duration format: "${duration}" (expected e.g. "15m", "7d")`);
  }
  const multipliers = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;
  return Number(match[1]) * multipliers[match[2] as keyof typeof multipliers];
}
