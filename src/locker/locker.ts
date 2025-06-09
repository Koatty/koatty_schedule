/**
 * @ author: richen
 * @ copyright: Copyright (c) - <richenlin(at)gmail.com>
 * @ license: MIT
 * @ version: 2020-06-05 09:40:35
 */
import * as crypto from "crypto";
import { CacheStore, StoreOptions } from "koatty_store";
import { DefaultLogger as logger } from "koatty_logger";

/**
 * Lock information interface
 */
interface LockInfo {
  value: string;
  expire: number;
  time: number;
}

/**
 * Wait for a period of time (ms)
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
const delay = function (ms = 1000): Promise<void> {
  return new Promise((resolve: () => void) => setTimeout(() => resolve(), ms));
};

/**
 * Enhanced Locker class for koatty_schedule
 */
export class Locker {
  private lockMap: Map<string, LockInfo>;
  private options: StoreOptions;
  private static instance: Locker;
  private client: unknown;
  private cacheStore: unknown;

  /**
   * Get singleton instance
   *
   * @static
   * @param {StoreOptions} options
   * @param {boolean} [force=false]
   * @returns {Locker}
   * @memberof Locker
   */
  static getInstance(options: StoreOptions, force = false): Locker {
    if (!this.instance || force) {
      this.instance = new Locker(options);
    }
    return this.instance;
  }

  /**
   * Creates an instance of Locker
   * @param {StoreOptions} options
   * @memberof Locker
   */
  private constructor(options: StoreOptions) {
    if (!options) {
      throw new Error('StoreOptions is required for Locker initialization');
    }

    this.lockMap = new Map();
    this.options = {
      keyPrefix: 'koatty_lock:',
      ...options
    };
    this.client = null;
    this.cacheStore = CacheStore.getInstance(this.options);
  }

  /**
   * Get cache store client
   *
   * @returns {Promise<unknown>}  
   * @memberof Locker
   */
  async getClient(): Promise<unknown> {
    try {
      if (!this.client || (this.client as { status?: string }).status !== 'ready') {
        this.client = await (this.cacheStore as { getConnection: () => Promise<unknown> }).getConnection();
      }
      return this.client;
    } catch (e) {
      logger.Error(`CacheStore connection failed. ${(e as Error).message}`);
      throw e;
    }
  }

  /**
   * Define Lua commands for atomic operations
   *
   * @returns {Promise<unknown>}
   * @memberof Locker
   */
  async defineCommand(): Promise<unknown> {
    try {
      const client = await this.getClient();
      
      //Lua scripts execute atomically
      if (client && !(client as { getCompare?: Function }).getCompare) {
        (client as { defineCommand: Function }).defineCommand('getCompare', {
          numberOfKeys: 1,
          lua: `
            local remote_value = redis.call("get",KEYS[1])

            if (not remote_value) then
                return 0
            elseif (remote_value == ARGV[1]) then
                return redis.call("del",KEYS[1])
            else
                return -1
            end
          `});
      }
      return client;
    } catch (e) {
      logger.Error(`Failed to define commands: ${(e as Error).message}`);
      throw e;
    }
  }

  /**
   * Get a lock
   *
   * @param {string} key
   * @param {number} [expire=10000]
   * @returns {Promise<boolean>}
   * @memberof Locker
   */
  async lock(key: string, expire = 10000): Promise<boolean> {
    if (!key || typeof key !== 'string') {
      throw new Error('Lock key must be a non-empty string');
    }

    if (expire < 1000) {
      throw new Error('Lock expire time must be at least 1000ms');
    }

    try {
      const client = await this.getClient();
      const lockKey = `${this.options.keyPrefix}${key}`;
      const value = crypto.randomBytes(16).toString('hex');
      
      const result = await (client as { set: Function }).set(lockKey, value, 'NX', 'PX', expire);
      
      if (result === null) {
        logger.Debug(`Lock failed: key ${lockKey} already exists`);
        return false;
      }

      this.lockMap.set(lockKey, { value, expire, time: Date.now() });
      logger.Debug(`Lock acquired: ${lockKey}`);
      return true;
    } catch (e) {
      logger.Error(`Lock operation failed for key ${key}: ${(e as Error).message}`);
      return false;
    }
  }

  /**
   * Wait for lock with improved retry strategy
   * Attempts to lock once every interval time, and fails when return time exceeds waitTime
   *
   * @param {string} key
   * @param {number} expire
   * @param {number} [interval=50] - Initial retry interval in ms
   * @param {number} [waitTime=15000] - Maximum wait time in ms
   * @returns {Promise<boolean>}
   * @memberof Locker
   */
  async waitLock(key: string, expire: number, interval = 50, waitTime = 15000): Promise<boolean> {
    if (!key || typeof key !== 'string') {
      throw new Error('Lock key must be a non-empty string');
    }

    if (expire < 1000) {
      throw new Error('Lock expire time must be at least 1000ms');
    }

    try {
      const startTime = Date.now();
      let currentInterval = interval;
      let attempts = 0;

      while ((Date.now() - startTime) < waitTime) {
        attempts++;
        
        try {
          const result = await this.lock(key, expire);
          if (result) {
            logger.Debug(`Lock acquired after ${attempts} attempts in ${Date.now() - startTime}ms`);
            return true;
          }
        } catch (err) {
          logger.Warn(`Lock attempt ${attempts} failed: ${(err as Error).message}`);
        }

        // Simple exponential backoff with cap
        await delay(currentInterval);
        currentInterval = Math.min(currentInterval * 1.2, 1000);
      }

      logger.Warn(`waitLock timeout after ${waitTime}ms and ${attempts} attempts`);
      return false;
    } catch (e) {
      logger.Error(`waitLock failed for key ${key}: ${(e as Error).message}`);
      return false;
    }
  }

  /**
   * Release lock
   * Regardless of whether the key exists and the unlock is successful, no error will be thrown (except for network reasons). 
   * 
   * The specific return value is:
   * 
   * null: key does not exist locally
   * 
   * 0: key does not exist on redis
   * 
   * 1: unlocked successfully
   * 
   * -1: value does not correspond and cannot be unlocked
   *
   * @param {string} key
   * @returns {Promise<boolean | null>}
   * @memberof Locker
   */
  async unLock(key: string): Promise<boolean | null> {
    if (!key || typeof key !== 'string') {
      throw new Error('Lock key must be a non-empty string');
    }

    try {
      const lockKey = `${this.options.keyPrefix}${key}`;
      
      if (!this.lockMap.has(lockKey)) {
        logger.Debug(`Lock key ${lockKey} does not exist locally`);
        return null;
      }

      const lockInfo = this.lockMap.get(lockKey);
      if (!lockInfo) {
        return null;
      }

      // 适配memory类型cacheStore
      await (this.cacheStore as { getCompare: Function }).getCompare(lockKey, lockInfo.value);

      this.lockMap.delete(lockKey);
      logger.Debug(`Lock released: ${lockKey}`);
      return true;
    } catch (e) {
      logger.Error(`Unlock operation failed for key ${key}: ${(e as Error).message}`);
      return false;
    }
  }
}