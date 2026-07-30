import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { createContext, useContext, useMemo } from 'react';

import { api } from '@/lib/api-client';
import type { AuthenticatedProfile } from '@/types/api';

interface AuthContextValue {
  profile: AuthenticatedProfile | undefined;
  isLoading: boolean;
  /** True once the initial /auth/me check has resolved, success or failure. */
  isReady: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const ME_QUERY_KEY = ['auth', 'me'] as const;

async function fetchMe(): Promise<AuthenticatedProfile | null> {
  try {
    const { data } = await api.get<AuthenticatedProfile>('/auth/me');
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      return null;
    }
    throw error;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const query = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMe,
    // A 401 here means "not logged in", which fetchMe already resolves to
    // `null` — retrying would just repeat the same answer.
    retry: false,
    staleTime: 60_000,
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      profile: query.data ?? undefined,
      isLoading: query.isLoading,
      isReady: query.isFetched,
    }),
    [query.data, query.isLoading, query.isFetched],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/** Invalidates the cached profile — call after login, signup, and logout. */
export function useRefreshAuth() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
}
