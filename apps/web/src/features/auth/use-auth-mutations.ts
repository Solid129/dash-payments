import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { getRefreshToken, setTokens, clearTokens } from '@/lib/token-storage';
import type { AuthResponse } from '@/types/api';

import { ME_QUERY_KEY } from './auth-context';

export interface LoginInput {
  email: string;
  password: string;
}

export interface SignupInput {
  email: string;
  password: string;
  fullName: string;
  businessName: string;
  country?: string;
  currency?: string;
}

export interface AcceptInviteInput {
  token: string;
  password: string;
  fullName: string;
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LoginInput) => {
      const { data } = await api.post<AuthResponse>('/auth/login', input);
      return data;
    },
    onSuccess: (data) => {
      setTokens(data);
      queryClient.setQueryData(ME_QUERY_KEY, data.profile);
    },
  });
}

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SignupInput) => {
      const { data } = await api.post<AuthResponse>('/auth/signup', input);
      return data;
    },
    onSuccess: (data) => {
      setTokens(data);
      queryClient.setQueryData(ME_QUERY_KEY, data.profile);
    },
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AcceptInviteInput) => {
      const { data } = await api.post<AuthResponse>('/auth/accept-invite', input);
      return data;
    },
    onSuccess: (data) => {
      setTokens(data);
      queryClient.setQueryData(ME_QUERY_KEY, data.profile);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.post('/auth/logout', { refreshToken: getRefreshToken() });
    },
    onSuccess: () => {
      clearTokens();
      queryClient.setQueryData(ME_QUERY_KEY, null);
      queryClient.clear();
    },
  });
}
