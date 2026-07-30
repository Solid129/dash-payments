import { format, parseISO } from 'date-fns';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatCompactMoney, formatMoney } from '@/lib/money';
import { useTheme } from '@/lib/theme-context';
import type { RevenuePoint } from '@/types/api';

/**
 * Three-series stacked composition (fees, net revenue, refunds), colors from
 * the dataviz skill's default categorical order. The naive order —
 * orange/blue/**red** with red adjacent to orange — fails the palette
 * validator's adjacent-pair CVD and normal-vision checks (ΔE 5.6 / 7.1,
 * both below the floor); blue placed *between* orange and red clears every
 * check (validated with `scripts/validate_palette.js` in both modes), so the
 * stack order below is fixed by that constraint, not aesthetics.
 */
const SERIES = [
  { key: 'feesMinor', label: 'Fees', light: '#eb6834', dark: '#d95926' },
  { key: 'netMinor', label: 'Net revenue', light: '#2a78d6', dark: '#3987e5' },
  { key: 'refundedMinor', label: 'Refunds', light: '#e34948', dark: '#e66767' },
] as const;

function CustomTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
  currency: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{format(parseISO(label), 'EEE, MMM d')}</p>
      {SERIES.map((series) => {
        const entry = payload.find((p) => p.dataKey === series.key);
        if (!entry) return null;
        return (
          <div key={series.key} className="flex items-center gap-2 text-muted-foreground">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
            {series.label}: {formatMoney(entry.value, currency)}
          </div>
        );
      })}
    </div>
  );
}

export function RevenueChart({ data, currency }: { data: RevenuePoint[]; currency: string }) {
  const { isDark } = useTheme();
  const gridColor = isDark ? '#2c2c2a' : '#e1e0d9';
  const axisColor = '#898781';

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickFormatter={(value: string) => format(parseISO(value), 'MMM d')}
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
        <Tooltip content={<CustomTooltip currency={currency} />} cursor={{ stroke: gridColor }} />
        {/* Mandatory at >=2 series — identity must never rest on color alone. */}
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: axisColor }}
          formatter={(value: string) => SERIES.find((s) => s.key === value)?.label ?? value}
        />
        {SERIES.map((series) => (
          <Area
            key={series.key}
            type="monotone"
            dataKey={series.key}
            stackId="revenue"
            stroke={isDark ? series.dark : series.light}
            fill={isDark ? series.dark : series.light}
            fillOpacity={0.55}
            strokeWidth={1.5}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
