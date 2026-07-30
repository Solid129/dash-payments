import { Module } from '@nestjs/common';

import { TokenModule } from '../../auth/token.module';
import { UserModule } from '../user.module';
import { TeamController } from './team.controller';
import { TeamMailService } from './team-mail.service';
import { TeamRepository } from './team.repository';
import { TeamService } from './team.service';

@Module({
  imports: [TokenModule, UserModule],
  controllers: [TeamController],
  providers: [TeamRepository, TeamService, TeamMailService],
  exports: [TeamService],
})
export class TeamModule {}
