import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { isPayoutInFlight, type Payout, type PayoutDetail, type PayoutLimits, type PayoutStatus } from '@/types/api';

/** Polls only while something is actually moving; stops itself once everything is terminal. */
const LIVE_POLL_MS = 2500;

export function usePayoutLimits() {
  return useQuery({
    queryKey: ['payouts', 'limits'],
    queryFn: async () => {
      const { data } = await api.get<PayoutLimits>('/payouts/limits');
      return data;
    },
    staleTime: Infinity,
  });
}

export function usePayouts(status?: PayoutStatus) {
  return useQuery({
    queryKey: ['payouts', 'list', status],
    queryFn: async () => {
      const { data } = await api.get<Payout[]>('/payouts', { params: status ? { status } : undefined });
      return data;
    },
    refetchInterval: (query) => {
      const payouts = query.state.data;
      return payouts?.some((p) => isPayoutInFlight(p.status)) ? LIVE_POLL_MS : false;
    },
  });
}

export function usePayout(id: string | undefined) {
  return useQuery({
    queryKey: ['payouts', 'detail', id],
    queryFn: async () => {
      const { data } = await api.get<PayoutDetail>(`/payouts/${id}`);
      return data;
    },
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data && isPayoutInFlight(query.state.data.status) ? LIVE_POLL_MS : false),
  });
}

export interface CreatePayoutInput {
  amountMinor: number;
  currency: string;
  bankAccountId: string;
  idempotencyKey: string;
}

export function useCreatePayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePayoutInput) => {
      const { idempotencyKey, ...body } = input;
      const { data } = await api.post<Payout>('/payouts', body, {
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payouts'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export type SimulatableEvent = 'processing' | 'paid' | 'failed';

export function useSimulatePayout(payoutId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { event: SimulatableEvent; failureCode?: string }) => {
      await api.post(`/payouts/${payoutId}/simulate`, input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payouts'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
