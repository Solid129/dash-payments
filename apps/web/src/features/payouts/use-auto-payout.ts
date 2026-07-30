import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import type { AutoPayoutSchedule } from '@/types/api';

export function useAutoPayoutSchedule() {
  return useQuery({
    queryKey: ['payout-schedule'],
    queryFn: async () => {
      const { data } = await api.get<AutoPayoutSchedule>('/payout-schedule');
      return data;
    },
  });
}

export interface UpdateAutoPayoutScheduleInput {
  dailyEnabled: boolean;
  thresholdEnabled: boolean;
  thresholdMinor?: number;
  bankAccountId?: string;
}

export function useUpdateAutoPayoutSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateAutoPayoutScheduleInput) => {
      const { data } = await api.put<AutoPayoutSchedule>('/payout-schedule', input);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payout-schedule'] });
    },
  });
}

export function useTriggerAutoPayoutNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.post('/payout-schedule/trigger-now');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payout-schedule'] });
      void queryClient.invalidateQueries({ queryKey: ['payouts'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
