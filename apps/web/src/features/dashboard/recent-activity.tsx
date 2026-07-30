import { formatDistanceToNow } from 'date-fns';
import { Inbox } from 'lucide-react';
import { Link } from 'react-router-dom';

import { EmptyState } from '@/components/empty-state';
import { TransactionStatusBadge } from '@/components/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { METHOD_ICONS } from '@/features/transactions/format';
import { formatMoney } from '@/lib/money';
import type { RecentTransaction } from '@/types/api';

export function RecentActivityList({ items, isLoading }: { items?: RecentTransaction[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (!items?.length) {
    return <EmptyState icon={Inbox} title="No activity yet" description="Transactions will show up here as they come in." />;
  }

  return (
    <ul className="divide-y">
      {items.map((txn) => {
        const Icon = METHOD_ICONS[txn.method];
        const isRefund = txn.type === 'REFUND';
        return (
          <li key={txn.id}>
            <Link
              to={`/transactions/${txn.id}`}
              className="flex items-center gap-3 py-3 transition-colors hover:bg-accent/50 -mx-2 px-2 rounded-md"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{txn.customer?.name ?? 'Unknown customer'}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(txn.createdAt), { addSuffix: true })}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <p className={isRefund ? 'text-sm font-medium text-destructive' : 'text-sm font-medium'}>
                  {isRefund ? '−' : ''}
                  {formatMoney(txn.amountMinor, txn.currency)}
                </p>
                <TransactionStatusBadge status={txn.status} />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
