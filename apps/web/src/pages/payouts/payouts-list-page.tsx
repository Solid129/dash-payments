import { format } from 'date-fns';
import { Download, Plus, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';

import { EmptyState } from '@/components/empty-state';
import { PayoutStatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import { useDashboardSummary } from '@/features/dashboard/use-dashboard';
import { usePayouts } from '@/features/payouts/use-payouts';
import { buildPayoutsExportUrl } from '@/features/payouts/export';
import { canExport, canInitiatePayouts } from '@/lib/permissions';
import { formatMoney } from '@/lib/money';

export function PayoutsListPage() {
  const payouts = usePayouts();
  const summary = useDashboardSummary();
  const { profile } = useAuth();
  const role = profile?.user.role;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payouts</h1>
          <p className="text-sm text-muted-foreground">Move your available balance to your bank account.</p>
        </div>
        <div className="flex gap-2">
          {role && canExport(role) && (
            <Button variant="outline" asChild>
              <a href={buildPayoutsExportUrl()} download>
                <Download className="h-4 w-4" />
                Export CSV
              </a>
            </Button>
          )}
          {role && canInitiatePayouts(role) && (
            <Button asChild>
              <Link to="/payouts/new">
                <Plus className="h-4 w-4" />
                New payout
              </Link>
            </Button>
          )}
        </div>
      </div>

      {summary.data && (
        <Card className="flex flex-col gap-1 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Available for payout</p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatMoney(summary.data.balance.availableMinor, summary.data.currency)}
            </p>
          </div>
          {summary.data.balance.pendingMinor > 0 && (
            <p className="text-sm text-muted-foreground">
              +{formatMoney(summary.data.balance.pendingMinor, summary.data.currency)} settling soon
            </p>
          )}
        </Card>
      )}

      {payouts.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !payouts.data?.length ? (
        <EmptyState
          icon={Wallet}
          title="No payouts yet"
          description="Once you initiate a payout, you'll be able to track its progress here."
          action={
            role && canInitiatePayouts(role) ? (
              <Button asChild size="sm">
                <Link to="/payouts/new">New payout</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="divide-y overflow-hidden">
          {payouts.data.map((payout) => (
            <Link
              key={payout.id}
              to={`/payouts/${payout.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent/50"
            >
              <div>
                <p className="font-medium tabular-nums">{formatMoney(payout.amountMinor, payout.currency)}</p>
                <p className="text-xs text-muted-foreground">
                  {payout.bankAccount.bankName} •••• {payout.bankAccount.last4} · {format(new Date(payout.createdAt), 'PP')}
                </p>
              </div>
              <PayoutStatusBadge status={payout.status} />
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
