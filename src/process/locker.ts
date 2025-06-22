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
  
  app.once("appReady", async function () {
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
  });
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
        const lockOptions = getEffectiveRedLockOptions(methodOptions);
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