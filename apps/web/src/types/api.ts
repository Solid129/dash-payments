/**
 * Types mirroring the API's response shapes.
 *
 * Hand-mirrored rather than generated from the OpenAPI schema: for a project this
 * size, a generator step would add a build dependency for a handful of shapes
 * that change rarely. If the surface grew much larger, generating these from
 * `/api/docs-json` would be the next move.
 */

export type UserRole = 'OWNER' | 'ACCOUNTANT' | 'SUPPORT';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticatedProfile {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    lastLoginAt: string | null;
  };
  merchant: {
    id: string;
    businessName: string;
    country: string;
    defaultCurrency: string;
    supportEmail: string | null;
  };
}

export interface AuthResponse extends TokenPair {
  profile: AuthenticatedProfile;
}

export type TransactionType = 'PAYMENT' | 'REFUND';
export type TransactionStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
export type PaymentMethod = 'CARD' | 'BANK_TRANSFER' | 'UPI' | 'WALLET';

export interface CustomerSummary {
  id: string;
  name: string;
  email: string;
}

export interface TransactionListItem {
  id: string;
  reference: string;
  type: TransactionType;
  status: TransactionStatus;
  amountMinor: number;
  feeMinor: number;
  netMinor: number;
  currency: string;
  method: PaymentMethod;
  cardBrand: string | null;
  last4: string | null;
  description: string | null;
  failureReason?: string | null;
  createdAt: string;
  settledAt: string | null;
  customer: CustomerSummary | null;
}

export interface TransactionListResponse {
  items: TransactionListItem[];
  nextCursor: string | null;
  totals: { count: number; grossMinor: number; netMinor: number; feeMinor: number };
}

export interface TransactionEvent {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

export interface TransactionDetail extends TransactionListItem {
  customer: (CustomerSummary & { country: string | null }) | null;
  events: TransactionEvent[];
  refunds: Array<{
    id: string;
    reference: string;
    amountMinor: number;
    currency: string;
    status: TransactionStatus;
    createdAt: string;
  }>;
  parent: { id: string; reference: string; amountMinor: number; currency: string; createdAt: string } | null;
  refundedMinor: number;
  refundableMinor: number;
}

export interface TransactionFilters {
  status?: TransactionStatus[];
  method?: PaymentMethod[];
  type?: TransactionType;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  q?: string;
  sortBy?: 'createdAt' | 'amountMinor';
  sortDir?: 'asc' | 'desc';
  limit?: number;
  cursor?: string;
}

export interface MetricWithDelta {
  value: number;
  changePercent: number | null;
}

export interface DashboardSummary {
  currency: string;
  balance: { availableMinor: number; pendingMinor: number };
  periodDays: number;
  volume: MetricWithDelta;
  transactionCount: MetricWithDelta;
  averageValue: MetricWithDelta;
  successRate: MetricWithDelta;
  refundedMinor: number;
  feesMinor: number;
  inFlightPayouts: number;
}

export interface VolumePoint {
  date: string;
  volumeMinor: number;
  count: number;
}

export interface RecentTransaction {
  id: string;
  reference: string;
  type: TransactionType;
  status: TransactionStatus;
  amountMinor: number;
  currency: string;
  method: PaymentMethod;
  createdAt: string;
  customer: { id: string; name: string } | null;
}

export type RevenueGranularity = 'day' | 'week' | 'month';

export interface StatusBreakdownPoint {
  status: TransactionStatus;
  count: number;
  percentage: number;
}

export interface PayoutHistoryPoint {
  month: string;
  paidMinor: number;
  pendingMinor: number;
  failedMinor: number;
  count: number;
}

export type BankAccountStatus = 'PENDING' | 'VERIFIED' | 'DISABLED';

export interface BankAccount {
  id: string;
  label: string;
  accountHolderName: string;
  bankName: string;
  last4: string;
  routingCode: string;
  currency: string;
  status: BankAccountStatus;
  isDefault: boolean;
}

export type PayoutStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED';

export interface Payout {
  id: string;
  merchantId: string;
  bankAccountId: string;
  reference: string;
  amountMinor: number;
  currency: string;
  status: PayoutStatus;
  pspReference: string | null;
  estimatedArrivalAt: string | null;
  processingAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  failureCode: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  bankAccount: { id: string; label: string; bankName: string; last4: string };
}

export interface PayoutDetail extends Payout {
  webhookEvents: Array<{
    id: string;
    type: string;
    receivedAt: string;
    outcome: string;
    notes: string | null;
  }>;
}

export interface PayoutLimits {
  minimumMinor: number;
  maximumMinor: number;
  dailyCapMinor: number;
  maxInFlight: number;
}

export interface AutoPayoutSchedule {
  dailyEnabled: boolean;
  thresholdEnabled: boolean;
  thresholdMinor: number | null;
  bankAccountId: string | null;
  lastTriggeredAt: string | null;
}

export const IN_FLIGHT_PAYOUT_STATUSES: PayoutStatus[] = ['PENDING', 'PROCESSING'];

export function isPayoutInFlight(status: PayoutStatus): boolean {
  return IN_FLIGHT_PAYOUT_STATUSES.includes(status);
}

export interface TeamMember {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
  expiresAt: string;
}

export interface RevenuePoint {
  date: string;
  netMinor: number;
  feesMinor: number;
  refundedMinor: number;
}

export interface MethodBreakdownPoint {
  method: PaymentMethod;
  grossMinor: number;
  netMinor: number;
  count: number;
}

export type ReportFrequency = 'OFF' | 'WEEKLY' | 'MONTHLY';

export interface ReportSubscription {
  frequency: ReportFrequency;
  lastSentAt: string | null;
}

export interface ReportPayload {
  businessName: string;
  periodDays: number;
  currency: string;
  summary: DashboardSummary;
  revenueByMethod: MethodBreakdownPoint[];
}

export interface SendReportNowResponse {
  frequency: Exclude<ReportFrequency, 'OFF'>;
  payload: ReportPayload;
}
