import { formatDistanceToNow } from 'date-fns';
import { Download, Inbox } from 'lucide-react';
import { Link } from 'react-router-dom';

import { EmptyState } from '@/components/empty-state';
import { TransactionStatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import { buildTransactionsExportUrl } from '@/features/transactions/export';
import { TransactionFilterBar } from '@/features/transactions/filter-bar';
import { METHOD_LABELS } from '@/features/transactions/format';
import { useTransactionFilters } from '@/features/transactions/use-transaction-filters';
import { useTransactions } from '@/features/transactions/use-transactions';
import { canExport } from '@/lib/permissions';
import { formatMoney } from '@/lib/money';

export function TransactionsListPage() {
  const { filters, setFilters, clearFilters, hasActiveFilters } = useTransactionFilters();
  const { items, totals, isLoading, currentPage, totalPages, onPageChange } = useTransactions(filters);
  const { profile } = useAuth();

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">Search, filter, and drill into every payment and refund.</p>
        </div>
        {profile && canExport(profile.user.role) && (
          <Button variant="outline" asChild>
            <a href={buildTransactionsExportUrl(filters)} download>
              <Download className="h-4 w-4" />
              Export CSV
            </a>
          </Button>
        )}
      </div>

      <TransactionFilterBar
        filters={filters}
        onChange={setFilters}
        onClear={clearFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {totals && (
        <p className="text-sm text-muted-foreground">
          {totals.count.toLocaleString()} transaction{totals.count === 1 ? '' : 's'} ·{' '}
          {formatMoney(totals.netMinor, items[0]?.currency ?? 'INR')} net
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No transactions found"
          description={hasActiveFilters ? 'Try adjusting or clearing your filters.' : 'Transactions will appear here once you start taking payments.'}
          action={
            hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((txn) => (
                  <tr key={txn.id} className="cursor-pointer transition-colors hover:bg-accent/50">
                    <td className="p-0">
                      <Link to={`/transactions/${txn.id}`} className="block px-4 py-3">
                        <p className="font-medium">{txn.customer?.name ?? 'Unknown customer'}</p>
                        <p className="text-xs text-muted-foreground">{txn.reference}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{METHOD_LABELS[txn.method]}</td>
                    <td className="px-4 py-3">
                      <TransactionStatusBadge status={txn.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDistanceToNow(new Date(txn.createdAt), { addSuffix: true })}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium tabular-nums ${txn.type === 'REFUND' ? 'text-destructive' : ''}`}>
                      {txn.type === 'REFUND' ? '−' : ''}
                      {formatMoney(txn.amountMinor, txn.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {items.map((txn) => (
              <Link key={txn.id} to={`/transactions/${txn.id}`}>
                <Card className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{txn.customer?.name ?? 'Unknown customer'}</p>
                      <p className="text-xs text-muted-foreground">{txn.reference}</p>
                    </div>
                    <p className={`font-medium tabular-nums ${txn.type === 'REFUND' ? 'text-destructive' : ''}`}>
                      {txn.type === 'REFUND' ? '−' : ''}
                      {formatMoney(txn.amountMinor, txn.currency)}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <TransactionStatusBadge status={txn.status} />
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(txn.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center pt-4">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={onPageChange}
                disabled={isLoading}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
