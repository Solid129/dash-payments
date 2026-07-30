import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { EmptyState } from '@/components/empty-state';
import { useTheme } from '@/lib/theme-context';
import type { StatusBreakdownPoint, TransactionStatus } from '@/types/api';
import { TrendingUp } from 'lucide-react';

/**
 * Status colors reuse the app's own status semantics (`--success`/`--warning`/
 * `--destructive`/`--muted-foreground` from the CSS vars), matching status-badge.tsx.
 * REFUNDED + PARTIALLY_REFUNDED are visually merged (both use muted-gray).
 * These are meaning-bearing/fixed status colors, so per the dataviz skill's rule
 * for status colors: never rely on hue discrimination alone — use legend + direct
 * labels (%) + tooltip (label + counts).
 */
const STATUS_COLORS: Record<TransactionStatus, { light: string; dark: string }> = {
  SUCCEEDED: { light: '#25935f', dark: '#34b277' },
  PENDING: { light: '#f59f0a', dark: '#f6af23' },
  FAILED: { light: '#dc2828', dark: '#d75050' },
  REFUNDED: { light: '#71717a', dark: '#a1a1aa' },
  PARTIALLY_REFUNDED: { light: '#71717a', dark: '#a1a1aa' },
};

const STATUS_LABELS: Record<TransactionStatus, string> = {
  SUCCEEDED: 'Succeeded',
  PENDING: 'Pending',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Refunded',
};

interface MergedStatusBreakdownPoint {
  label: string;
  value: number;
  percentage: number;
  subCounts?: { label: string; count: number }[];
  color: { light: string; dark: string };
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: MergedStatusBreakdownPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-popover-foreground">{point.label}</p>
      <p className="text-muted-foreground">{point.value} transaction{point.value === 1 ? '' : 's'}</p>
      <p className="text-muted-foreground">{point.percentage.toFixed(1)}%</p>
      {point.subCounts && (
        <div className="mt-1 border-t border-border pt-1 text-xs">
          {point.subCounts.map((sub) => (
            <p key={sub.label} className="text-muted-foreground">
              {sub.label}: {sub.count}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function StatusBreakdownChart({ data }: { data: StatusBreakdownPoint[] }) {
  const { isDark } = useTheme();

  const total = data.reduce((sum, point) => sum + point.count, 0);

  if (total === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No transactions yet"
        description="Transaction status breakdown will appear here once you start processing payments."
      />
    );
  }

  const refundedCount = (data.find((d) => d.status === 'REFUNDED')?.count ?? 0) +
    (data.find((d) => d.status === 'PARTIALLY_REFUNDED')?.count ?? 0);
  const refundedPercentage = total === 0 ? 0 : (refundedCount / total) * 100;

  const merged: MergedStatusBreakdownPoint[] = [
    {
      label: STATUS_LABELS.SUCCEEDED,
      value: data.find((d) => d.status === 'SUCCEEDED')?.count ?? 0,
      percentage: data.find((d) => d.status === 'SUCCEEDED')?.percentage ?? 0,
      color: STATUS_COLORS.SUCCEEDED,
    },
    {
      label: STATUS_LABELS.PENDING,
      value: data.find((d) => d.status === 'PENDING')?.count ?? 0,
      percentage: data.find((d) => d.status === 'PENDING')?.percentage ?? 0,
      color: STATUS_COLORS.PENDING,
    },
    {
      label: STATUS_LABELS.FAILED,
      value: data.find((d) => d.status === 'FAILED')?.count ?? 0,
      percentage: data.find((d) => d.status === 'FAILED')?.percentage ?? 0,
      color: STATUS_COLORS.FAILED,
    },
    ...(refundedCount > 0
      ? [
          {
            label: STATUS_LABELS.REFUNDED,
            value: refundedCount,
            percentage: refundedPercentage,
            subCounts: [
              { label: 'Refunded', count: data.find((d) => d.status === 'REFUNDED')?.count ?? 0 },
              { label: 'Partially refunded', count: data.find((d) => d.status === 'PARTIALLY_REFUNDED')?.count ?? 0 },
            ],
            color: STATUS_COLORS.REFUNDED,
          },
        ]
      : []),
  ].filter((point) => point.value > 0);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <Pie
          data={merged}
          dataKey="value"
          nameKey="label"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={2}
          label={({ percent }: { percent: number }) => `${(percent * 100).toFixed(0)}%`}
        >
          {merged.map((point) => (
            <Cell key={point.label} fill={isDark ? point.color.dark : point.color.light} />
          ))}
        </Pie>
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Tooltip content={<CustomTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}
