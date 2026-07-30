import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../user.schema';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { InviteTeammateDto } from './dto/invite-teammate.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { TeamService } from './team.service';

@ApiTags('team')
@ApiBearerAuth()
@Controller('team')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get('members')
  @ApiOperation({ summary: 'List everyone on the team, any role may view' })
  async listMembers(@CurrentUser() user: AuthenticatedUser) {
    return this.team.listMembers(user.merchantId);
  }

  @Get('invitations')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'List pending invitations' })
  async listInvitations(@CurrentUser() user: AuthenticatedUser) {
    return this.team.listPendingInvitations(user.merchantId);
  }

  @Post('invitations')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Invite a teammate by email' })
  async invite(@CurrentUser() user: AuthenticatedUser, @Body() dto: InviteTeammateDto) {
    return this.team.invite(user.merchantId, user.userId, dto);
  }

  @Delete('invitations/:id')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  async revokeInvitation(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.team.revokeInvitation(user.merchantId, id);
    return { success: true };
  }

  @Patch('members/:userId')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: "Change a teammate's role" })
  async updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    await this.team.updateMemberRole(user.merchantId, userId, dto.role);
    return { success: true };
  }

  @Delete('members/:userId')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: "Remove a teammate's access" })
  async removeMember(@CurrentUser() user: AuthenticatedUser, @Param('userId', ParseUUIDPipe) userId: string) {
    await this.team.removeMember(user.merchantId, userId);
    return { success: true };
  }
}
