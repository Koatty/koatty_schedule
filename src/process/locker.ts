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
import { Koatty } from "koatty_core";
import { DecoratorType, RedLockMethodOptions, getEffectiveRedLockOptions } from "../config/config";

/**
 * Initiation schedule locker client.
 *
 * @returns {Promise<void>}  
 */
export async function initRedLock(options: RedLockOptions, app: Koatty): Promise<void> {
  if (!app || !Helper.isFunction(app.once)) {
    logger.Warn(`RedLock initialization skipped: Koatty app not available or not initialized`);
    return;
  }

  app.once("appStart", async function () {
    try {
      if (Helper.isEmpty(options)) {
        throw Error(`Missing RedLock configuration. Please write a configuration item with the key name 'RedLock' in the db.ts file.`);
      }
      const redLocker = RedLocker.getInstance(options);
      await redLocker.initialize();
      logger.Info('RedLock initialized successfully');
    } catch (error) {
      logger.Error('Failed to initialize RedLock:', error);
      throw error;
    }
  });
}

/**
 * 批量注入RedLock锁 - 从IOC容器读取类元数据并应用所有RedLock装饰器
 *
 * @param {RedLockOptions} options - RedLock 配置选项  
 * @param {Koatty} app - Koatty 应用实例
 */
export async function injectRedLock(options: RedLockOptions, app: Koatty): Promise<void> {
  try {
    logger.Debug('Starting batch RedLock injection...');

    const componentList = IOCContainer.listClass("COMPONENT");
    for (const component of componentList) {
      const classMetadata = IOCContainer.getClassMetadata('COMPONENT', DecoratorType.REDLOCK,
        component);
      if (!classMetadata) {
        continue;
      }
      let redlockCount = 0;

      for (const [className, metadata] of classMetadata) {
        try {
          const instance: any = IOCContainer.get(className);
          if (!instance) {
            continue;
          }

                     // 查找所有RedLock方法的元数据
           for (const [key, value] of Object.entries(metadata)) {
             if (key.startsWith('REDLOCK:')) {
               const redlockData = value as {
                 method: string;
                 name: string;  // 装饰器中已确定，不会为undefined
                 options?: RedLockMethodOptions;
               };

               const targetMethod = instance[redlockData.method];
               if (!Helper.isFunction(targetMethod)) {
                 logger.Warn(`RedLock injection skipped: method ${redlockData.method} is not a function in ${className}`);
                 continue;
               }

               // 生成有效的RedLock选项：方法级别 > 全局配置 > 默认值
               const effectiveOptions = getEffectiveRedLockOptions(redlockData.options);

               // 应用RedLock增强描述符
               const originalDescriptor: PropertyDescriptor = {
                 value: targetMethod,
                 writable: true,
                 enumerable: false,
                 configurable: true
               };

               const enhancedDescriptor = redLockerDescriptor(
                 originalDescriptor, 
                 redlockData.name,  // 使用装饰器中确定的锁名称
                 redlockData.method,
                 effectiveOptions
               );

              // 替换原方法
              Object.defineProperty(instance, redlockData.method, enhancedDescriptor);

              redlockCount++;
              logger.Debug(`RedLock applied to ${className}.${redlockData.method} with lock name: ${redlockData.name}`);
            }
          }
        } catch (error) {
          logger.Error(`Failed to process class ${className}:`, error);
        }
      }

      logger.Info(`Batch RedLock injection completed. ${redlockCount} locks applied.`);
    }
  } catch (error) {
    logger.Error('Failed to inject RedLocks:', error);
  }
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

  // 设置默认选项，合并方法级别的选项
  const lockOptions = {
    lockTimeOut: methodOptions?.lockTimeOut || 10000,
    clockDriftFactor: methodOptions?.clockDriftFactor || 0.01,
    maxRetries: methodOptions?.maxRetries || 3,
    retryDelayMs: methodOptions?.retryDelayMs || 200
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
        logger.Debug(`The execution exceeds the lock duration, trigger lock renewal for method: ${method}`);
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