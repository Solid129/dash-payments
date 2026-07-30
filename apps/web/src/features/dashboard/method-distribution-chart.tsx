import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { EmptyState } from '@/components/empty-state';
import { METHOD_LABELS } from '@/features/transactions/format';
import { METHOD_COLORS } from '@/features/dashboard/method-colors';
import { useTheme } from '@/lib/theme-context';
import type { MethodBreakdownPoint } from '@/types/api';
import { Wallet } from 'lucide-react';

interface MethodDistributionPoint {
  method: string;
  percentage: number;
  grossMinor: number;
  count: number;
  color: { light: string; dark: string };
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: MethodDistributionPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-popover-foreground">{point.method}</p>
      <p className="text-muted-foreground">{point.percentage.toFixed(1)}%</p>
      <p className="text-muted-foreground">{point.count} transaction{point.count === 1 ? '' : 's'}</p>
    </div>
  );
}

export function MethodDistributionChart({ data }: { data: MethodBreakdownPoint[] }) {
  const { isDark } = useTheme();

  const total = data.reduce((sum, point) => sum + point.grossMinor, 0);

  if (total === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="No transactions yet"
        description="Payment method distribution will appear here once you start processing payments."
      />
    );
  }

  const merged: MethodDistributionPoint[] = data
    .filter((point) => point.grossMinor > 0)
    .map((point) => ({
      method: METHOD_LABELS[point.method],
      percentage: (point.grossMinor / total) * 100,
      grossMinor: point.grossMinor,
      count: point.count,
      color: METHOD_COLORS[point.method],
    }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <Pie
          data={merged}
          dataKey="percentage"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={2}
          label={(entry: MethodDistributionPoint) => `${entry.percentage.toFixed(0)}%`}
        >
          {merged.map((point) => (
            <Cell key={point.method} fill={isDark ? point.color.dark : point.color.light} />
          ))}
        </Pie>
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Tooltip content={<CustomTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}
