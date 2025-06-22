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
import { COMPONENT_REDLOCK, DecoratorType, RedLockMethodOptions, getEffectiveRedLockOptions } from "../config/config";

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
export async function injectRedLock(_options: RedLockOptions, _app: Koatty): Promise<void> {
  try {
    logger.Debug('Starting batch RedLock injection...');

    const componentList = IOCContainer.listClass("COMPONENT");
    for (const component of componentList) {
      const classMetadata = IOCContainer.getClassMetadata(COMPONENT_REDLOCK, DecoratorType.REDLOCK,
        component.target);
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
             if (key.startsWith('REDLOCK')) {
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
   * Enhanced function wrapper with proper lock renewal and safety
   */
  const valueFunction = async (
    self: unknown,
    initialLock: Lock,
    lockTime: number,
    timeout: number,
    props: unknown[]
  ): Promise<unknown> => {
    let currentLock = initialLock;
    let remainingTime = timeout;
    const maxExtensions = 3; // 限制续期次数防止无限循环
    let extensionCount = 0;
    
    try {
      while (remainingTime > 0 && extensionCount < maxExtensions) {
        try {
          // 执行业务方法，与超时竞争
          const result = await Promise.race([
            value.apply(self, props),
            timeoutPromise(remainingTime)
          ]);
          return result; // 成功执行，返回业务结果
        } catch (error) {
          // 处理超时错误，尝试续期锁
          if (error instanceof Error && error.message === 'TIME_OUT_ERROR') {
            extensionCount++;
            logger.Debug(`Method ${method} execution timeout, attempting lock extension ${extensionCount}/${maxExtensions}`);
            
            try {
              // 续期锁，获得新的锁实例
              currentLock = await currentLock.extend(lockTime);
              remainingTime = lockTime - 200; // 预留200ms用于锁操作
              logger.Debug(`Lock extended for method: ${method}, remaining time: ${remainingTime}ms`);
              
              // 继续循环，重新执行业务方法
              continue;
            } catch (extendError) {
              logger.Error(`Failed to extend lock for method: ${method}`, extendError);
              throw new Error(`Lock extension failed: ${extendError instanceof Error ? extendError.message : 'Unknown error'}`);
            }
          } else {
            // 非超时错误，直接抛出
            throw error;
          }
        }
      }
      
      // 达到最大续期次数或剩余时间不足
      throw new Error(`Method ${method} execution timeout after ${extensionCount} lock extensions`);
    } finally {
      // 确保锁被释放
      try {
        await currentLock.release();
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