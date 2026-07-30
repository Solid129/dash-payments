import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import {
  useDashboardSummary,
  useRecentTransactions,
  useRevenueByMethod,
  useRevenueSeries,
  useVolumeSeries,
} from '@/features/dashboard/use-dashboard';
import { MethodBreakdownChart } from '@/features/dashboard/method-breakdown-chart';
import { RecentActivityList } from '@/features/dashboard/recent-activity';
import { RevenueChart } from '@/features/dashboard/revenue-chart';
import { StatTile } from '@/features/dashboard/stat-tile';
import { VolumeChart } from '@/features/dashboard/volume-chart';
import { formatMoney } from '@/lib/money';

export function DashboardPage() {
  const { profile } = useAuth();
  const currency = profile?.merchant.defaultCurrency ?? 'INR';

  const summary = useDashboardSummary(30);
  const volume = useVolumeSeries(30);
  const revenue = useRevenueSeries(30);
  const methodBreakdown = useRevenueByMethod(30);
  const recent = useRecentTransactions(4);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back{profile ? `, ${profile.user.fullName.split(' ')[0]}` : ''}</h1>
        <p className="text-sm text-muted-foreground">Here&apos;s how {profile?.merchant.businessName} is doing.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summary.isLoading || !summary.data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)
        ) : (
          <>
            <StatTile
              label="Available balance"
              value={formatMoney(summary.data.balance.availableMinor, summary.data.currency)}
            />
            <StatTile
              label="30-day volume"
              value={formatMoney(summary.data.volume.value, summary.data.currency)}
              changePercent={summary.data.volume.changePercent}
            />
            <StatTile
              label="Success rate"
              value={`${summary.data.successRate.value.toFixed(1)}%`}
              changePercent={summary.data.successRate.changePercent}
            />
            <StatTile
              label="Avg. transaction"
              value={formatMoney(summary.data.averageValue.value, summary.data.currency)}
              changePercent={summary.data.averageValue.changePercent}
            />
          </>
        )}
      </div>

      {summary.data && summary.data.balance.pendingMinor > 0 && (
        <p className="text-sm text-muted-foreground">
          Plus {formatMoney(summary.data.balance.pendingMinor, summary.data.currency)} pending settlement.
          {summary.data.inFlightPayouts > 0 &&
            ` ${summary.data.inFlightPayouts} payout${summary.data.inFlightPayouts > 1 ? 's' : ''} in progress.`}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Volume over time</CardTitle>
          </CardHeader>
          <CardContent>
            {volume.isLoading || !volume.data ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <VolumeChart data={volume.data} currency={currency} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent activity</CardTitle>
            <Link
              to="/transactions"
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="View all transactions"
            >
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent>
            <RecentActivityList items={recent.data} isLoading={recent.isLoading} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue composition</CardTitle>
          </CardHeader>
          <CardContent>
            {revenue.isLoading || !revenue.data ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <RevenueChart data={revenue.data} currency={currency} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue by method</CardTitle>
          </CardHeader>
          <CardContent>
            {methodBreakdown.isLoading || !methodBreakdown.data ? (
              <Skeleton className="h-[220px] w-full" />
            ) : (
              <MethodBreakdownChart data={methodBreakdown.data} currency={currency} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
