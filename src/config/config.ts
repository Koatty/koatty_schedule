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

export const COMPONENT_SCHEDULED = 'COMPONENT_SCHEDULED';
export const COMPONENT_REDLOCK = 'COMPONENT_REDLOCK';

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
 * Validate cron expression format (supports both 5-part and 6-part formats)
 * 
 * 6-part format: second minute hour day month weekday
 * 5-part format: minute hour day month weekday
 * 
 * @param cron - Cron expression to validate
 * @throws {Error} When cron expression is invalid
 */
export function validateCronExpression(cron: string): void {
  if (!cron || typeof cron !== 'string') {
    throw new Error('Cron 表达式必须是非空字符串 (Cron expression must be a non-empty string)');
  }

  const cronParts = cron.trim().split(/\s+/);
  
  // Cron expressions should have 5 or 6 parts (with or without seconds)
  if (cronParts.length < 5 || cronParts.length > 6) {
    throw new Error(`Cron 表达式格式无效。期望 5 或 6 部分，实际得到 ${cronParts.length} 部分 (Invalid cron format. Expected 5 or 6 parts, got ${cronParts.length})`);
  }

  // Determine if this is a 6-part (with seconds) or 5-part expression
  const hasSecs = cronParts.length === 6;
  const offset = hasSecs ? 0 : -1;

  // Extract parts with proper indexing
  const seconds = hasSecs ? cronParts[0] : null;
  const minutes = cronParts[offset + 1];
  const hours = cronParts[offset + 2];
  const dayOfMonth = cronParts[offset + 3];
  const month = cronParts[offset + 4];
  const dayOfWeek = cronParts[offset + 5];

  // Validate seconds (0-59) if present
  if (seconds !== null) {
    validateCronField(seconds, 0, 59, 'seconds', '秒');
  }

  // Validate minutes (0-59)
  validateCronField(minutes, 0, 59, 'minutes', '分钟');

  // Validate hours (0-23)
  validateCronField(hours, 0, 23, 'hours', '小时');

  // Validate day of month (1-31)
  validateCronField(dayOfMonth, 1, 31, 'day of month', '日期');

  // Validate month (1-12 or JAN-DEC)
  validateCronField(month, 1, 12, 'month', '月份', ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']);

  // Validate day of week (0-7 or SUN-SAT, where 0 and 7 both represent Sunday)
  validateCronField(dayOfWeek, 0, 7, 'day of week', '星期', ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']);
}

/**
 * Validate individual cron field
 * @param field - Field value to validate
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @param fieldName - English field name for error messages
 * @param fieldNameCN - Chinese field name for error messages
 * @param allowedStrings - Optional array of allowed string values (e.g., month/weekday names)
 */
function validateCronField(
  field: string,
  min: number,
  max: number,
  fieldName: string,
  fieldNameCN: string,
  allowedStrings?: string[]
): void {
  // Allow wildcard
  if (field === '*') {
    return;
  }

  // Allow question mark (for day of month / day of week)
  if (field === '?') {
    return;
  }

  // Check for allowed string values (month/weekday names)
  if (allowedStrings && allowedStrings.some(str => field.toUpperCase().includes(str))) {
    return;
  }

  // Step values (e.g., */5, 0-30/5)
  if (field.includes('/')) {
    const [range, step] = field.split('/');
    const stepValue = parseInt(step);
    
    if (isNaN(stepValue) || stepValue <= 0) {
      throw new Error(`${fieldNameCN}字段的步长值无效: ${step} (Invalid step value for ${fieldName}: ${step})`);
    }
    
    if (range !== '*') {
      validateCronField(range, min, max, fieldName, fieldNameCN, allowedStrings);
    }
    return;
  }

  // Range values (e.g., 1-5)
  if (field.includes('-')) {
    const [start, end] = field.split('-');
    const startValue = parseInt(start);
    const endValue = parseInt(end);
    
    if (isNaN(startValue) || startValue < min || startValue > max) {
      throw new Error(`${fieldNameCN}字段的范围起始值无效: ${start}，必须在 ${min}-${max} 之间 (Invalid range start for ${fieldName}: ${start}, must be between ${min}-${max})`);
    }
    
    if (isNaN(endValue) || endValue < min || endValue > max) {
      throw new Error(`${fieldNameCN}字段的范围结束值无效: ${end}，必须在 ${min}-${max} 之间 (Invalid range end for ${fieldName}: ${end}, must be between ${min}-${max})`);
    }
    
    if (startValue > endValue) {
      throw new Error(`${fieldNameCN}字段的范围无效: ${start}-${end}，起始值不能大于结束值 (Invalid range for ${fieldName}: ${start}-${end}, start cannot be greater than end)`);
    }
    return;
  }

  // List values (e.g., 1,3,5)
  if (field.includes(',')) {
    const values = field.split(',');
    for (const value of values) {
      validateCronField(value.trim(), min, max, fieldName, fieldNameCN, allowedStrings);
    }
    return;
  }

  // Single numeric value
  const numValue = parseInt(field);
  if (isNaN(numValue) || numValue < min || numValue > max) {
    throw new Error(`${fieldNameCN}字段的值无效: ${field}，必须在 ${min}-${max} 之间 (Invalid ${fieldName} value: ${field}, must be between ${min}-${max})`);
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
export function getEffectiveTimezone(options: ScheduledOptions, userTimezone?: string): string {
  return userTimezone || options.timezone || 'Asia/Beijing';
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