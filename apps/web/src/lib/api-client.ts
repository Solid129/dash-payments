import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  // Tokens live in httpOnly cookies, not in JS-readable storage — this is what
  // makes the browser attach them at all.
  withCredentials: true,
});

/** The error envelope every failing API response shares; see the backend's AllExceptionsFilter. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  fieldErrors?: Record<string, string>;
  path: string;
  timestamp: string;
}

export function getApiError(error: unknown): ApiErrorBody | undefined {
  if (axios.isAxiosError(error)) {
    return error.response?.data as ApiErrorBody | undefined;
  }
  return undefined;
}

/**
 * Routes that must never trigger a refresh-and-retry: refresh itself (an
 * infinite loop waiting to happen) and login/signup, where a 401 is a real
 * "wrong credentials" answer, not an expired session.
 */
const NO_REFRESH_PATHS = ['/auth/refresh', '/auth/login', '/auth/signup'];

/**
 * A single in-flight refresh shared by every request that hits it concurrently.
 *
 * Without this, three components independently fetching on mount would each see
 * a 401, each call /auth/refresh, and the second and third refreshes would race
 * against the first — presenting a token that's already been rotated out, which
 * the backend correctly treats as reuse and revokes the whole session. Coalescing
 * to one promise is what makes concurrent 401s safe instead of self-inflicted.
 */
let refreshPromise: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/refresh')
      .then(() => undefined)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    const isAuthRoute = NO_REFRESH_PATHS.some((path) => config?.url?.includes(path));

    if (error.response?.status !== 401 || !config || config._retried || isAuthRoute) {
      throw error;
    }

    config._retried = true;

    try {
      await refreshSession();
      return api(config);
    } catch {
      // The refresh itself failed — the session is genuinely over. Let the
      // original 401 propagate so callers (e.g. the auth context) can react by
      // sending the user to /login.
      throw error;
    }
  },
);
