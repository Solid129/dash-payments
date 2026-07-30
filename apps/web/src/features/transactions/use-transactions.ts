import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api-client';
import type { TransactionDetail, TransactionFilters, TransactionListResponse } from '@/types/api';

export function toParams(filters: TransactionFilters, cursor?: string) {
  return {
    ...filters,
    status: filters.status?.length ? filters.status.join(',') : undefined,
    method: filters.method?.length ? filters.method.join(',') : undefined,
    cursor,
  };
}

const DEFAULT_PAGE_SIZE = 25;

export function useTransactions(filters: TransactionFilters, initialPage: number = 1) {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [cursorMap, setCursorMap] = useState<Record<number, string | undefined>>({ 1: undefined });
  const [totalCount, setTotalCount] = useState(0);
  const [isFetchingCursors, setIsFetchingCursors] = useState(false);

  const cursor = cursorMap[currentPage];
  const totalPages = Math.ceil(totalCount / DEFAULT_PAGE_SIZE);

  const query = useQuery({
    queryKey: ['transactions', filters, currentPage, cursor],
    queryFn: async () => {
      const { data } = await api.get<TransactionListResponse>('/transactions', {
        params: toParams(filters, cursor),
      });

      // Cache the cursor for the next page
      setCursorMap((prev) => ({
        ...prev,
        [currentPage + 1]: data.nextCursor ?? undefined,
      }));

      // Update total count from the first page's data
      if (currentPage === 1 || totalCount === 0) {
        setTotalCount(data.totals.count);
      }

      return data;
    },
  });

  const fetchCursorSequentially = async (targetPage: number) => {
    setIsFetchingCursors(true);

    try {
      // Find the last page we have cached
      const lastCachedPage = Math.max(...Object.keys(cursorMap).map(Number).filter(k => cursorMap[k] !== undefined || k === 1), 1);
      let currentFetchPage = lastCachedPage;
      let nextCursor = cursorMap[currentFetchPage];

      // Fetch pages sequentially until we reach the target page
      while (currentFetchPage < targetPage) {
        currentFetchPage += 1;

        const { data } = await api.get<TransactionListResponse>('/transactions', {
          params: toParams(filters, nextCursor),
        });

        // Cache the cursor for the NEXT page (because nextCursor is the cursor for the page we just fetched)
        nextCursor = data.nextCursor ?? undefined;
        setCursorMap((prev) => ({
          ...prev,
          [currentFetchPage + 1]: nextCursor,
        }));

        // Stop if we've reached the end
        if (!data.nextCursor) {
          break;
        }
      }

      // Now navigate to the target page
      setCurrentPage(targetPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error('Failed to fetch page cursors:', error);
    } finally {
      setIsFetchingCursors(false);
    }
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && (totalPages === 0 || page <= totalPages)) {
      // If we already have the cursor for this page, navigate directly
      if (cursorMap[page] !== undefined || page === 1) {
        setCurrentPage(page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        // Otherwise, fetch cursors sequentially to get to this page
        void fetchCursorSequentially(page);
      }
    }
  };

  // Reset to page 1 when filters change
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    setCurrentPage(1);
    setCursorMap({ 1: undefined });
    setTotalCount(0);
  }, [filterKey]);

  return {
    data: query.data,
    isLoading: query.isLoading || isFetchingCursors,
    currentPage,
    totalPages,
    onPageChange: handlePageChange,
    items: query.data?.items ?? [],
    totals: query.data?.totals,
  };
}

export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: ['transactions', id],
    queryFn: async () => {
      const { data } = await api.get<TransactionDetail>(`/transactions/${id}`);
      return data;
    },
    enabled: Boolean(id),
  });
}
