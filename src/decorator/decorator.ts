/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2025-06-09 16:00:00
 * @LastEditTime: 2025-06-09 16:00:00
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

import { Helper } from "koatty_lib";
import { initRedLock } from "../process/schedule";
import { validateCronExpression, validateRedLockOptions } from "../config/config";
import { DecoratorManager, DecoratorType, DecoratorMetadata, ScheduledConfig, RedLockConfig } from "./manager";
import { injectSchedule } from "../process/schedule";
import { RedLockOptions } from "../locker/redlock";
import { IOCContainer } from "koatty_container";

/**
 * Schedule task decorator with optimized preprocessing
 *
 * @export
 * @param {string} cron - Cron expression for task scheduling
 * @param {string} [timezone='Asia/Beijing'] - Timezone for the schedule
 * 
 * Cron expression format:
 * * Seconds: 0-59
 * * Minutes: 0-59
 * * Hours: 0-23
 * * Day of Month: 1-31
 * * Months: 1-12 (Jan-Dec)
 * * Day of Week: 1-7 (Sun-Sat)
 * 
 * @returns {MethodDecorator}
 * @throws {Error} When cron expression is invalid or decorator is used on wrong class type
 */
export function Scheduled(cron: string, timezone = 'Asia/Beijing'): MethodDecorator {
  // 参数验证
  if (Helper.isEmpty(cron)) {
    throw Error("Cron expression is required and cannot be empty");
  }

  // 验证cron表达式格式
  try {
    validateCronExpression(cron);
  } catch (error) {
    throw Error(`Invalid cron expression: ${(error as Error).message}`);
  }

  // 验证时区
  if (timezone && typeof timezone !== 'string') {
    throw Error("Timezone must be a string");
  }

  return (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) => {
    // 验证装饰器使用的类型
    const targetObj = target as object | Function;
    const componentType = IOCContainer.getType(targetObj);
    if (componentType !== "SERVICE" && componentType !== "COMPONENT") {
      throw Error("@Scheduled decorator can only be used on SERVICE or COMPONENT classes.");
    }

    // 验证方法名
    if (!propertyKey || typeof propertyKey !== 'string') {
      throw Error("Method name is required for @Scheduled decorator");
    }

    // 验证方法描述符
    if (!descriptor || typeof descriptor.value !== 'function') {
      throw Error("@Scheduled decorator can only be applied to methods");
    }

    try {
      // 使用装饰器管理器进行预处理
      const decoratorManager = DecoratorManager.getInstance();

      const decoratorMetadata: DecoratorMetadata = {
        type: DecoratorType.SCHEDULED,
        config: { cron, timezone } as ScheduledConfig,
        applied: true,
        priority: 1 // Lower priority than RedLock
      };

      // 注册装饰器 - 这会处理重复检查和优化
      const processedDescriptor = decoratorManager.registerDecorator(
        target,
        propertyKey,
        decoratorMetadata,
        descriptor
      );

      // 注入计划任务 - 这个操作只在应用启动时进行一次
      injectSchedule(target, propertyKey, cron, timezone);

      return processedDescriptor;
    } catch (error) {
      throw Error(`Failed to inject schedule for ${propertyKey}: ${(error as Error).message}`);
    }
  };
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