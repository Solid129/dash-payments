import { ArrowDown, ArrowUp, ListFilter, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { METHOD_LABELS } from '@/features/transactions/format';
import type { PaymentMethod, TransactionFilters, TransactionStatus } from '@/types/api';

const STATUS_OPTIONS: TransactionStatus[] = ['SUCCEEDED', 'PENDING', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'];
const METHOD_OPTIONS: PaymentMethod[] = ['CARD', 'UPI', 'WALLET', 'BANK_TRANSFER'];

const STATUS_LABELS: Record<TransactionStatus, string> = {
  SUCCEEDED: 'Succeeded',
  PENDING: 'Pending',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially refunded',
};

function toggle<T>(list: T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

export function TransactionFilterBar({
  filters,
  onChange,
  onClear,
  hasActiveFilters,
}: {
  filters: TransactionFilters;
  onChange: (partial: Partial<TransactionFilters>) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
}) {
  const [search, setSearch] = useState(filters.q ?? '');

  // Debounced so every keystroke doesn't trigger a request and a URL update.
  useEffect(() => {
    const handle = setTimeout(() => {
      if (search !== (filters.q ?? '')) onChange({ q: search || undefined });
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    setSearch(filters.q ?? '');
  }, [filters.q]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative flex-1 sm:max-w-xs">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search reference, customer…"
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <ListFilter className="h-4 w-4" />
            Status
            {filters.status?.length ? ` (${filters.status.length})` : ''}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {STATUS_OPTIONS.map((status) => (
            <DropdownMenuCheckboxItem
              key={status}
              checked={filters.status?.includes(status) ?? false}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => onChange({ status: toggle(filters.status, status) })}
            >
              {STATUS_LABELS[status]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <ListFilter className="h-4 w-4" />
            Method
            {filters.method?.length ? ` (${filters.method.length})` : ''}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Filter by method</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {METHOD_OPTIONS.map((method) => (
            <DropdownMenuCheckboxItem
              key={method}
              checked={filters.method?.includes(method) ?? false}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => onChange({ method: toggle(filters.method, method) })}
            >
              {METHOD_LABELS[method]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          aria-label="From date"
          className="w-[9.5rem]"
          value={filters.dateFrom?.slice(0, 10) ?? ''}
          onChange={(e) => onChange({ dateFrom: e.target.value || undefined })}
        />
        <span className="text-sm text-muted-foreground">–</span>
        <Input
          type="date"
          aria-label="To date"
          className="w-[9.5rem]"
          value={filters.dateTo?.slice(0, 10) ?? ''}
          onChange={(e) => onChange({ dateTo: e.target.value || undefined })}
        />
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          const currentSort = filters.sortBy === 'createdAt' ? filters.sortDir : undefined;
          if (currentSort === 'desc') {
            onChange({ sortBy: undefined, sortDir: undefined });
          } else if (currentSort === 'asc') {
            onChange({ sortBy: 'createdAt', sortDir: 'desc' });
          } else {
            onChange({ sortBy: 'createdAt', sortDir: 'asc' });
          }
        }}
        title={
          filters.sortBy === 'createdAt'
            ? `Sorted by date ${filters.sortDir === 'desc' ? 'descending' : 'ascending'}`
            : 'Click to sort by date'
        }
      >
        {filters.sortBy === 'createdAt' ? (
          <>
            {filters.sortDir === 'desc' ? (
              <ArrowDown className="h-4 w-4" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
            Date
          </>
        ) : (
          <>
            <ArrowDown className="h-4 w-4 opacity-40" />
            Date
          </>
        )}
      </Button>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  );
}
