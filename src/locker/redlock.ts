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
import { DefaultLogger as logger } from "koatty_logger";
import { IOCContainer } from "koatty_container";
import { IDistributedLock, ILockOptions, RedisConfig, RedisMode } from "./interface";
import { RedisFactory, RedisClientAdapter } from "./redis-factory";

/**
 * Configuration options for RedLock
 * @deprecated Use ILockOptions from interface instead
 */
export interface RedLockOptions extends ILockOptions {
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
  redisConfig: {
    mode: RedisMode.STANDALONE,
    host: '127.0.0.1',
    port: 6379,
    password: '',
    db: 0,
    keyPrefix: 'redlock:'
  }
};

/**
 * Default Redlock Settings for @sesamecare-oss/redlock
 */
const defaultRedlockSettings: Partial<Settings> = {
  driftFactor: 0.01,
  retryCount: 3,
  retryDelay: 200,
  retryJitter: 200,
  automaticExtensionThreshold: 500
};

/**
 * RedLock distributed lock manager
 * Integrated with koatty IOC container
 * Implements singleton pattern for safe instance management
 * Implements IDistributedLock interface for abstraction
 */
export class RedLocker implements IDistributedLock {
  private static instance: RedLocker | null = null;
  private static readonly instanceLock = Symbol('RedLocker.instanceLock');
  
  private redlock: Redlock | null = null;
  private redisClient: RedisClientAdapter | null = null;
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
      // 初始化失败时完整清理状态，允许重试
      this.initializationPromise = null;
      this.isInitialized = false;
      this.redlock = null;
      // 注意：不清理 redis 连接，因为它可能来自 IOC 容器
      logger.Warn('RedLocker initialization failed, state has been reset for retry');
      throw error;
    }
  }
  
  /**
   * 执行实际的初始化操作
   * @private
   */
  private async performInitialization(): Promise<void> {

    try {
      // Validate Redis configuration
      if (this.config.redisConfig) {
        RedisFactory.validateConfig(this.config.redisConfig);
      }

      // Try to get Redis instance from IOC container first
      try {
        const existingRedis = IOCContainer.get('Redis', 'COMPONENT');
        // If Redis instance exists in container, wrap it
        if (existingRedis) {
          // Check if it's already a RedisClientAdapter
          if (existingRedis instanceof RedisClientAdapter) {
            this.redisClient = existingRedis;
          } else {
            // Wrap raw Redis/Cluster instance (type assertion needed)
            this.redisClient = new RedisClientAdapter(existingRedis as any);
          }
          logger.Debug('Using Redis instance from IOC container');
        }
      } catch {
        // IOC container doesn't have Redis, create new connection
      }

      // Create new Redis connection if not available in container
      if (!this.redisClient && this.config.redisConfig) {
        this.redisClient = RedisFactory.createClient(this.config.redisConfig);
        logger.Debug('Created new Redis connection for RedLocker');
      }

      if (!this.redisClient) {
        throw new Error('Failed to initialize Redis connection: no configuration provided');
      }

      // Get underlying client for Redlock
      const underlyingClient = this.redisClient.getClient();

      // Merge default settings with user configuration
      // Extract Settings properties from config (which extends Partial<Settings>)
      const userSettings: any = this.config;
      const redlockSettings: Partial<Settings> = {
        ...defaultRedlockSettings,
        ...(userSettings.driftFactor !== undefined && { driftFactor: userSettings.driftFactor }),
        ...(userSettings.retryCount !== undefined && { retryCount: userSettings.retryCount }),
        ...(userSettings.retryDelay !== undefined && { retryDelay: userSettings.retryDelay }),
        ...(userSettings.retryJitter !== undefined && { retryJitter: userSettings.retryJitter }),
        ...(userSettings.automaticExtensionThreshold !== undefined && { 
          automaticExtensionThreshold: userSettings.automaticExtensionThreshold 
        })
      };

      // Initialize Redlock with the Redis instance
      this.redlock = new Redlock([underlyingClient], redlockSettings);

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
    return this.isInitialized && !!this.redlock && !!this.redisClient;
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
      if (this.redisClient && this.redisClient.status === 'ready') {
        await this.redisClient.quit();
        logger.Debug('Redis connection closed');
      }
      
      this.redisClient = null;
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
      
      const redisStatus = this.redisClient?.status || 'unknown';
      const isReady = this.isReady();
      
      return {
        status: isReady ? 'healthy' : 'unhealthy',
        details: {
          initialized: this.isInitialized,
          redisStatus,
          redisMode: this.config.redisConfig?.mode || 'unknown',
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