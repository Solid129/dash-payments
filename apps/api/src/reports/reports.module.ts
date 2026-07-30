import { Module } from '@nestjs/common';

import { DashboardModule } from '../dashboard/dashboard.module';
import { UserModule } from '../user/user.module';
import { ReportContentService } from './report-content.service';
import { ReportMailService } from './report-mail.service';
import { ReportSchedulerService } from './report-scheduler.service';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

@Module({
  imports: [DashboardModule, UserModule],
  controllers: [ReportsController],
  providers: [
    ReportsRepository,
    ReportsService,
    ReportContentService,
    ReportMailService,
    ReportSchedulerService,
  ],
})
export class ReportsModule {}
