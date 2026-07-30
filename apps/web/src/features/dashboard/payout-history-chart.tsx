import { format, parseISO } from 'date-fns';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { EmptyState } from '@/components/empty-state';
import { formatCompactMoney, formatMoney } from '@/lib/money';
import { useTheme } from '@/lib/theme-context';
import type { PayoutHistoryPoint } from '@/types/api';
import { TrendingDown } from 'lucide-react';

const PAID_COLOR_LIGHT = '#25935f';
const PAID_COLOR_DARK = '#34b277';
const PENDING_COLOR_LIGHT = '#f59f0a';
const PENDING_COLOR_DARK = '#f6af23';
const FAILED_COLOR_LIGHT = '#dc2828';
const FAILED_COLOR_DARK = '#d75050';

function CustomTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; name: string }>;
  label?: string;
  currency: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{format(parseISO(label), 'MMM yyyy')}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.name }} />
          <span className="capitalize">{entry.name}:</span> {formatMoney(entry.value, currency)}
        </div>
      ))}
    </div>
  );
}

export function PayoutHistoryChart({ data, currency }: { data: PayoutHistoryPoint[]; currency: string }) {
  const { isDark } = useTheme();
  const gridColor = isDark ? '#2c2c2a' : '#e1e0d9';
  const axisColor = '#898781';

  const total = data.reduce((sum, point) => sum + point.paidMinor + point.pendingMinor + point.failedMinor, 0);

  if (total === 0) {
    return (
      <EmptyState
        icon={TrendingDown}
        title="No payouts yet"
        description="Payout history will appear here once you initiate payouts."
      />
    );
  }

  const chartData = data.map((point) => ({
    ...point,
    name: point.month,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tickFormatter={(value: string) => format(parseISO(value), 'MMM yyyy')}
          tick={{ fontSize: 12, fill: axisColor }}
          axisLine={{ stroke: gridColor }}
          tickLine={false}
          minTickGap={32}
        />
        <YAxis
          tickFormatter={(value: number) => formatCompactMoney(value, currency)}
          tick={{ fontSize: 12, fill: axisColor }}
          axisLine={false}
          tickLine={false}
          width={64}
        />
        <Tooltip
          content={<CustomTooltip currency={currency} />}
          cursor={{ fill: gridColor, opacity: 0.4 }}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: axisColor }} />
        <Bar dataKey="paidMinor" stackId="payout" name="Paid" fill={isDark ? PAID_COLOR_DARK : PAID_COLOR_LIGHT} />
        <Bar
          dataKey="pendingMinor"
          stackId="payout"
          name="Pending"
          fill={isDark ? PENDING_COLOR_DARK : PENDING_COLOR_LIGHT}
        />
        <Bar
          dataKey="failedMinor"
          stackId="payout"
          name="Failed"
          fill={isDark ? FAILED_COLOR_DARK : FAILED_COLOR_LIGHT}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
