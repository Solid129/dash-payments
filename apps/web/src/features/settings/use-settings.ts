import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import type { ReportFrequency, ReportSubscription, SendReportNowResponse } from '@/types/api';

export function useReportSubscription() {
  return useQuery({
    queryKey: ['reports', 'subscription'],
    queryFn: async () => {
      const { data } = await api.get<ReportSubscription>('/reports/subscription');
      return data;
    },
  });
}

export function useUpdateReportSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (frequency: ReportFrequency) => {
      const { data } = await api.put<ReportSubscription>('/reports/subscription', { frequency });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reports', 'subscription'] });
    },
  });
}

export function useSendTestReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<SendReportNowResponse>('/reports/subscription/send-now');
      return data;
    },
    onSuccess: () => {
      // Only mutates `lastSentAt` when the subscription is genuinely enabled,
      // but invalidating unconditionally is cheap and always correct.
      void queryClient.invalidateQueries({ queryKey: ['reports', 'subscription'] });
    },
  });
}
