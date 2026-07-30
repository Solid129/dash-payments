import type { PaymentMethod } from '@/types/api';

/**
 * Fixed color per method — the default categorical order's first four slots,
 * validated together with `scripts/validate_palette.js` (worst adjacent
 * normal-vision ΔE 22.9 light / 19.8 dark, both clear of the CVD floor). Two
 * light-mode bars (aqua, yellow) sit under 3:1 against the white surface,
 * which the skill treats as needing "relief" — value labels rendered at
 * the end of each bar are that relief, so color is never load-bearing alone.
 */
export const METHOD_COLORS: Record<PaymentMethod, { light: string; dark: string }> = {
  CARD: { light: '#2a78d6', dark: '#3987e5' },
  UPI: { light: '#eb6834', dark: '#d95926' },
  WALLET: { light: '#1baf7a', dark: '#199e70' },
  BANK_TRANSFER: { light: '#eda100', dark: '#c98500' },
};
