import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Throttle } from '@nestjs/throttler';

import type { AuthUser } from '@smartcode/types';

import { RolesGuard } from '../../common/guards/roles.guard';

import { Roles } from '../../common/decorators/roles.decorator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { Public } from '../../common/decorators/public.decorator';

import { PasswordResetService } from './password-reset.service';

import {
  CompletePasswordResetDto,
  ListPasswordResetRequestsDto,
  RejectPasswordResetDto,
  RequestPasswordResetDto,
  ValidateResetTokenDto,
} from './dto/password-reset.dto';

@ApiTags('password-reset')
@Controller()
export class PasswordResetController {
  constructor(private readonly passwordReset: PasswordResetService) {}

  @Post('users/:id/reset-password-request')
  @UseGuards(RolesGuard)
  @Roles('VENDOR', 'TEAM_LEAD')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Request a Manager-approved password reset for an own-scope Coder (Vendor: own vendor, Team Lead: own team) - never a direct reset',
  })
  request(
    @CurrentUser() caller: AuthUser,
    @Param('id') id: string,
    @Body() dto: RequestPasswordResetDto,
  ) {
    return this.passwordReset.request(caller, id, dto);
  }

  @Get('manager/password-reset-requests')
  @UseGuards(RolesGuard)
  @Roles('MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Manager lists password reset requests (defaults to pending)',
  })
  list(
    @CurrentUser() caller: AuthUser,
    @Query() query: ListPasswordResetRequestsDto,
  ) {
    return this.passwordReset.list(caller, query);
  }

  @Patch('manager/password-reset-requests/:id/approve')
  @UseGuards(RolesGuard)
  @Roles('MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Manager approves: generates a single-use reset link, returned once in this response',
  })
  approve(@CurrentUser() caller: AuthUser, @Param('id') id: string) {
    return this.passwordReset.approve(caller, id);
  }

  @Patch('manager/password-reset-requests/:id/reject')
  @UseGuards(RolesGuard)
  @Roles('MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Manager rejects: no reset link is ever generated',
  })
  reject(
    @CurrentUser() caller: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectPasswordResetDto,
  ) {
    return this.passwordReset.reject(caller, id, dto.reason);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password-reset/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Public: whether a reset token is currently usable',
  })
  validate(@Body() dto: ValidateResetTokenDto) {
    return this.passwordReset.validate(dto.token);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password-reset/complete')
  @ApiOperation({
    summary:
      'Public: sets a new password using a valid, unused, unexpired reset token',
  })
  complete(@Body() dto: CompletePasswordResetDto) {
    return this.passwordReset.complete(dto.token, dto.newPassword);
  }
}