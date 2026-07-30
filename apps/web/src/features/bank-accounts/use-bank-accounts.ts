import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import type { BankAccount } from '@/types/api';

export function useBankAccounts() {
  return useQuery({
    queryKey: ['bank-accounts'],
    queryFn: async () => {
      const { data } = await api.get<BankAccount[]>('/bank-accounts');
      return data;
    },
  });
}
