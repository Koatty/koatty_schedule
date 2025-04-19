import Redis from 'ioredis';
import { getConfig } from '../../config';
import { ILockOptions } from '../../interfaces';

export class RedLock {
  private static instance: RedLock;
  private redis: Redis;
  private renewalTimers: Map<string, NodeJS.Timeout>;

  private constructor() {
    const config = getConfig();
    this.redis = new Redis(config.redis);
    this.renewalTimers = new Map();
  }

  public static getInstance(): RedLock {
    if (!RedLock.instance) {
      RedLock.instance = new RedLock();
    }
    return RedLock.instance;
  }

  private async acquireLock(
    lockKey: string,
    lockTimeout: number,
    waitLockRetry: number
  ): Promise<boolean> {
    const lockValue = Date.now().toString();
    const acquired = await this.redis.set(
      lockKey,
      lockValue,
      'PX',
      lockTimeout,
      'NX'
    );

    if (acquired === 'OK') {
      this.startLockRenewal(lockKey, lockValue, lockTimeout);
      return true;
    }

    if (waitLockRetry > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return this.acquireLock(lockKey, lockTimeout, waitLockRetry - 1);
    }

    return false;
  }

  private startLockRenewal(
    lockKey: string,
    lockValue: string,
    lockTimeout: number
  ): void {
    const config = getConfig();
    const renewalInterval = config.lock.lockRenewalInterval;
    const renewalTimes = config.lock.lockRenewalTimes;

    let renewalCount = 0;
    const timer = setInterval(async () => {
      if (renewalCount >= renewalTimes) {
        this.stopLockRenewal(lockKey);
        return;
      }

      const renewed = await this.redis.set(
        lockKey,
        lockValue,
        'PX',
        lockTimeout,
        'XX'
      );

      if (renewed !== 'OK') {
        this.stopLockRenewal(lockKey);
        return;
      }

      renewalCount++;
    }, renewalInterval);

    this.renewalTimers.set(lockKey, timer);
  }

  private stopLockRenewal(lockKey: string): void {
    const timer = this.renewalTimers.get(lockKey);
    if (timer) {
      clearInterval(timer);
      this.renewalTimers.delete(lockKey);
    }
  }

  public async lock(
    name: string,
    options: ILockOptions = {}
  ): Promise<boolean> {
    const config = getConfig();
    const lockKey = `lock:${name}`;
    const lockTimeout = options.lockTimeout || config.lock.defaultLockTimeout;
    const waitLockRetry = options.waitLockRetry || config.lock.defaultWaitLockRetry;

    return this.acquireLock(lockKey, lockTimeout, waitLockRetry);
  }

  public async unlock(name: string): Promise<void> {
    const lockKey = `lock:${name}`;
    this.stopLockRenewal(lockKey);
    await this.redis.del(lockKey);
  }
} 