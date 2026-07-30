import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { PaymentMethod, TransactionFilters, TransactionStatus } from '@/types/api';

/**
 * Transaction filters live in the URL query string rather than component state,
 * so a filtered view is a link a merchant can bookmark or share, and the browser
 * back button steps through filter changes the way it steps through pages.
 */
export function useTransactionFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<TransactionFilters>(() => {
    const status = searchParams.get('status');
    const method = searchParams.get('method');
    return {
      status: status ? (status.split(',') as TransactionStatus[]) : undefined,
      method: method ? (method.split(',') as PaymentMethod[]) : undefined,
      dateFrom: searchParams.get('dateFrom') ?? undefined,
      dateTo: searchParams.get('dateTo') ?? undefined,
      amountMin: searchParams.get('amountMin') ? Number(searchParams.get('amountMin')) : undefined,
      amountMax: searchParams.get('amountMax') ? Number(searchParams.get('amountMax')) : undefined,
      q: searchParams.get('q') ?? undefined,
    };
  }, [searchParams]);

  function setFilters(partial: Partial<TransactionFilters>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(partial)) {
      if (value === undefined || value === null || (Array.isArray(value) && value.length === 0) || value === '') {
        next.delete(key);
      } else {
        next.set(key, Array.isArray(value) ? value.join(',') : String(value));
      }
    }
    setSearchParams(next, { replace: true });
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  const hasActiveFilters = Object.values(filters).some((v) => v !== undefined);

  return { filters, setFilters, clearFilters, hasActiveFilters };
}
