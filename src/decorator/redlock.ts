/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2025-06-09 16:00:00
 * @LastEditTime: 2025-06-09 16:00:00
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

import { IOCContainer } from "koatty_container";
import { RedLockOptions } from "../locker/redlock";
import { Helper } from "koatty_lib";
import { DecoratorManager, DecoratorMetadata } from "./manager";
import { validateRedLockOptions, DecoratorType } from "../config/config";
import { initRedLock, redLockerDescriptor } from "../process/locker";


/**
 * RedLock decorator configuration  
 */
export interface RedLockConfig {
  name?: string;
  options?: RedLockOptions;
}

/**
 * Redis-based distributed lock decorator with optimized preprocessing
 *
 * @export
 * @param {string} [name] - The locker name. If name is duplicated, lock sharing contention will result.
 * @param {RedLockOptions} [options] - RedLock configuration options
 * 
 * Options:
 * - lockTimeOut?: number - Lock timeout in milliseconds (default: 10000)
 * - retryCount?: number - The max number of times Redlock will attempt to lock a resource (default: 3)
 * - RedisOptions: RedisOptions - Redis connection configuration
 * 
 * @returns {MethodDecorator}
 * @throws {Error} When decorator is used on wrong class type or invalid configuration
 */
export function RedLock(name?: string, options?: RedLockOptions): MethodDecorator {
  return (target: unknown, methodName: string, descriptor: PropertyDescriptor) => {
    // 验证装饰器使用的类型
    const targetObj = target as object | Function;
    const componentType = IOCContainer.getType(targetObj);
    if (componentType !== "SERVICE" && componentType !== "COMPONENT") {
      throw Error("@RedLock decorator can only be used on SERVICE or COMPONENT classes.");
    }

    // 验证方法名
    if (!methodName || typeof methodName !== 'string') {
      throw Error("Method name is required for @RedLock decorator");
    }

    // 验证方法描述符
    if (!descriptor || typeof descriptor.value !== 'function') {
      throw Error("@RedLock decorator can only be applied to methods");
    }

    // 生成锁名称
    let lockName = name;
    if (Helper.isEmpty(lockName)) {
      const targetWithConstructor = target as { constructor?: Function };
      const identifier = IOCContainer.getIdentifier(targetObj) || (targetWithConstructor.constructor ? targetWithConstructor.constructor.name : "");
      lockName = `${identifier}_${methodName}`;
    }

    // 验证生成的锁名称
    if (!lockName || typeof lockName !== 'string') {
      throw Error("Failed to generate valid lock name");
    }

    // 验证选项
    if (options) {
      try {
        validateRedLockOptions(options);
      } catch (error) {
        throw Error(`RedLock options validation failed: ${(error as Error).message}`);
      }
    }

    try {
      // 使用装饰器管理器进行预处理
      const decoratorManager = DecoratorManager.getInstance();

      // Register wrapper for RedLock decorator if not already registered
      if (!decoratorManager.hasWrapper(DecoratorType.REDLOCK)) {
        decoratorManager.registerWrapper(DecoratorType.REDLOCK, (originalMethod, config: RedLockConfig, methodName) => {
          const originalDescriptor: PropertyDescriptor = {
            value: originalMethod,
            writable: true,
            enumerable: false,
            configurable: true
          };

          const lockName = config.name || `redlock_${methodName}`;
          const enhancedDescriptor = redLockerDescriptor(originalDescriptor, lockName, methodName, config.options);

          return enhancedDescriptor.value!;
        });
      }

      const decoratorMetadata: DecoratorMetadata = {
        type: DecoratorType.REDLOCK,
        config: { name: lockName, options } as RedLockConfig,
        applied: true,
        priority: 2 // Higher priority than Scheduled
      };

      // 注册装饰器 - 这会处理重复检查、缓存和优化
      const processedDescriptor = decoratorManager.registerDecorator(
        target,
        methodName,
        decoratorMetadata,
        descriptor
      );



      // 初始化RedLock - 只在应用启动时进行一次
      initRedLock();

      return processedDescriptor;
    } catch (error) {
      throw Error(`Failed to apply RedLock to ${methodName}: ${(error as Error).message}`);
    }
  };
}