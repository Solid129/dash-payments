import { API_BASE_URL } from '@/lib/api-client';
import type { TransactionFilters } from '@/types/api';

import { toParams } from './use-transactions';

/** See the payouts export helper for why this is a plain URL, not a fetch. */
export function buildTransactionsExportUrl(filters: TransactionFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(toParams(filters))) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return `${API_BASE_URL}/transactions/export${query ? `?${query}` : ''}`;
}
