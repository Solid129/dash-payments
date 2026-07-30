import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useBankAccounts } from '@/features/bank-accounts/use-bank-accounts';
import { useAuth } from '@/features/auth/auth-context';
import { useDashboardSummary } from '@/features/dashboard/use-dashboard';
import { useCreatePayout, usePayoutLimits } from '@/features/payouts/use-payouts';
import { canInitiatePayouts } from '@/lib/permissions';
import { formatMoney, toMinorUnits } from '@/lib/money';
import { applyServerErrors } from '@/lib/use-server-errors';

const QUICK_FRACTIONS = [0.25, 0.5, 1] as const;

function buildSchema(availableMinor: number, minMinor: number, maxMinor: number, currency: string) {
  return z.object({
    amount: z.coerce
      .number({ invalid_type_error: 'Enter an amount' })
      .positive('Enter an amount greater than zero')
      .refine((v) => toMinorUnits(v, currency) >= minMinor, {
        message: `The minimum payout is ${formatMoney(minMinor, currency)}`,
      })
      .refine((v) => toMinorUnits(v, currency) <= maxMinor, {
        message: `The maximum single payout is ${formatMoney(maxMinor, currency)}`,
      })
      .refine((v) => toMinorUnits(v, currency) <= availableMinor, {
        message: `That exceeds your available balance of ${formatMoney(availableMinor, currency)}`,
      }),
    bankAccountId: z.string().min(1, 'Choose a destination'),
  });
}

type FormValues = { amount: number; bankAccountId: string };

export function NewPayoutPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const currency = profile?.merchant.defaultCurrency ?? 'INR';

  const summary = useDashboardSummary();
  const limits = usePayoutLimits();
  const bankAccounts = useBankAccounts();
  const createPayout = useCreatePayout();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [formError, setFormError] = useState<string>();
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const availableMinor = summary.data?.balance.availableMinor ?? 0;
  const schema = buildSchema(availableMinor, limits.data?.minimumMinor ?? 0, limits.data?.maximumMinor ?? Number.MAX_SAFE_INTEGER, currency);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const watchedAmount = watch('amount');
  const watchedBankAccountId = watch('bankAccountId');
  const selectedAccount = bankAccounts.data?.find((a) => a.id === watchedBankAccountId);

  const isLoading = summary.isLoading || limits.isLoading || bankAccounts.isLoading;

  const onSubmit = handleSubmit(() => setConfirmOpen(true));

  async function confirmAndSubmit(values: FormValues) {
    try {
      const payout = await createPayout.mutateAsync({
        amountMinor: toMinorUnits(values.amount, currency),
        currency,
        bankAccountId: values.bankAccountId,
        idempotencyKey,
      });
      navigate(`/payouts/${payout.id}`);
    } catch (error) {
      setConfirmOpen(false);
      setFormError(applyServerErrors(error, setError, ['amountMinor', 'bankAccountId', 'currency']));
    }
  }

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  // A SUPPORT user landing here via a direct link would only reach a 403 on
  // submit — better to send them back than let them fill out a form the API
  // will reject. Checked after the loading gate so hooks above always run in
  // the same order regardless of role.
  if (profile && !canInitiatePayouts(profile.user.role)) {
    return <Navigate to="/payouts" replace />;
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link to="/payouts" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to payouts
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>New payout</CardTitle>
          <p className="text-sm text-muted-foreground">
            Available: {formatMoney(availableMinor, currency)}
          </p>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input id="amount" type="number" step="0.01" min="0" placeholder="0.00" {...register('amount')} />
              {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
              <div className="flex gap-2 pt-1">
                {QUICK_FRACTIONS.map((fraction) => (
                  <Button
                    key={fraction}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setValue('amount', Number((availableMinor * fraction / 100).toFixed(2)), { shouldValidate: true })}
                  >
                    {fraction === 1 ? 'Max' : `${fraction * 100}%`}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bankAccountId">Destination</Label>
              <Controller
                control={control}
                name="bankAccountId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="bankAccountId">
                      <SelectValue placeholder="Choose an account" />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.data?.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          <span className="flex items-center gap-2">
                            {account.bankName} •••• {account.last4}
                            {account.status !== 'VERIFIED' && (
                              <Badge variant="warning" className="ml-1">
                                {account.status === 'PENDING' ? 'Unverified' : 'Disabled'}
                              </Badge>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.bankAccountId && <p className="text-sm text-destructive">{errors.bankAccountId.message}</p>}
              {selectedAccount && selectedAccount.status !== 'VERIFIED' && (
                <p className="text-sm text-warning-foreground">
                  This account isn&apos;t verified yet — the payout will be rejected until it is.
                </p>
              )}
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full">
              Review payout
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm payout</DialogTitle>
            <DialogDescription>
              This will send {formatMoney(toMinorUnits(watchedAmount || 0, currency), currency)} to{' '}
              {selectedAccount ? `${selectedAccount.bankName} •••• ${selectedAccount.last4}` : 'the selected account'}. This
              is a demo — no real funds move.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit(confirmAndSubmit)}
              disabled={createPayout.isPending}
            >
              {createPayout.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm payout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
