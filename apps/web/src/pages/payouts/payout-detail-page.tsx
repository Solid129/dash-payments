import { format } from 'date-fns';
import { ArrowLeft, FlaskConical, Loader2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { PayoutStatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toaster';
import { useAuth } from '@/features/auth/auth-context';
import { usePayout, useSimulatePayout } from '@/features/payouts/use-payouts';
import { canInitiatePayouts } from '@/lib/permissions';
import { formatMoney } from '@/lib/money';
import { isPayoutInFlight } from '@/types/api';

const STEPS = [
  { key: 'PENDING', label: 'Payout initiated' },
  { key: 'PROCESSING', label: 'Processing with bank' },
  { key: 'PAID', label: 'Paid out' },
] as const;

function ProgressSteps({ status, failedAt }: { status: string; failedAt: string | null }) {
  if (status === 'FAILED') {
    const failedAtIndex = STEPS.findIndex((s) => s.key === 'PROCESSING');
    return (
      <ol className="space-y-4">
        {STEPS.slice(0, failedAtIndex + 1).map((step) => (
          <li key={step.key} className="flex items-center gap-3 text-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-success" />
            {step.label}
          </li>
        ))}
        <li className="flex items-center gap-3 text-sm font-medium text-destructive">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
          Failed{failedAt ? ` · ${format(new Date(failedAt), 'PPp')}` : ''}
        </li>
      </ol>
    );
  }

  const currentIndex = STEPS.findIndex((s) => s.key === status);
  return (
    <ol className="space-y-4">
      {STEPS.map((step, index) => {
        const isDone = index < currentIndex || status === 'PAID';
        const isCurrent = index === currentIndex && status !== 'PAID';
        return (
          <li key={step.key} className="flex items-center gap-3 text-sm">
            {isDone ? (
              <span className="h-2.5 w-2.5 rounded-full bg-success" />
            ) : isCurrent ? (
              <span className="h-2.5 w-2.5 animate-pulse-soft rounded-full bg-warning" />
            ) : (
              <span className="h-2.5 w-2.5 rounded-full bg-muted" />
            )}
            <span className={isDone || isCurrent ? 'font-medium' : 'text-muted-foreground'}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function PayoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: payout, isLoading } = usePayout(id);
  const simulate = useSimulatePayout(id!);
  const { toast } = useToast();
  const { profile } = useAuth();

  if (isLoading || !payout) {
    return <Skeleton className="h-96 w-full" />;
  }

  async function runSimulation(event: 'processing' | 'paid' | 'failed') {
    try {
      await simulate.mutateAsync({ event, failureCode: event === 'failed' ? 'account_details_invalid' : undefined });
      toast({ title: `Simulated: ${event}`, variant: 'success' });
    } catch {
      toast({ title: 'Could not simulate that event', variant: 'destructive' });
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link to="/payouts" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to payouts
      </Link>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Payout amount</p>
            <p className="text-3xl font-semibold tabular-nums">{formatMoney(payout.amountMinor, payout.currency)}</p>
            <div className="mt-2 flex items-center gap-2">
              <PayoutStatusBadge status={payout.status} />
              <span className="font-mono text-xs text-muted-foreground">{payout.reference}</span>
            </div>
          </div>
          <div className="text-sm text-muted-foreground sm:text-right">
            <p>{payout.bankAccount.bankName} •••• {payout.bankAccount.last4}</p>
            <p>Initiated {format(new Date(payout.createdAt), 'PPp')}</p>
            {payout.estimatedArrivalAt && payout.status !== 'PAID' && payout.status !== 'FAILED' && (
              <p>Est. arrival {format(new Date(payout.estimatedArrivalAt), 'PP')}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {isPayoutInFlight(payout.status) && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Watching for updates from your bank…
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <ProgressSteps status={payout.status} failedAt={payout.failedAt} />
          {payout.status === 'FAILED' && payout.failureReason && (
            <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{payout.failureReason}</p>
          )}
        </CardContent>
      </Card>

      {/* Dev-only: lets a reviewer see every payout state without waiting for the
          mock provider's timers. Never rendered in a production build, and
          hidden for a role that can't initiate payouts in the first place —
          the API would 403 the underlying call regardless. */}
      {import.meta.env.DEV &&
        isPayoutInFlight(payout.status) &&
        profile &&
        canInitiatePayouts(profile.user.role) && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <FlaskConical className="h-4 w-4" />
              Developer tools
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={simulate.isPending}>
                  {simulate.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Simulate webhook…
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Force the next event</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {payout.status === 'PENDING' && (
                  <DropdownMenuItem onSelect={() => runSimulation('processing')}>Mark as processing</DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => runSimulation('paid')}>Mark as paid</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => runSimulation('failed')} className="text-destructive focus:text-destructive">
                  Mark as failed
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
