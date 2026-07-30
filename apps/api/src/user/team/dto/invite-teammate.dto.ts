import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../user.schema';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsString, Length, MaxLength } from 'class-validator';

export class InviteTeammateDto {
  @ApiProperty({ example: 'priya@northwindcoffee.test' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Priya Nair' })
  @IsString()
  @Length(2, 120)
  fullName!: string;

  @ApiProperty({ enum: UserRole, description: 'A merchant may have more than one OWNER' })
  @IsEnum(UserRole)
  role!: UserRole;
}
