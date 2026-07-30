import { format, parseISO } from 'date-fns';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatCompactMoney, formatMoney } from '@/lib/money';
import { useTheme } from '@/lib/theme-context';
import type { VolumePoint } from '@/types/api';

/**
 * Single-series sequential blue, validated against both surfaces with the
 * dataviz skill's palette validator (`scripts/validate_palette.js`) — see
 * references/palette.md. One series needs no legend; the card title names it.
 */
const SERIES_COLOR_LIGHT = '#2a78d6';
const SERIES_COLOR_DARK = '#3987e5';

function CustomTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  currency: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-popover-foreground">{format(parseISO(label), 'EEE, MMM d')}</p>
      <p className="text-muted-foreground">{formatMoney(payload[0].value, currency)}</p>
    </div>
  );
}

export function VolumeChart({ data, currency }: { data: VolumePoint[]; currency: string }) {
  const { isDark } = useTheme();
  const color = isDark ? SERIES_COLOR_DARK : SERIES_COLOR_LIGHT;
  const gridColor = isDark ? '#2c2c2a' : '#e1e0d9';
  const axisColor = isDark ? '#898781' : '#898781';

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="volume-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* Recessive grid: horizontal only, hairline, never competing with the mark. */}
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
        <Area
          type="monotone"
          dataKey="volumeMinor"
          stroke={color}
          strokeWidth={2}
          fill="url(#volume-fill)"
          activeDot={{ r: 4, fill: color, stroke: 'transparent' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
