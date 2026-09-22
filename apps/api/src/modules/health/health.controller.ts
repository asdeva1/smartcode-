import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisHealthService } from './redis-health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisHealth: RedisHealthService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Reports API, PostgreSQL, and Redis status' })
  async check() {
    const [dbHealthy, redisHealthy] = await Promise.all([
      this.prisma.isHealthy(),
      this.redisHealth.isHealthy(),
    ]);

    const status = dbHealthy && redisHealthy ? 'ok' : 'degraded';

    return {
      status,
      timestamp: new Date().toISOString(),
      services: {
        api: 'ok',
        postgres: dbHealthy ? 'ok' : 'unreachable',
        redis: redisHealthy ? 'ok' : 'unreachable',
      },
    };
  }
}
