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
 * Configuration options for RedLock
 */
export interface RedLockOptions extends Partial<Settings> {
  lockTimeOut?: number;
  clockDriftFactor?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  redisConfig?: RedisConfig;
}

/**
 * Default RedLock configuration
 */
const defaultRedLockConfig: RedLockOptions = {
  lockTimeOut: 10000,
  clockDriftFactor: 0.01,
  maxRetries: 3,
  retryDelayMs: 200,
  driftFactor: 0.01,
  retryCount: 3,
  retryDelay: 200,
  retryJitter: 200,
  automaticExtensionThreshold: 500,
  redisConfig: {
    host: '127.0.0.1',
    port: 6379,
    password: '',
    db: 0,
    keyPrefix: 'redlock:'
  }
};

/**
 * RedLock distributed lock manager
 * Integrated with koatty IOC container
 * Implements singleton pattern for safe instance management
 */
export class RedLocker {
  private static instance: RedLocker | null = null;
  private static readonly instanceLock = Symbol('RedLocker.instanceLock');
  
  private redlock: Redlock | null = null;
  private redis: Redis | null = null;
  private config: RedLockOptions;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  // 私有构造函数防止外部直接实例化
  private constructor(options?: RedLockOptions) {
    this.config = { ...defaultRedLockConfig, ...options };
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
   * Get RedLocker singleton instance with thread-safe initialization
   * @static
   * @param options - RedLock configuration options (only used for first initialization)
   * @returns RedLocker singleton instance
   */
  public static getInstance(options?: RedLockOptions): RedLocker {
    // 双重检查锁定模式确保线程安全
    if (!RedLocker.instance) {
      // 首次创建时使用选项，后续调用忽略选项参数
      if (RedLocker.instance === null) {
        try {
          // 尝试从IOC容器获取已存在的实例
          const containerInstance = IOCContainer.get('RedLocker', 'COMPONENT') as RedLocker;
          if (containerInstance) {
            RedLocker.instance = containerInstance;
            logger.Debug('Retrieved existing RedLocker instance from IOC container');
          } else {
            // 创建新的单例实例
            RedLocker.instance = new RedLocker(options);
            logger.Debug('Created new RedLocker singleton instance');
          }
        } catch {
          // IOC容器不可用时直接创建
          RedLocker.instance = new RedLocker(options);
          logger.Debug('Created new RedLocker instance outside IOC container');
        }
      }
    } else if (options) {
      // 如果实例已存在但传入了新选项，记录警告
      logger.Warn('RedLocker instance already exists, ignoring new options. Use updateConfig() to change configuration.');
    }
    
    return RedLocker.instance;
  }

  /**
   * Reset singleton instance (主要用于测试)
   * @static
   */
  public static resetInstance(): void {
    if (RedLocker.instance) {
      RedLocker.instance.close().catch(err => 
        logger.Warn('Error while closing RedLocker instance during reset:', err)
      );
      RedLocker.instance = null;
    }
  }

  /**
   * Initialize RedLock with Redis connection
   * Uses cached promise to avoid duplicate initialization
   * @private
   */
  public async initialize(): Promise<void> {
    // 如果已经初始化，直接返回
    if (this.isInitialized) {
      return;
    }
    
    // 如果正在初始化，等待现有的初始化完成
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    
    // 创建初始化Promise并缓存
    this.initializationPromise = this.performInitialization();
    
    try {
      await this.initializationPromise;
    } catch (error) {
      // 初始化失败时清理缓存，允许重试
      this.initializationPromise = null;
      throw error;
    }
  }
  
  /**
   * 执行实际的初始化操作
   * @private
   */
  private async performInitialization(): Promise<void> {

    try {
      // Try to get Redis instance from IOC container first
      try {
        this.redis = IOCContainer.get('Redis', 'COMPONENT') as Redis;
        logger.Debug('Using Redis instance from IOC container');
      } catch {
        // Create new Redis connection if not available in container
        this.redis = new Redis({
          host: this.config.redisConfig.host,
          port: this.config.redisConfig.port,
          password: this.config.redisConfig.password || undefined,
          db: this.config.redisConfig.db || 0,
          keyPrefix: this.config.redisConfig.keyPrefix,
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
      this.isInitialized = false;
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
        `${this.config.redisConfig.keyPrefix}${resource}`
      );

      logger.Debug(`Acquiring lock for resources: ${prefixedResources.join(', ')} with TTL: ${lockTtl}ms`);
      
      const lock = await this.redlock.acquire(prefixedResources, lockTtl);
      logger.Debug(`Lock acquired successfully for resources: ${prefixedResources.join(', ')}`);
      
      return lock;
    } catch (error) {
      logger.Error(`Failed to acquire lock for resources: ${resources.join(', ')}`, error);
      // 保留原始错误信息，避免过度包装
      if (error instanceof Error) {
        error.message = `Lock acquisition failed: ${error.message}`;
        throw error;
      }
      throw new Error(`Lock acquisition failed: Unknown error`);
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
      // 保留原始错误信息
      if (error instanceof Error) {
        error.message = `Lock release failed: ${error.message}`;
        throw error;
      }
      throw new Error(`Lock release failed: Unknown error`);
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
   * Update configuration (requires reinitialization)
   * @param options - New RedLock options
   */
  updateConfig(options?: Partial<RedLockOptions>): void {
    if (options) {
      this.config = { ...this.config, ...options };
    }

    // 清理初始化状态，强制重新初始化
    this.isInitialized = false;
    this.initializationPromise = null;
    this.redlock = null;
    
    logger.Debug('RedLocker configuration updated, will reinitialize on next use');
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