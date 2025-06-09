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
import { Lock } from "@sesamecare-oss/redlock";
import { timeoutPromise } from "../utils/lib";

/**
 * Initiation schedule locker client.
 *
 * @returns {Promise<void>}  
 */
export async function initRedLock(): Promise<void> {
  const app = IOCContainer.getApp();
  if (!app || !Helper.isFunction(app.once)) {
    logger.Warn(`RedLock initialization skipped: Koatty app not available or not initialized`);
    return;
  }
  
  app.once("appStart", async function () {
    try {
      const opt: RedLockOptions = app.config("RedLock", "db") ?? {};
      if (Helper.isEmpty(opt)) {
        throw Error(`Missing RedLock configuration. Please write a configuration item with the key name 'RedLock' in the db.ts file.`);
      }
      RedLocker.getInstance(opt);
      logger.Info('RedLock initialized successfully');
    } catch (error) {
      logger.Error('Failed to initialize RedLock:', error);
      throw error;
    }
  });
}

/**
 * Create redLocker Descriptor with improved error handling and type safety
 * @param descriptor - Property descriptor
 * @param name - Lock name
 * @param method - Method name
 * @param options - RedLock options
 * @returns Enhanced property descriptor
 */
export function redLockerDescriptor(
  descriptor: PropertyDescriptor,
  name: string,
  method: string,
  options?: RedLockOptions
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

  // 设置默认选项
  const lockOptions: RedLockOptions = {
    lockTimeOut: 10000,
    retryCount: 3,
    ...options
  };

  /**
   * Enhanced function wrapper with better error handling
   */
  const valueFunction = async (
    self: unknown,
    lock: Lock,
    lockTime: number,
    timeout: number,
    props: unknown[]
  ): Promise<unknown> => {
    try {
      // Wait for the function to complete or for the lock to time out.
      const result = await Promise.race([
        value.apply(self, props),
        timeoutPromise(timeout)
      ]);
      return result;
    } catch (error) {
      // If the lock times out and the function has not completed,
      // renew the lock once. after renewal, the function still has not completed,
      // the lock may be released prematurely.
      if (error instanceof Error && error.message === 'TIME_OUT_ERROR') {
        logger.Info(`The execution exceeds the lock duration, trigger lock renewal for method: ${method}`);
        try {
          // Extend the lock. Note that this returns a new `Lock` instance.
          const extendedLock = await lock.extend(timeout);
          // wait for timeout to release lock
          await timeoutPromise(timeout).catch(() => {
            logger.Warn(`Extended lock timeout for method: ${method}`);
          });
          return extendedLock;
        } catch (extendError) {
          logger.Error(`Failed to extend lock for method: ${method}`, extendError);
          throw extendError;
        }
      }
      throw error;
    } finally {
      // release lock
      try {
        await lock.release();
        logger.Debug(`Lock released for method: ${method}`);
      } catch (releaseError) {
        logger.Warn(`Failed to release lock for method: ${method}`, releaseError);
      }
    }
  };

  return {
    configurable,
    enumerable,
    writable: true,
    async value(...props: unknown[]): Promise<unknown> {
      try {
        const redlock = RedLocker.getInstance();

        // Acquire a lock.
        const lockTime = lockOptions.lockTimeOut || 10000;
        if (lockTime <= 200) {
          throw new Error("Lock timeout must be greater than 200ms to allow for proper execution");
        }

        const lock = await redlock.acquire([method, name], lockTime);
        const timeout = lockTime - 200;

        logger.Debug(`Lock acquired for method: ${method}, timeout: ${timeout}ms`);
        return await valueFunction(this, lock, lockTime, timeout, props);
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