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