import { ReportsRepository } from './reports.repository';
import { ReportFrequency } from './reports.schema';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let repo: {
    findByUserId: jest.Mock;
    upsertForUser: jest.Mock;
    findDue: jest.Mock;
    markSent: jest.Mock;
    markSentByUserId: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      findByUserId: jest.fn(),
      upsertForUser: jest.fn(),
      findDue: jest.fn().mockResolvedValue([]),
      markSent: jest.fn().mockResolvedValue(undefined),
      markSentByUserId: jest.fn().mockResolvedValue(undefined),
    };

    service = new ReportsService(repo as unknown as ReportsRepository);
  });

  describe('getForUser', () => {
    it('defaults to OFF when no subscription row exists yet', async () => {
      repo.findByUserId.mockResolvedValue(undefined);

      const result = await service.getForUser('user-1');
      expect(result).toEqual({ frequency: ReportFrequency.OFF, lastSentAt: null });
    });

    it('returns the saved preference when a row exists', async () => {
      const lastSentAt = new Date('2026-07-01T00:00:00.000Z');
      repo.findByUserId.mockResolvedValue({ frequency: ReportFrequency.WEEKLY, lastSentAt });

      const result = await service.getForUser('user-1');
      expect(result).toEqual({ frequency: ReportFrequency.WEEKLY, lastSentAt });
    });
  });

  describe('updateForUser', () => {
    it('upserts and returns the new preference', async () => {
      repo.upsertForUser.mockResolvedValue({ frequency: ReportFrequency.MONTHLY, lastSentAt: null });

      const result = await service.updateForUser('user-1', ReportFrequency.MONTHLY);

      expect(repo.upsertForUser).toHaveBeenCalledWith('user-1', ReportFrequency.MONTHLY);
      expect(result).toEqual({ frequency: ReportFrequency.MONTHLY, lastSentAt: null });
    });
  });

  describe('findDueSubscriptions', () => {
    it('computes a cutoff intervalDays in the past', async () => {
      const before = Date.now();
      await service.findDueSubscriptions('WEEKLY', 7);
      const after = Date.now();

      expect(repo.findDue).toHaveBeenCalledWith('WEEKLY', expect.any(Date));
      const cutoff = repo.findDue.mock.calls[0][1] as Date;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - sevenDaysMs - 1000);
      expect(cutoff.getTime()).toBeLessThanOrEqual(after - sevenDaysMs + 1000);
    });
  });

  describe('markSent / markSentForUser', () => {
    it('marks a subscription sent by id', async () => {
      await service.markSent('sub-1');
      expect(repo.markSent).toHaveBeenCalledWith('sub-1', expect.any(Date));
    });

    it('marks a subscription sent by user id', async () => {
      await service.markSentForUser('user-1');
      expect(repo.markSentByUserId).toHaveBeenCalledWith('user-1', expect.any(Date));
    });
  });
});
