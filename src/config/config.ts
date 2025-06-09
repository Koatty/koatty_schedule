/*
 * @Description: Configuration management for koatty_schedule
 * @Usage: 
 * @Author: richen
 * @Date: 2024-01-17 15:30:00
 * @LastEditTime: 2024-01-17 16:30:00
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

import { RedLockOptions } from "../locker/redlock";
import { DefaultLogger as logger } from "koatty_logger";

/**
 * Schedule configuration interface
 */
export interface ScheduleConfig {
  timezone?: string;
  RedLock?: RedLockOptions;
}

/**
 * Configuration manager for scheduling and locking
 */
export class ConfigManager {
  private config: ScheduleConfig = {};
  private loaded = false;

  constructor() {
    // Register this instance in IOC container if available
    this.registerInContainer();
  }

  /**
   * Register ConfigManager in IOC container
   * @private
   */
  private registerInContainer(): void {
    try {
      const { IOCContainer } = require("koatty_container");
      IOCContainer.reg('ConfigManager', this, {
        type: 'COMPONENT',
        args: []
      });
      logger.Debug('ConfigManager registered in IOC container');
    } catch (error) {
      logger.Debug('IOC container not available, using standalone ConfigManager');
    }
  }

  /**
   * Get ConfigManager instance
   * @static
   */
  public static getInstance(): ConfigManager {
    try {
      const { IOCContainer } = require("koatty_container");
      let instance = IOCContainer.get('ConfigManager', 'COMPONENT') as ConfigManager;
      if (!instance) {
        instance = new ConfigManager();
      }
      return instance;
    } catch {
      return new ConfigManager();
    }
  }

  /**
   * Load configuration from environment variables
   */
  loadEnvironmentConfig(): void {
    try {
      this.config = {
        timezone: process.env.KOATTY_SCHEDULE_TIMEZONE || 'Asia/Beijing',
        RedLock: {
          lockTimeOut: Number(process.env.REDLOCK_TIMEOUT) || 10000,
          retryCount: Number(process.env.REDLOCK_RETRY_COUNT) || 3,
          retryDelay: Number(process.env.REDLOCK_RETRY_DELAY) || 200,
          retryJitter: Number(process.env.REDLOCK_RETRY_JITTER) || 200
        }
      };
      
      this.loaded = true;
      logger.Debug('Configuration loaded from environment');
    } catch (_error) {
      logger.Warn('Failed to load environment configuration:', _error);
    }
  }

  /**
   * Merge user configuration with defaults
   * @param userConfig - User provided configuration
   */
  mergeConfig(userConfig: ScheduleConfig): void {
    this.config = {
      ...this.config,
      ...userConfig,
      RedLock: {
        ...this.config.RedLock,
        ...userConfig.RedLock
      }
    };
    logger.Debug('Configuration merged successfully');
  }

  /**
   * Get current configuration
   * @returns Current configuration
   */
  getConfig(): ScheduleConfig {
    return { ...this.config };
  }

  /**
   * Get RedLock configuration
   * @returns RedLock configuration
   */
  getRedLockConfig(): RedLockOptions {
    return this.config.RedLock ? { ...this.config.RedLock } : {};
  }

  /**
   * Get timezone configuration
   * @returns Timezone string
   */
  getTimezone(): string {
    return this.config.timezone || 'Asia/Beijing';
  }

  /**
   * Check if configuration is loaded
   * @returns true if loaded, false otherwise
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Validate cron expression
   * @param cron - Cron expression to validate
   * @returns true if valid
   * @throws Error if invalid
   */
  validateCronExpression(cron: string): boolean {
    if (!cron || typeof cron !== 'string') {
      throw new Error('Cron expression must be a non-empty string');
    }

    // Basic cron validation - split into parts
    const parts = cron.trim().split(/\s+/);
    
    if (parts.length !== 6) {
      throw new Error('Cron expression must have exactly 6 parts: second minute hour day month dayOfWeek');
    }

    // Validate each part is not empty
    for (let i = 0; i < parts.length; i++) {
      if (!parts[i] || parts[i].trim() === '') {
        throw new Error(`Cron expression part ${i + 1} cannot be empty`);
      }
    }

    return true;
  }

  /**
   * Validate RedLock options
   * @param options - RedLock options to validate
   * @returns Validated options
   * @throws Error if invalid
   */
  validateRedLockOptions(options: RedLockOptions): RedLockOptions {
    if (!options || typeof options !== 'object') {
      throw new Error('RedLock options must be an object');
    }

    const validated: RedLockOptions = { ...options };

    // Validate lockTimeOut
    if (validated.lockTimeOut !== undefined) {
      if (typeof validated.lockTimeOut !== 'number' || validated.lockTimeOut <= 0) {
        throw new Error('lockTimeOut must be a positive number');
      }
      if (validated.lockTimeOut < 1000) {
        logger.Warn('lockTimeOut is less than 1000ms, this may cause issues');
      }
    }

    // Validate retryCount
    if (validated.retryCount !== undefined) {
      if (typeof validated.retryCount !== 'number' || validated.retryCount < 0) {
        throw new Error('retryCount must be a non-negative number');
      }
    }

    // Validate retryDelay
    if (validated.retryDelay !== undefined) {
      if (typeof validated.retryDelay !== 'number' || validated.retryDelay < 0) {
        throw new Error('retryDelay must be a non-negative number');
      }
    }

    return validated;
  }

  /**
   * Reset configuration to defaults
   */
  reset(): void {
    this.config = {};
    this.loaded = false;
    logger.Debug('Configuration reset to defaults');
  }
}

/**
 * Legacy validation functions for backward compatibility
 */

/**
 * Validate cron expression
 * @param cron - Cron expression to validate
 * @returns true if valid
 * @throws Error if invalid
 */
export function validateCronExpression(cron: string): boolean {
  const manager = ConfigManager.getInstance();
  return manager.validateCronExpression(cron);
}

/**
 * Validate RedLock options
 * @param options - RedLock options to validate
 * @returns Validated options
 * @throws Error if invalid
 */
export function validateRedLockOptions(options: RedLockOptions): RedLockOptions {
  const manager = ConfigManager.getInstance();
  return manager.validateRedLockOptions(options);
} 