import Redlock from 'redlock';
import Redis from 'ioredis';
import { Logger } from 'koatty_logger';

export interface ILockOptions {
  retryCount?: number;
  retryDelay?: number;
  retryJitter?: number;
}

export class RedLock {
  private static instance: RedLock;
  private redlock: Redlock;
  private logger: Logger;

  private constructor() {
    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
    });

    this.redlock = new Redlock(
      [redis],
      {
        retryCount: 10,
        retryDelay: 200,
        retryJitter: 200,
      }
    );

    this.logger = new Logger();

    this.redlock.on('error', (error: Error) => {
      this.logger.error('RedLock error:', error);
    });
  }

  public static getInstance(): RedLock {
    if (!RedLock.instance) {
      RedLock.instance = new RedLock();
    }
    return RedLock.instance;
  }

  public async acquire(resource: string, ttl: number): Promise<Redlock.Lock> {
    try {
      return await this.redlock.acquire([resource], ttl);
    } catch (error) {
      this.logger.error(`Failed to acquire lock for resource ${resource}:`, error);
      throw error;
    }
  }

  public async release(lock: Redlock.Lock): Promise<void> {
    try {
      await lock.release();
    } catch (error) {
      this.logger.error('Failed to release lock:', error);
      throw error;
    }
  }
} 