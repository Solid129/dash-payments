import { Badge } from '@/components/ui/badge';
import type { PayoutStatus, TransactionStatus } from '@/types/api';

const TRANSACTION_STYLES: Record<TransactionStatus, { variant: 'success' | 'warning' | 'destructive' | 'muted'; label: string }> = {
  SUCCEEDED: { variant: 'success', label: 'Succeeded' },
  PENDING: { variant: 'warning', label: 'Pending' },
  FAILED: { variant: 'destructive', label: 'Failed' },
  REFUNDED: { variant: 'muted', label: 'Refunded' },
  PARTIALLY_REFUNDED: { variant: 'muted', label: 'Partially refunded' },
};

export function TransactionStatusBadge({ status }: { status: TransactionStatus }) {
  const style = TRANSACTION_STYLES[status];
  return <Badge variant={style.variant}>{style.label}</Badge>;
}

const PAYOUT_STYLES: Record<PayoutStatus, { variant: 'success' | 'warning' | 'destructive'; label: string; pulse?: boolean }> = {
  PENDING: { variant: 'warning', label: 'Pending', pulse: true },
  PROCESSING: { variant: 'warning', label: 'Processing', pulse: true },
  PAID: { variant: 'success', label: 'Paid' },
  FAILED: { variant: 'destructive', label: 'Failed' },
};

export function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  const style = PAYOUT_STYLES[status];
  return (
    <Badge variant={style.variant}>
      {style.pulse && <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-current" />}
      {style.label}
    </Badge>
  );
}
