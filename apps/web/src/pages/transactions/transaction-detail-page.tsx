import { format } from 'date-fns';
import { ArrowLeft, Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { TransactionStatusBadge } from '@/components/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { METHOD_LABELS } from '@/features/transactions/format';
import { useTransaction } from '@/features/transactions/use-transactions';
import { formatMoney } from '@/lib/money';

function CopyableReference({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {value}
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: txn, isLoading, isError } = useTransaction(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !txn) {
    return (
      <div className="space-y-4">
        <Link to="/transactions" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to transactions
        </Link>
        <p className="text-sm text-muted-foreground">This transaction could not be found.</p>
      </div>
    );
  }

  const isRefund = txn.type === 'REFUND';

  return (
    <div className="space-y-6">
      <Link to="/transactions" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to transactions
      </Link>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{isRefund ? 'Refund' : 'Payment'} amount</p>
            <p className={`text-3xl font-semibold tabular-nums ${isRefund ? 'text-destructive' : ''}`}>
              {isRefund ? '−' : ''}
              {formatMoney(txn.amountMinor, txn.currency)}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <TransactionStatusBadge status={txn.status} />
              <CopyableReference value={txn.reference} />
            </div>
          </div>
          <div className="text-sm text-muted-foreground sm:text-right">
            <p>{format(new Date(txn.createdAt), 'PPpp')}</p>
            {txn.settledAt && <p>Settled {format(new Date(txn.settledAt), 'PP')}</p>}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <Row label="Description" value={txn.description ?? '—'} />
            <Row label="Method" value={METHOD_LABELS[txn.method]} />
            {txn.cardBrand && <Row label="Card" value={`${txn.cardBrand} •••• ${txn.last4}`} />}
            {!isRefund && (
              <>
                <Row label="Gross amount" value={formatMoney(txn.amountMinor, txn.currency)} />
                <Row label="Fee" value={`− ${formatMoney(txn.feeMinor, txn.currency)}`} />
                <Row label="Net amount" value={formatMoney(txn.netMinor, txn.currency)} />
                {txn.refundedMinor > 0 && (
                  <Row label="Refunded" value={`− ${formatMoney(txn.refundedMinor, txn.currency)}`} />
                )}
              </>
            )}
            {txn.failureReason && <Row label="Failure reason" value={txn.failureReason} />}
            {txn.parent && (
              <Row
                label="Refund of"
                value={
                  <Link to={`/transactions/${txn.parent.id}`} className="text-primary hover:underline">
                    {txn.parent.reference}
                  </Link>
                }
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {txn.customer ? (
              <>
                <Row label="Name" value={txn.customer.name} />
                <Row label="Email" value={txn.customer.email} />
                {txn.customer.country && <Row label="Country" value={txn.customer.country} />}
              </>
            ) : (
              <p className="py-2 text-sm text-muted-foreground">No customer on file.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {txn.refunds.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Refunds</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {txn.refunds.map((refund) => (
              <Link
                key={refund.id}
                to={`/transactions/${refund.id}`}
                className="flex items-center justify-between py-2 text-sm hover:text-primary"
              >
                <span>{refund.reference}</span>
                <span className="font-medium text-destructive">− {formatMoney(refund.amountMinor, refund.currency)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-0">
            {txn.events.map((event, index) => (
              <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
                {index < txn.events.length - 1 && (
                  <span className="absolute left-[5px] top-3 h-full w-px bg-border" />
                )}
                <span className="relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                <div>
                  <p className="text-sm font-medium">{event.message}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(event.createdAt), 'PPp')}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <Separator className="opacity-0" />
    </div>
  );
}
