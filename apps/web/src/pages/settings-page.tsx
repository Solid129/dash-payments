import { Loader2, Mail, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toaster';
import { useBankAccounts } from '@/features/bank-accounts/use-bank-accounts';
import { useAuth } from '@/features/auth/auth-context';
import {
  useAutoPayoutSchedule,
  useUpdateAutoPayoutSchedule,
  useTriggerAutoPayoutNow,
} from '@/features/payouts/use-auto-payout';
import {
  useReportSubscription,
  useSendTestReport,
  useUpdateReportSubscription,
} from '@/features/settings/use-settings';
import { canInitiatePayouts } from '@/lib/permissions';
import { formatMoney, formatPercent, toMinorUnits, toMajorUnits } from '@/lib/money';
import type { ReportFrequency, SendReportNowResponse } from '@/types/api';

const FREQUENCY_LABELS: Record<ReportFrequency, string> = {
  OFF: 'Off',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
};

function ReportPreviewDialog({
  result,
  onOpenChange,
}: {
  result: SendReportNowResponse | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={result !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Report preview</DialogTitle>
          <DialogDescription>
            No real email is sent in this demo — this is exactly what the{' '}
            {result ? FREQUENCY_LABELS[result.frequency].toLowerCase() : ''} email would contain. The same content
            is also logged to the API console.
          </DialogDescription>
        </DialogHeader>
        {result && (
          <div className="space-y-4 text-sm">
            <p className="font-medium">
              {result.payload.businessName} — last {result.payload.periodDays} days
            </p>
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">Volume</dt>
                <dd className="font-medium">
                  {formatMoney(result.payload.summary.volume.value, result.payload.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Transactions</dt>
                <dd className="font-medium">{result.payload.summary.transactionCount.value}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Success rate</dt>
                <dd className="font-medium">{formatPercent(result.payload.summary.successRate.value)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Available balance</dt>
                <dd className="font-medium">
                  {formatMoney(result.payload.summary.balance.availableMinor, result.payload.currency)}
                </dd>
              </div>
            </dl>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Revenue by method</p>
              <ul className="divide-y">
                {result.payload.revenueByMethod.map((row) => (
                  <li key={row.method} className="flex items-center justify-between py-1.5">
                    <span>{row.method}</span>
                    <span className="font-medium">{formatMoney(row.grossMinor, result.payload.currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SettingsPage() {
  const { profile } = useAuth();
  const currency = profile?.merchant.defaultCurrency ?? 'INR';
  const canEdit = profile && canInitiatePayouts(profile.user.role);

  // Report subscription
  const subscription = useReportSubscription();
  const updateSubscription = useUpdateReportSubscription();
  const sendTestReport = useSendTestReport();
  const { toast } = useToast();
  const [preview, setPreview] = useState<SendReportNowResponse | null>(null);

  // Auto payout schedule
  const schedule = useAutoPayoutSchedule();
  const updateSchedule = useUpdateAutoPayoutSchedule();
  const triggerNow = useTriggerAutoPayoutNow();
  const bankAccounts = useBankAccounts();

  // Form state for auto payouts
  const [dailyEnabled, setDailyEnabled] = useState(false);
  const [thresholdEnabled, setThresholdEnabled] = useState(false);
  const [thresholdAmount, setThresholdAmount] = useState<string>('');
  const [bankAccountId, setBankAccountId] = useState<string>('default');
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize form from schedule data
  useMemo(() => {
    if (schedule.data && !isInitialized) {
      setDailyEnabled(schedule.data.dailyEnabled);
      setThresholdEnabled(schedule.data.thresholdEnabled);
      if (schedule.data.thresholdMinor) {
        setThresholdAmount(String(toMajorUnits(schedule.data.thresholdMinor, currency)));
      }
      setBankAccountId(schedule.data.bankAccountId || 'default');
      setIsInitialized(true);
    }
  }, [schedule.data, isInitialized, currency]);

  async function handleFrequencyChange(value: ReportFrequency) {
    try {
      await updateSubscription.mutateAsync(value);
      toast({ title: 'Report preference saved', variant: 'success' });
    } catch {
      toast({ title: 'Could not save preference', variant: 'destructive' });
    }
  }

  async function handleSendNow() {
    try {
      const result = await sendTestReport.mutateAsync();
      setPreview(result);
    } catch {
      toast({ title: 'Could not send a test report', variant: 'destructive' });
    }
  }

  async function handleSaveAutoPayoutSchedule() {
    try {
      let thresholdMinor: number | undefined;
      if (thresholdEnabled) {
        const amount = parseFloat(thresholdAmount);
        if (!amount || amount <= 0) {
          toast({ title: 'Enter a valid threshold amount', variant: 'destructive' });
          return;
        }
        thresholdMinor = toMinorUnits(amount, currency);
      }

      await updateSchedule.mutateAsync({
        dailyEnabled,
        thresholdEnabled,
        thresholdMinor,
        bankAccountId: bankAccountId === 'default' ? undefined : bankAccountId,
      });
      toast({ title: 'Auto payout settings saved', variant: 'success' });
    } catch {
      toast({ title: 'Could not save auto payout settings', variant: 'destructive' });
    }
  }

  async function handleTriggerNow() {
    try {
      await triggerNow.mutateAsync();
      toast({ title: 'Auto payout triggered', variant: 'success' });
    } catch {
      toast({ title: 'Could not trigger auto payout', variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scheduled reports</CardTitle>
          <CardDescription>
            Get a consolidated summary of your account emailed to you on a schedule.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {subscription.isLoading ? (
            <Skeleton className="h-10 w-48" />
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="report-frequency">Email frequency</Label>
              <Select
                value={subscription.data?.frequency ?? 'OFF'}
                onValueChange={(value) => handleFrequencyChange(value as ReportFrequency)}
              >
                <SelectTrigger id="report-frequency" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OFF">Off</SelectItem>
                  <SelectItem value="WEEKLY">Weekly</SelectItem>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                </SelectContent>
              </Select>
              {subscription.data?.lastSentAt && (
                <p className="text-xs text-muted-foreground">
                  Last sent {new Date(subscription.data.lastSentAt).toLocaleString()}
                </p>
              )}
            </div>
          )}

          <div>
            <Button variant="outline" onClick={handleSendNow} disabled={sendTestReport.isPending}>
              {sendTestReport.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              Send a test email now
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground">
              No real email is sent in this demo — this previews the content and logs it to the API console.
            </p>
          </div>
        </CardContent>
      </Card>

      <ReportPreviewDialog result={preview} onOpenChange={(open) => !open && setPreview(null)} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Automatic payouts
          </CardTitle>
          <CardDescription>Set up automatic payouts based on a schedule or balance threshold.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {schedule.isLoading || bankAccounts.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <>
              {/* Daily sweep */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Daily sweep</Label>
                  <p className="text-xs text-muted-foreground">Pay out your full available balance every day at 9 AM UTC</p>
                </div>
                <Switch disabled={!canEdit} checked={dailyEnabled} onCheckedChange={setDailyEnabled} />
              </div>

              {/* Threshold-based */}
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Threshold-based</Label>
                    <p className="text-xs text-muted-foreground">Pay out when balance reaches an amount</p>
                  </div>
                  <Switch disabled={!canEdit} checked={thresholdEnabled} onCheckedChange={setThresholdEnabled} />
                </div>

                {thresholdEnabled && (
                  <div className="space-y-1.5 border-t pt-3">
                    <Label htmlFor="threshold-amount" className="text-sm">
                      Threshold amount
                    </Label>
                    <Input
                      id="threshold-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      disabled={!canEdit}
                      value={thresholdAmount}
                      onChange={(e) => setThresholdAmount(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Bank account selection */}
              <div className="space-y-1.5">
                <Label htmlFor="auto-payout-account">Destination account</Label>
                <Select disabled={!canEdit} value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger id="auto-payout-account">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Use default verified account</SelectItem>
                    {bankAccounts.data?.map((account) => (
                      <SelectItem key={account.id} value={account.id} disabled={account.status !== 'VERIFIED'}>
                        {account.bankName} •••• {account.last4}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Last triggered */}
              {schedule.data?.lastTriggeredAt && (
                <p className="text-xs text-muted-foreground">
                  Last triggered {new Date(schedule.data.lastTriggeredAt).toLocaleString()}
                </p>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 border-t pt-4">
                <Button onClick={handleSaveAutoPayoutSchedule} disabled={!canEdit || updateSchedule.isPending} className="flex-1">
                  {updateSchedule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save settings
                </Button>
                <Button variant="outline" onClick={handleTriggerNow} disabled={!canEdit || triggerNow.isPending}>
                  {triggerNow.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Trigger now
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
