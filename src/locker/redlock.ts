/*
 * @Description: RedLock utility for distributed locks
 * @Usage: 
 * @Author: richen
 * @Date: 2021-11-17 16:18:33
 * @LastEditTime: 2024-01-17 15:00:00
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

import { Redlock, Lock, Settings } from "@sesamecare-oss/redlock";
import { Redis } from "ioredis";
import { DefaultLogger as logger } from "koatty_logger";
import { IOCContainer } from "koatty_container";

/**
 * Configuration options for RedLock
 */
export interface RedLockOptions extends Partial<Settings> {
  lockTimeOut?: number;
  clockDriftFactor?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * Default RedLock configuration
 */
const DEFAULT_REDLOCK_CONFIG: RedLockOptions = {
  lockTimeOut: 10000,
  clockDriftFactor: 0.01,
  maxRetries: 3,
  retryDelayMs: 200,
  driftFactor: 0.01,
  retryCount: 3,
  retryDelay: 200,
  retryJitter: 200,
  automaticExtensionThreshold: 500
};

/**
 * Redis connection configuration
 */
export interface RedisConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

/**
 * Default Redis configuration
 */
const DEFAULT_REDIS_CONFIG: Required<RedisConfig> = {
  host: '127.0.0.1',
  port: 6379,
  password: '',
  db: 0,
  keyPrefix: 'redlock:'
};

/**
 * RedLock distributed lock manager
 * Integrated with koatty IOC container
 */
export class RedLocker {
  private redlock: Redlock | null = null;
  private redis: Redis | null = null;
  private config: RedLockOptions;
  private redisConfig: RedisConfig;
  private isInitialized = false;

  constructor(options?: RedLockOptions, redisConfig?: RedisConfig) {
    this.config = { ...DEFAULT_REDLOCK_CONFIG, ...options };
    this.redisConfig = { ...DEFAULT_REDIS_CONFIG, ...redisConfig };
    
    // Register this instance in IOC container
    this.registerInContainer();
  }

  /**
   * Register RedLocker in IOC container
   * @private
   */
  private registerInContainer(): void {
    try {
      // Register as a singleton component in IOC container
      IOCContainer.reg('RedLocker', this, {
        type: 'COMPONENT',
        args: []
      });
      logger.Debug('RedLocker registered in IOC container');
    } catch (_error) {
      logger.Warn('Failed to register RedLocker in IOC container:', _error);
    }
  }

  /**
   * Get RedLocker instance from IOC container
   * @static
   * @param options - RedLock configuration options
   * @param redisConfig - Redis configuration
   * @returns RedLocker instance
   */
  public static getInstance(options?: RedLockOptions, redisConfig?: RedisConfig): RedLocker {
    try {
      // Try to get from IOC container first
      let instance = IOCContainer.get('RedLocker', 'COMPONENT') as RedLocker;
      if (!instance) {
        // Create new instance if not found in container
        instance = new RedLocker(options, redisConfig);
      }
      return instance;
    } catch {
      logger.Debug('Creating new RedLocker instance outside IOC container');
      return new RedLocker(options, redisConfig);
    }
  }

