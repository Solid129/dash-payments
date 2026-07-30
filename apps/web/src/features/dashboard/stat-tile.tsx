import { ArrowDown, ArrowUp } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { formatPercent } from '@/lib/money';
import { cn } from '@/lib/utils';

interface StatTileProps {
  label: string;
  value: string;
  /** Positive percent change vs. the prior period, or null if there's no baseline. */
  changePercent?: number | null;
  /** Whether an increase is good news for this metric — false for e.g. refund rate. */
  higherIsBetter?: boolean;
}

export function StatTile({ label, value, changePercent, higherIsBetter = true }: StatTileProps) {
  const hasDelta = changePercent !== undefined && changePercent !== null;
  const isPositive = hasDelta && changePercent! > 0;
  const isGood = hasDelta && (higherIsBetter ? changePercent! >= 0 : changePercent! <= 0);

  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        {changePercent !== undefined && (
          <p
            className={cn(
              'mt-1.5 flex items-center gap-1 text-xs font-medium',
              !hasDelta && 'text-muted-foreground',
              hasDelta && (isGood ? 'text-success' : 'text-destructive'),
            )}
          >
            {hasDelta ? (
              isPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
            ) : null}
            {formatPercent(changePercent ?? null)}
            <span className="font-normal text-muted-foreground">vs. previous period</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
