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
 * Configuration manager for koatty_schedule
 * Integrated with koatty IOC container
 */
export class ConfigManager {
  private config: ScheduleConfig = {
    timezone: 'Asia/Beijing',
    RedLock: {
      lockTimeOut: 10000,
      retryCount: 3,
      retryDelay: 200,
      retryJitter: 200
    }
  };
  private loaded = false;
  private static instance: ConfigManager;

  constructor() {
    // Load environment configuration by default
    this.loadEnvironmentConfig();
    
    // Register this instance in IOC container
    this.registerInContainer();
  }

  /**
   * Register ConfigManager in IOC container
   * @private
   */
  private registerInContainer(): void {
    try {
      const { IOCContainer } = require('koatty_container');
      IOCContainer.reg('ConfigManager', this, {
        type: 'COMPONENT',
        args: []
      });
      logger.Debug('ConfigManager registered in IOC container');
    } catch (_error) {
      logger.Debug('IOC container not available, continuing without registration');
    }
  }

  /**
   * Get ConfigManager instance (singleton)
   */
  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Load configuration from environment variables
   */
  loadEnvironmentConfig(): void {
    try {
      const { IOCContainer } = require('koatty_container');
      const app = IOCContainer.getApp();
      if (app) {
        const appConfig = app.config('Schedule') || {};
        this.config = {
          timezone: appConfig.timezone || process.env.KOATTY_SCHEDULE_TIMEZONE || 'Asia/Beijing',
          RedLock: {
            lockTimeOut: appConfig.lockTimeOut || Number(process.env.REDLOCK_TIMEOUT) || 10000,
            retryCount: appConfig.retryCount || Number(process.env.REDLOCK_RETRY_COUNT) || 3,
            retryDelay: appConfig.retryDelay || Number(process.env.REDLOCK_RETRY_DELAY) || 200,
            retryJitter: appConfig.retryJitter || Number(process.env.REDLOCK_RETRY_JITTER) || 200
          }
        };
      } else {
        // Fallback to environment variables only
        this.config = {
          timezone: process.env.KOATTY_SCHEDULE_TIMEZONE || 'Asia/Beijing',
          RedLock: {
            lockTimeOut: Number(process.env.REDLOCK_TIMEOUT) || 10000,
            retryCount: Number(process.env.REDLOCK_RETRY_COUNT) || 3,
            retryDelay: Number(process.env.REDLOCK_RETRY_DELAY) || 200,
            retryJitter: Number(process.env.REDLOCK_RETRY_JITTER) || 200
          }
        };
      }
      
      this.loaded = true;
      logger.Debug('Configuration loaded from environment');
    } catch (_error) {
      logger.Debug('Using default configuration');
      this.loaded = true;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): ScheduleConfig {
    return { ...this.config };
  }

  /**
   * Merge custom configuration
   */
  mergeConfig(customConfig: Partial<ScheduleConfig>): void {
    this.config = {
      ...this.config,
      ...customConfig,
      RedLock: {
        ...this.config.RedLock,
        ...customConfig.RedLock
      }
    };
  }

  /**
   * Reset configuration to default
   */
  reset(): void {
    this.config = {
      timezone: 'Asia/Beijing',
      RedLock: {
        lockTimeOut: 10000,
        retryCount: 3,
        retryDelay: 200,
        retryJitter: 200
      }
    };
    this.loaded = false;
  }

  /**
   * Check if configuration is loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }
}

/**
 * Validate cron expression format
 * @param cron - Cron expression to validate
 * @throws {Error} When cron expression is invalid
 */
export function validateCronExpression(cron: string): void {
  if (!cron || typeof cron !== 'string') {
    throw new Error('Cron expression must be a non-empty string');
  }

  const cronParts = cron.trim().split(/\s+/);
  
  // Cron expressions should have 5 or 6 parts (with or without seconds)
  if (cronParts.length < 5 || cronParts.length > 6) {
    throw new Error(`Invalid cron expression format. Expected 5 or 6 parts, got ${cronParts.length}`);
  }

  // For 6-part cron (with seconds), validate each part
  if (cronParts.length === 6) {
    const [seconds, minutes, hours, dayOfMonth, months, dayOfWeek] = cronParts;
    
    // Basic validation for obvious invalid values
    if (!/^(\*|[0-9]|[0-5][0-9]|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+(,[0-9]+)*)$/.test(seconds)) {
      throw new Error('Invalid seconds field in cron expression');
    }
    if (!/^(\*|[0-9]|[0-5][0-9]|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+(,[0-9]+)*)$/.test(minutes)) {
      throw new Error('Invalid minutes field in cron expression');
    }
    if (!/^(\*|[0-9]|1[0-9]|2[0-3]|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+(,[0-9]+)*)$/.test(hours)) {
      throw new Error('Invalid hours field in cron expression');
    }
    
    // Check for simple out-of-range values
    const secondsValue = parseInt(seconds);
    if (!isNaN(secondsValue) && (secondsValue < 0 || secondsValue > 59)) {
      throw new Error('Seconds value must be between 0 and 59');
    }
  }
  
  // Additional basic checks for common invalid patterns
  if (cron.includes('60')) {
    // Check if 60 appears as a standalone number (not part of a larger number)
    const parts = cron.split(/[\s,\-\/]/);
    if (parts.some(part => part === '60')) {
      throw new Error('Invalid time value: 60 is not valid for any time field');
    }
  }
}

/**
 * Validate RedLock options
 * @param options - RedLock options to validate
 * @throws {Error} When options are invalid
 */
export function validateRedLockOptions(options: RedLockOptions): void {
  if (!options || typeof options !== 'object') {
    throw new Error('RedLock options must be an object');
  }

  if (options.lockTimeOut !== undefined) {
    if (typeof options.lockTimeOut !== 'number' || options.lockTimeOut <= 0) {
      throw new Error('lockTimeOut must be a positive number');
    }
  }

  if (options.retryCount !== undefined) {
    if (typeof options.retryCount !== 'number' || options.retryCount < 0) {
      throw new Error('retryCount must be a non-negative number');
    }
  }

  if (options.retryDelay !== undefined) {
    if (typeof options.retryDelay !== 'number' || options.retryDelay < 0) {
      throw new Error('retryDelay must be a non-negative number');
    }
  }

  if (options.retryJitter !== undefined) {
    if (typeof options.retryJitter !== 'number' || options.retryJitter < 0) {
      throw new Error('retryJitter must be a non-negative number');
    }
  }
} 