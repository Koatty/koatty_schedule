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

/**
 * Scheduled global options interface
 */
export interface ScheduledOptions extends RedLockOptions {
  timezone?: string;
}

/**
 * RedLock method-level options (excluding Redis connection config)
 */
export interface RedLockMethodOptions {
  lockTimeOut?: number;        // Lock timeout in milliseconds
  clockDriftFactor?: number;   // Clock drift factor for lock timeout calculation
  maxRetries?: number;         // Maximum number of retry attempts
  retryDelayMs?: number;       // Delay between retry attempts in milliseconds
}

/**
 * RedLock decorator configuration  
 */
export interface RedLockConfig {
  name?: string;
  options?: RedLockOptions;
}

/**
 * Decorator types supported by the system
 */
export enum DecoratorType {
  SCHEDULED = 'SCHEDULED',
  REDLOCK = 'REDLOCK'
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
    const [seconds, minutes, hours] = cronParts;
    
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
 * Validate RedLock method-level options
 * @param options - RedLock method options to validate
 * @throws {Error} When options are invalid
 */
export function validateRedLockMethodOptions(options: RedLockMethodOptions): void {
  if (!options || typeof options !== 'object') {
    throw new Error('RedLock method options must be an object');
  }

  if (options.lockTimeOut !== undefined) {
    if (typeof options.lockTimeOut !== 'number' || options.lockTimeOut <= 0) {
      throw new Error('lockTimeOut must be a positive number');
    }
  }

  if (options.clockDriftFactor !== undefined) {
    if (typeof options.clockDriftFactor !== 'number' || options.clockDriftFactor < 0 || options.clockDriftFactor > 1) {
      throw new Error('clockDriftFactor must be a number between 0 and 1');
    }
  }

  if (options.maxRetries !== undefined) {
    if (typeof options.maxRetries !== 'number' || options.maxRetries < 0) {
      throw new Error('maxRetries must be a non-negative number');
    }
  }

  if (options.retryDelayMs !== undefined) {
    if (typeof options.retryDelayMs !== 'number' || options.retryDelayMs < 0) {
      throw new Error('retryDelayMs must be a non-negative number');
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

//==================== Global Configuration Management ====================

/**
 * Global configuration storage
 */
let globalScheduledOptions: ScheduledOptions = {};

/**
 * Set global scheduled options
 * @param options - Global scheduled options
 */
export function setGlobalScheduledOptions(options: ScheduledOptions): void {
  globalScheduledOptions = { ...options };
}

/**
 * Get global scheduled options
 * @returns Global scheduled options
 */
export function getGlobalScheduledOptions(): ScheduledOptions {
  return globalScheduledOptions;
}

/**
 * Get effective timezone with priority: user specified > global > default
 * @param userTimezone - User specified timezone
 * @returns Effective timezone
 */
export function getEffectiveTimezone(userTimezone?: string): string {
  return userTimezone || globalScheduledOptions.timezone || 'Asia/Beijing';
}



/**
 * Get effective RedLock method options with priority: method options > global options > defaults
 * @param methodOptions - Method-level RedLock options
 * @returns Effective RedLock method options with all defaults applied
 */
export function getEffectiveRedLockOptions(methodOptions?: RedLockMethodOptions): RedLockMethodOptions {
  const globalOptions = getGlobalScheduledOptions();
  
  return {
    lockTimeOut: methodOptions?.lockTimeOut || globalOptions.lockTimeOut || 10000,
    clockDriftFactor: methodOptions?.clockDriftFactor || globalOptions.clockDriftFactor || 0.01,
    maxRetries: methodOptions?.maxRetries || globalOptions.maxRetries || 3,
    retryDelayMs: methodOptions?.retryDelayMs || globalOptions.retryDelayMs || 200
  };
} 