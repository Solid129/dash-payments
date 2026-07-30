import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { METHOD_LABELS } from '@/features/transactions/format';
import { METHOD_COLORS } from '@/features/dashboard/method-colors';
import { formatCompactMoney, formatMoney } from '@/lib/money';
import { useTheme } from '@/lib/theme-context';
import type { MethodBreakdownPoint, PaymentMethod } from '@/types/api';

function CustomTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ payload: MethodBreakdownPoint }>;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-popover-foreground">{METHOD_LABELS[point.method]}</p>
      <p className="text-muted-foreground">
        {formatMoney(point.grossMinor, currency)} · {point.count} transaction{point.count === 1 ? '' : 's'}
      </p>
    </div>
  );
}

export function MethodBreakdownChart({ data, currency }: { data: MethodBreakdownPoint[]; currency: string }) {
  const { isDark } = useTheme();
  const gridColor = isDark ? '#2c2c2a' : '#e1e0d9';
  const axisColor = '#898781';

  const sorted = [...data].sort((a, b) => b.grossMinor - a.grossMinor);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 8, right: 48, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={gridColor} strokeDasharray="3 3" />
        <XAxis
          type="number"
          tickFormatter={(value: number) => formatCompactMoney(value, currency)}
          tick={{ fontSize: 12, fill: axisColor }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="method"
          tickFormatter={(value: PaymentMethod) => METHOD_LABELS[value]}
          tick={{ fontSize: 12, fill: axisColor }}
          axisLine={false}
          tickLine={false}
          width={96}
        />
        <Tooltip content={<CustomTooltip currency={currency} />} cursor={{ fill: gridColor, opacity: 0.4 }} />
        <Bar dataKey="grossMinor" radius={[0, 4, 4, 0]} maxBarSize={28}>
          {sorted.map((point) => {
            const color = METHOD_COLORS[point.method];
            return <Cell key={point.method} fill={isDark ? color.dark : color.light} />;
          })}
          {/* The mandated "relief" for the two light-mode bars that fall under
              3:1 contrast against the surface — see the palette comment above.
              A value is legible here regardless of the bar's own color. */}
          <LabelList
            dataKey="grossMinor"
            position="right"
            formatter={(value: number) => formatCompactMoney(value, currency)}
            style={{ fontSize: 12, fill: axisColor }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
