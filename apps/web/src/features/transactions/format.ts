import { CreditCard, Landmark, Smartphone, Wallet } from 'lucide-react';

import type { PaymentMethod } from '@/types/api';

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  CARD: 'Card',
  BANK_TRANSFER: 'Bank transfer',
  UPI: 'UPI',
  WALLET: 'Wallet',
};

export const METHOD_ICONS: Record<PaymentMethod, typeof CreditCard> = {
  CARD: CreditCard,
  BANK_TRANSFER: Landmark,
  UPI: Smartphone,
  WALLET: Wallet,
};