  /**
   * Initialize RedLock with Redis connection
   * @private
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Try to get Redis instance from IOC container first
      try {
        this.redis = IOCContainer.get('Redis', 'COMPONENT') as Redis;
        logger.Debug('Using Redis instance from IOC container');
      } catch {
        // Create new Redis connection if not available in container
        this.redis = new Redis({
          host: this.redisConfig.host || DEFAULT_REDIS_CONFIG.host,
          port: this.redisConfig.port || DEFAULT_REDIS_CONFIG.port,
          password: this.redisConfig.password || undefined,
          db: this.redisConfig.db || DEFAULT_REDIS_CONFIG.db,
          keyPrefix: this.redisConfig.keyPrefix || DEFAULT_REDIS_CONFIG.keyPrefix,
          maxRetriesPerRequest: 3
        });
        logger.Debug('Created new Redis connection for RedLocker');
      }

      if (!this.redis) {
        throw new Error('Failed to initialize Redis connection');
      }

      // Initialize Redlock with the Redis instance
      this.redlock = new Redlock([this.redis], {
        driftFactor: this.config.driftFactor,
        retryCount: this.config.retryCount,
        retryDelay: this.config.retryDelay,
        retryJitter: this.config.retryJitter,
        automaticExtensionThreshold: this.config.automaticExtensionThreshold
      });

      // Set up error handlers
      this.redlock.on('clientError', (err: Error) => {
        logger.Error('Redis client error in RedLock:', err);
      });

      this.isInitialized = true;
      logger.Info('RedLocker initialized successfully');
    } catch (error) {
      logger.Error('Failed to initialize RedLocker:', error);
      throw new Error(`RedLocker initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Acquire a distributed lock
   * @param resources - Resource identifiers to lock
   * @param ttl - Time to live in milliseconds
   * @returns Promise<Lock>
   */
  async acquire(resources: string[], ttl?: number): Promise<Lock> {
    if (!Array.isArray(resources) || resources.length === 0) {
      throw new Error('Resources array cannot be empty');
    }

    const lockTtl = ttl || this.config.lockTimeOut;
    if (lockTtl <= 0) {
      throw new Error('Lock TTL must be positive');
    }

    // Ensure RedLocker is initialized
    await this.initialize();

    if (!this.redlock) {
      throw new Error('RedLock is not initialized');
    }

    try {
      // Add key prefix to resources
      const prefixedResources = resources.map(resource => 
        `${this.redisConfig.keyPrefix}${resource}`
      );

      logger.Debug(`Acquiring lock for resources: ${prefixedResources.join(', ')} with TTL: ${lockTtl}ms`);
      
      const lock = await this.redlock.acquire(prefixedResources, lockTtl);
      logger.Debug(`Lock acquired successfully for resources: ${prefixedResources.join(', ')}`);
      
      return lock;
    } catch (error) {
      logger.Error(`Failed to acquire lock for resources: ${resources.join(', ')}`, error);
      throw new Error(`Lock acquisition failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Release a lock
   * @param lock - Lock instance to release
   */
  async release(lock: Lock): Promise<void> {
    if (!lock) {
      throw new Error('Lock instance is required');
    }

    try {
      await lock.release();
      logger.Debug('Lock released successfully');
    } catch (error) {
      logger.Error('Failed to release lock:', error);
      throw new Error(`Lock release failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extend a lock's TTL
   * @param lock - Lock instance to extend
   * @param ttl - New TTL in milliseconds
   * @returns Extended lock
   */
  async extend(lock: Lock, ttl: number): Promise<Lock> {
    if (!lock) {
      throw new Error('Lock instance is required');
    }

    if (ttl <= 0) {
      throw new Error('TTL must be positive');
    }

    try {
      const extendedLock = await lock.extend(ttl);
      logger.Debug(`Lock extended successfully with TTL: ${ttl}ms`);
      return extendedLock;
    } catch (error) {
      logger.Error('Failed to extend lock:', error);
      throw new Error(`Lock extension failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if RedLocker is initialized
   * @returns true if initialized, false otherwise
   */
  isReady(): boolean {
    return this.isInitialized && !!this.redlock && !!this.redis;
  }

  /**
   * Get current configuration
   * @returns Current RedLock configuration
   */
  getConfig(): RedLockOptions {
    return { ...this.config };
  }

  /**
   * Get Redis configuration
   * @returns Current Redis configuration
   */
  getRedisConfig(): RedisConfig {
    return { ...this.redisConfig };
  }

  /**
   * Update configuration (requires reinitialization)
   * @param options - New RedLock options
   * @param redisConfig - New Redis configuration
   */
  updateConfig(options?: Partial<RedLockOptions>, redisConfig?: Partial<RedisConfig>): void {
    if (options) {
      this.config = { ...this.config, ...options };
    }
    if (redisConfig) {
      this.redisConfig = { ...this.redisConfig, ...redisConfig };
    }
    
    // Mark as uninitialized to force reinitialization on next use
    this.isInitialized = false;
    this.redlock = null;
    
    logger.Info('RedLocker configuration updated, will reinitialize on next use');
  }

  /**
   * Close Redis connection and cleanup
   */
  async close(): Promise<void> {
    try {
      if (this.redis && this.redis.status === 'ready') {
        await this.redis.quit();
        logger.Debug('Redis connection closed');
      }
      
      this.redis = null;
      this.redlock = null;
      this.isInitialized = false;
    } catch (error) {
      logger.Error('Error closing RedLocker:', error);
    }
  }

  /**
   * Get container registration status
   * @returns Registration information
   */
  getContainerInfo(): { registered: boolean; identifier: string } {
    try {
      const instance = IOCContainer.get('RedLocker', 'COMPONENT');
      return {
        registered: !!instance,
        identifier: 'RedLocker'
      };
    } catch {
      return {
        registered: false,
        identifier: 'RedLocker'
      };
    }
  }

  /**
   * Health check for RedLocker
   * @returns Health status
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: Record<string, any> }> {
    try {
      await this.initialize();
      
      const redisStatus = this.redis?.status || 'unknown';
      const isReady = this.isReady();
      
      return {
        status: isReady ? 'healthy' : 'unhealthy',
        details: {
          initialized: this.isInitialized,
          redisStatus,
          redlockReady: !!this.redlock,
          containerRegistered: this.getContainerInfo().registered
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          initialized: this.isInitialized
        }
      };
    }
  }
}