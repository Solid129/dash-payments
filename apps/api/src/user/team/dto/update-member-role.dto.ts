import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../user.schema';
import { IsEnum } from 'class-validator';

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;
}
