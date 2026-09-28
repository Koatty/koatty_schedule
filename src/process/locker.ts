/*
 * @Description: Decorator preprocessing mechanism for koatty_schedule
 * @Usage: 
 * @Author: richen
 * @Date: 2024-01-17 16:00:00
 * @LastEditTime: 2024-01-17 16:00:00
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

import { IOCContainer } from "koatty_container";
import { RedLocker, RedLockOptions } from "../locker/redlock";
import { Helper } from "koatty_lib";
import { DefaultLogger as logger } from "koatty_logger";
import { Koatty } from "koatty_core";
import { RedLockMethodOptions, getEffectiveRedLockOptions } from "../config/config";

/**
 * Initiation schedule locker client.
 *
 * @param {RedLockOptions} options - RedLock 配置选项
 * @param {Koatty} app - Koatty 应用实例
 * @returns {Promise<void>}  
 */
export async function initRedLock(options: RedLockOptions, app: Koatty): Promise<void> {
  if (!app || !Helper.isFunction(app.once)) {
    logger.Warn(`RedLock initialization skipped: Koatty app not available or not initialized`);
    return;
  }
  try {
    if (Helper.isEmpty(options)) {
      throw Error(`Missing RedLock configuration. Please write a configuration item with the key name 'RedLock' in the db.ts file.`);
    }
    // 获取RedLocker实例，在首次使用时自动初始化
    const redLocker = RedLocker.getInstance(options);
    await redLocker.initialize();
    logger.Info('RedLock initialized successfully');
  } catch (error) {
    logger.Error('Failed to initialize RedLock:', error);
    throw error;
  }
}

/**
 * Create redLocker Descriptor with improved error handling and type safety
 * @param descriptor - Property descriptor
 * @param name - Lock name
 * @param method - Method name
 * @param methodOptions - Method-level RedLock options
 * @returns Enhanced property descriptor
 */
export function redLockerDescriptor(
  descriptor: PropertyDescriptor,
  name: string,
  method: string,
  methodOptions?: RedLockMethodOptions
): PropertyDescriptor {
  // 参数验证
  if (!descriptor) {
    throw new Error('Property descriptor is required');
  }
  if (!name || typeof name !== 'string') {
    throw new Error('Lock name must be a non-empty string');
  }
  if (!method || typeof method !== 'string') {
    throw new Error('Method name must be a non-empty string');
  }

  const { value, configurable, enumerable } = descriptor;

  // 验证原始函数
  if (typeof value !== 'function') {
    throw new Error('Descriptor value must be a function');
  }

  /**
   * COR-05 (C-3): run the business method under a lock that is renewed in the
   * background.
   *
   * The previous implementation raced the method against a timeout and, on
   * timeout, extended the lock and **executed the business method again** — a
   * non-idempotent job could therefore run twice. `Promise.race` cannot cancel a
   * running promise, so the only safe model is: keep the lock alive (auto
   * extension) and let the method run once. When the lock cannot be kept, the
   * `AbortSignal` fires and the result is discarded (`signal.error`), never
   * re-run.
   */
  const valueFunction = async (
    self: unknown,
    lockTime: number,
    maxHoldTime: number,
    props: unknown[]
  ): Promise<unknown> => {
    const redlock = RedLocker.getInstance();
    // COR-05: one resource per lock (the lock name); locking `[method, name]`
    // doubled the Redis round trips without adding any guarantee.
    const resource = name;
    const startedAt = Date.now();

    const result = await redlock.using(
      [resource],
      lockTime,
      500,
      async (signal: AbortSignal) => {
        let holdExceeded = false;
        const watchdog = setTimeout(() => {
          holdExceeded = true;
          logger.Error(
            `Method ${method} has held the lock longer than maxHoldTime (${maxHoldTime}ms). ` +
            `The lock is no longer guaranteed and the method will NOT be re-run.`
          );
        }, maxHoldTime);
        // never keep the event loop alive just for this watchdog
        (watchdog as { unref?: () => void }).unref?.();

        try {
          // COR-05: the AbortSignal is handed to the business method so it can
          // check it before doing writes; a strict-fencing need should use a
          // fencing token.
          const value2 = await value.apply(self, [...props, { signal }]);

          if (signal.aborted) {
            const abortError = (signal as AbortSignal & { error?: Error }).error;
            throw abortError ?? new Error(`Lock lost while running ${method}: renewal failed`);
          }
          if (holdExceeded) {
            throw new Error(
              `Method ${method} exceeded maxHoldTime (${maxHoldTime}ms); the result is not trustworthy`
            );
          }
          return value2;
        } finally {
          clearTimeout(watchdog);
        }
      }
    );

    logger.Debug(`Method ${method} finished under lock after ${Date.now() - startedAt}ms`);
    return result;
  };

  return {
    configurable,
    enumerable,
    writable: true,
    async value(...props: unknown[]): Promise<unknown> {
      try {
        const lockOptions = getEffectiveRedLockOptions(methodOptions);
        const lockTime = lockOptions.lockTimeOut || 10000;
        if (lockTime <= 200) {
          throw new Error("Lock timeout must be greater than 200ms to allow for proper execution");
        }

        // COR-05: bounded hold time; exceeding it stops trusting the result
        const maxHoldTime = methodOptions?.maxHoldTime ?? lockTime * 10;

        logger.Debug(`Acquiring lock for method: ${method}, ttl: ${lockTime}ms, maxHoldTime: ${maxHoldTime}ms`);
        return await valueFunction(this, lockTime, maxHoldTime, props);
      } catch (error) {
        logger.Error(`RedLock operation failed for method: ${method}`, error);
        throw error;
      }
    },
  };
}

/**
 * Generate lock name for RedLock decorator
 */
export function generateLockName(configName: string | undefined, methodName: string, target: unknown): string {
  if (configName) {
    return configName;
  }

  try {
    const targetObj = target as object | Function;
    const identifier = IOCContainer.getIdentifier(targetObj);
    if (identifier) {
      return `${identifier}_${methodName}`;
    }
  } catch {
    // Fallback if IOC container is not available
  }

  const targetWithConstructor = target as { constructor?: Function };
  const className = targetWithConstructor.constructor?.name || 'Unknown';
  return `${className}_${methodName}`;
}