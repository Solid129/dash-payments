import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import type { AuthenticatedProfile } from '@/types/api';

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
      const { data } = await api.post<AuthenticatedProfile>('/auth/login', input);
      return data;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(ME_QUERY_KEY, profile);
    },
  });
}

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SignupInput) => {
      const { data } = await api.post<AuthenticatedProfile>('/auth/signup', input);
      return data;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(ME_QUERY_KEY, profile);
    },
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AcceptInviteInput) => {
      const { data } = await api.post<AuthenticatedProfile>('/auth/accept-invite', input);
      return data;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(ME_QUERY_KEY, profile);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.post('/auth/logout');
    },
    onSuccess: () => {
      queryClient.setQueryData(ME_QUERY_KEY, null);
      // Every other cached response belonged to the session that just ended.
      queryClient.clear();
    },
  });
}
