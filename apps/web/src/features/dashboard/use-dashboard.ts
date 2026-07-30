import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import type { DashboardSummary, MethodBreakdownPoint, RecentTransaction, RevenuePoint, VolumePoint } from '@/types/api';

export function useDashboardSummary(days = 30) {
  return useQuery({
    queryKey: ['dashboard', 'summary', days],
    queryFn: async () => {
      const { data } = await api.get<DashboardSummary>('/dashboard/summary', { params: { days } });
      return data;
    },
    // Cheap and central to the page; a short refetch keeps the balance fresh
    // after a payout's webhook lands without needing manual invalidation wired
    // everywhere.
    refetchInterval: 15_000,
  });
}

export function useVolumeSeries(days = 30) {
  return useQuery({
    queryKey: ['dashboard', 'volume-series', days],
    queryFn: async () => {
      const { data } = await api.get<VolumePoint[]>('/dashboard/volume-series', { params: { days } });
      return data;
    },
  });
}

export function useRevenueSeries(days = 30) {
  return useQuery({
    queryKey: ['dashboard', 'revenue-series', days],
    queryFn: async () => {
      const { data } = await api.get<RevenuePoint[]>('/dashboard/revenue-series', { params: { days } });
      return data;
    },
  });
}

export function useRevenueByMethod(days = 30) {
  return useQuery({
    queryKey: ['dashboard', 'revenue-by-method', days],
    queryFn: async () => {
      const { data } = await api.get<MethodBreakdownPoint[]>('/dashboard/revenue-by-method', {
        params: { days },
      });
      return data;
    },
  });
}

export function useRecentTransactions(limit = 5) {
  return useQuery({
    queryKey: ['dashboard', 'recent-transactions', limit],
    queryFn: async () => {
      const { data } = await api.get<RecentTransaction[]>('/dashboard/recent-transactions', {
        params: { limit },
      });
      return data;
    },
    refetchInterval: 15_000,
  });
}
