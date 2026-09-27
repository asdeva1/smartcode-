import { Body, Controller, Post, Get, Req, Res, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthUser } from '@smartcode/types';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ChangePasswordDto } from './dto/change-password.dto';

const REFRESH_COOKIE = 'smartcode_refresh_token';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // tighter limit than the global default - see docs/07
  @Post('login')
  @ApiOperation({ summary: 'Authenticate with login name + password' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.authService.login(dto.loginName, dto.password);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return { user, accessToken: tokens.accessToken };
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate the access token using the refresh cookie' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    const tokens = await this.authService.refresh(refreshToken);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Invalidate the current session' })
  async logout(
    @CurrentUser('id') userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    await this.authService.logout(userId, refreshToken);
    res.clearCookie(REFRESH_COOKIE);
  }

  /**
   * Manager-only (RolesGuard at the route AND a role check in the
   * service). Every older session is invalidated; this device gets a new
   * token pair so the Manager stays signed in here.
   */
  @Post('change-password')
  @UseGuards(RolesGuard)
  @Roles('MANAGER')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Manager changes their own password; all earlier sessions are revoked" })
  async changePassword(
    @CurrentUser() caller: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.changePassword(caller, dto);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
    return { accessToken: tokens.accessToken, message: 'Password changed. Other sessions have been signed out.' };
  }

  @Get('me')
  @ApiOperation({ summary: 'Return the currently authenticated user' })
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
