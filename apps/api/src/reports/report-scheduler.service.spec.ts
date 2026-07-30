import { ReportContentService } from './report-content.service';
import { ReportMailService } from './report-mail.service';
import { ReportSchedulerService } from './report-scheduler.service';
import { ReportsService } from './reports.service';

const PAYLOAD = {
  businessName: 'Brew Co',
  periodDays: 7,
  currency: 'INR',
  summary: {} as never,
  revenueByMethod: [],
};

describe('ReportSchedulerService', () => {
  let scheduler: ReportSchedulerService;
  let subscriptions: {
    findDueSubscriptions: jest.Mock;
    markSent: jest.Mock;
    getForUser: jest.Mock;
    markSentForUser: jest.Mock;
  };
  let content: { buildForUser: jest.Mock };
  let mail: { sendReport: jest.Mock };
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    subscriptions = {
      findDueSubscriptions: jest.fn().mockResolvedValue([]),
      markSent: jest.fn().mockResolvedValue(undefined),
      getForUser: jest.fn(),
      markSentForUser: jest.fn().mockResolvedValue(undefined),
    };
    content = { buildForUser: jest.fn().mockResolvedValue(PAYLOAD) };
    mail = { sendReport: jest.fn() };

    scheduler = new ReportSchedulerService(
      subscriptions as unknown as ReportsService,
      content as unknown as ReportContentService,
      mail as unknown as ReportMailService,
    );
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('sendDueReports', () => {
    it('does nothing under NODE_ENV=test', async () => {
      process.env.NODE_ENV = 'test';
      await scheduler.sendDueReports();
      expect(subscriptions.findDueSubscriptions).not.toHaveBeenCalled();
    });

    it('checks both WEEKLY and MONTHLY buckets outside test', async () => {
      process.env.NODE_ENV = 'development';
      await scheduler.sendDueReports();

      expect(subscriptions.findDueSubscriptions).toHaveBeenCalledWith('WEEKLY', 7);
      expect(subscriptions.findDueSubscriptions).toHaveBeenCalledWith('MONTHLY', 30);
    });

    it('sends and marks sent every due subscription', async () => {
      process.env.NODE_ENV = 'development';
      subscriptions.findDueSubscriptions.mockImplementation(async (frequency: string) =>
        frequency === 'WEEKLY'
          ? [
              {
                id: 'sub-1',
                userId: 'user-1',
                user: { id: 'user-1', email: 'a@brew.test', fullName: 'A', merchantId: 'merchant-1' },
              },
            ]
          : [],
      );

      await scheduler.sendDueReports();

      expect(content.buildForUser).toHaveBeenCalledWith('merchant-1', 'WEEKLY');
      expect(mail.sendReport).toHaveBeenCalledWith({
        email: 'a@brew.test',
        frequency: 'WEEKLY',
        payload: PAYLOAD,
      });
      expect(subscriptions.markSent).toHaveBeenCalledWith('sub-1');
    });

    it("doesn't let one subscription's failure stop the rest of the batch", async () => {
      process.env.NODE_ENV = 'development';
      subscriptions.findDueSubscriptions.mockImplementation(async (frequency: string) =>
        frequency === 'WEEKLY'
          ? [
              {
                id: 'sub-1',
                userId: 'user-1',
                user: { id: 'user-1', email: 'a@brew.test', fullName: 'A', merchantId: 'merchant-1' },
              },
              {
                id: 'sub-2',
                userId: 'user-2',
                user: { id: 'user-2', email: 'b@brew.test', fullName: 'B', merchantId: 'merchant-2' },
              },
            ]
          : [],
      );
      content.buildForUser.mockRejectedValueOnce(new Error('merchant gone')).mockResolvedValueOnce(PAYLOAD);

      await scheduler.sendDueReports();

      expect(mail.sendReport).toHaveBeenCalledTimes(1);
      expect(subscriptions.markSent).toHaveBeenCalledTimes(1);
      expect(subscriptions.markSent).toHaveBeenCalledWith('sub-2');
    });
  });

  describe('sendNow', () => {
    it('previews at WEEKLY when the subscription is OFF, without marking sent', async () => {
      subscriptions.getForUser.mockResolvedValue({ frequency: 'OFF', lastSentAt: null });

      const result = await scheduler.sendNow('user-1', 'merchant-1', 'a@brew.test');

      expect(content.buildForUser).toHaveBeenCalledWith('merchant-1', 'WEEKLY');
      expect(mail.sendReport).toHaveBeenCalledWith({
        email: 'a@brew.test',
        frequency: 'WEEKLY',
        payload: PAYLOAD,
      });
      expect(subscriptions.markSentForUser).not.toHaveBeenCalled();
      expect(result).toEqual({ frequency: 'WEEKLY', payload: PAYLOAD });
    });

    it('uses the saved frequency and marks sent when a real subscription exists', async () => {
      subscriptions.getForUser.mockResolvedValue({ frequency: 'MONTHLY', lastSentAt: null });

      await scheduler.sendNow('user-1', 'merchant-1', 'a@brew.test');

      expect(content.buildForUser).toHaveBeenCalledWith('merchant-1', 'MONTHLY');
      expect(subscriptions.markSentForUser).toHaveBeenCalledWith('user-1');
    });
  });
});
