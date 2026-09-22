import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Phase 1 scope: connection + health-check ping only, per brief
 * Section 8 ("prepare for caching/queues, do not implement unnecessary
 * jobs yet"). BullMQ queues are introduced when the Reports/Notifications
 * modules land in later phases.
 */
@Injectable()
export class RedisHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisHealthService.name);
  private client!: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.client = new Redis(this.config.get<string>('REDIS_URL')!, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    this.client.on('error', (err) => this.logger.warn(`Redis connection issue: ${err.message}`));
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }

  async isHealthy(): Promise<boolean> {
    try {
      if (this.client.status !== 'ready') {
        await this.client.connect();
      }
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }
}
