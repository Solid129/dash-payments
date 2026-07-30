import { PayoutStatus } from './payouts.schema';
import { canTransition, evaluateTransition, isTerminal } from './payout-state-machine';

describe('payout state machine', () => {
  describe('legal transitions', () => {
    it.each([
      [PayoutStatus.PENDING, PayoutStatus.PROCESSING],
      [PayoutStatus.PENDING, PayoutStatus.PAID],
      [PayoutStatus.PENDING, PayoutStatus.FAILED],
      [PayoutStatus.PROCESSING, PayoutStatus.PAID],
      [PayoutStatus.PROCESSING, PayoutStatus.FAILED],
    ])('allows %s -> %s', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
      expect(evaluateTransition(from, to)).toEqual({ kind: 'apply' });
    });
  });

  describe('terminal states', () => {
    it.each([PayoutStatus.PAID, PayoutStatus.FAILED])('%s is terminal', (status) => {
      expect(isTerminal(status)).toBe(true);
    });

    it.each([PayoutStatus.PENDING, PayoutStatus.PROCESSING])('%s is not terminal', (status) => {
      expect(isTerminal(status)).toBe(false);
    });

    it.each([
      [PayoutStatus.PAID, PayoutStatus.PROCESSING],
      [PayoutStatus.PAID, PayoutStatus.FAILED],
      [PayoutStatus.FAILED, PayoutStatus.PAID],
      [PayoutStatus.FAILED, PayoutStatus.PROCESSING],
    ])('refuses to move a terminal payout: %s -> %s', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
      expect(evaluateTransition(from, to)).toMatchObject({ kind: 'illegal' });
    });
  });

  describe('duplicate transitions', () => {
    it.each([PayoutStatus.PENDING, PayoutStatus.PROCESSING, PayoutStatus.PAID, PayoutStatus.FAILED])(
      'treats %s -> itself as a no-op, not an error',
      (status) => {
        expect(evaluateTransition(status, status)).toMatchObject({ kind: 'noop' });
      },
    );
  });

  describe('out-of-order delivery', () => {
    it('refuses to move PROCESSING backwards to PENDING (no such transition exists)', () => {
      expect(canTransition(PayoutStatus.PROCESSING, PayoutStatus.PENDING)).toBe(false);
    });

    it('allows a PAID notification to apply directly from PENDING (processing callback lost)', () => {
      // This is the case where an intermediate webhook never arrived. The final
      // truth must still be reachable rather than the payout getting stuck.
      expect(evaluateTransition(PayoutStatus.PENDING, PayoutStatus.PAID)).toEqual({ kind: 'apply' });
    });
  });
});
