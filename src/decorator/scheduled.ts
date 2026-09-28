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
import { COMPONENT_SCHEDULED, DecoratorType, validateCronExpression } from "../config/config";
import { IOCContainer } from "koatty_container";
import type { OverlapPolicy } from "../process/schedule";

/**
 * COR-06 (C-4): `@Scheduled` options.
 * `timezone` keeps the legacy second argument working; `overlap` decides what
 * happens when a tick fires while the previous run is still in flight.
 */
export interface ScheduledTaskOptions {
  timezone?: string;
  overlap?: OverlapPolicy;
}

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
export function Scheduled(cron: string, timezoneOrOptions: string | ScheduledTaskOptions = 'Asia/Beijing', legacyOverlap?: OverlapPolicy) {
  // COR-06: `@Scheduled('*/10 * * * * *', 'Asia/Shanghai')` (legacy) and
  // `@Scheduled('*/10 * * * * *', { overlap: 'skip', timezone })` are both valid.
  const options: ScheduledTaskOptions = typeof timezoneOrOptions === 'string'
    ? { timezone: timezoneOrOptions, overlap: legacyOverlap }
    : { ...(timezoneOrOptions ?? {}) };

  // legacy guard: a non-string, non-object second argument is still a timezone
  // mistake, not an options object
  if (typeof timezoneOrOptions !== 'string' &&
      (typeof timezoneOrOptions !== 'object' || timezoneOrOptions === null)) {
    throw Error("Timezone must be a string");
  }
  const timezone = options.timezone ?? 'Asia/Beijing';
  const overlap: OverlapPolicy = options.overlap ?? 'skip';

  if (overlap !== 'skip' && overlap !== 'queue' && overlap !== 'allow') {
    throw Error(`Invalid overlap policy: ${overlap} (expected 'skip' | 'queue' | 'allow')`);
  }

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

  return IOCContainer.createDecorator(({ target, methodName, descriptor, method, context }) => {
    if (context) {
      // TC39 path
      context.addInitializer?.(function (this: any) {
        const targetClass = this.constructor;
        const componentType = IOCContainer.getType(targetClass);
        if (componentType !== "SERVICE" && componentType !== "COMPONENT") {
          throw Error("@Scheduled decorator can only be used on SERVICE or COMPONENT classes.");
        }

        // 验证方法名
        if (!methodName || typeof methodName !== 'string') {
          throw Error("Method name is required for @Scheduled decorator");
        }

        // 保存类到IOC容器
        IOCContainer.saveClass("COMPONENT", targetClass, targetClass.name);
        // 保存调度元数据到 IOC 容器
        IOCContainer.attachClassMetadata(COMPONENT_SCHEDULED, DecoratorType.SCHEDULED, {
          method: methodName,
          cron,
          timezone,
          overlap
        }, this, methodName);
      });

      return method;
    } else {
      // Legacy path
      // 验证装饰器使用的类型（从原型对象获取类构造函数）
      const targetClass = (target as any).constructor;
      const componentType = IOCContainer.getType(targetClass);
      if (componentType !== "SERVICE" && componentType !== "COMPONENT") {
        throw Error("@Scheduled decorator can only be used on SERVICE or COMPONENT classes.");
      }

      // 验证方法名
      if (!methodName || typeof methodName !== 'string') {
        throw Error("Method name is required for @Scheduled decorator");
      }

      // 验证方法描述符
      if (!descriptor || typeof descriptor.value !== 'function') {
        throw Error("@Scheduled decorator can only be applied to methods");
      }
      // 保存类到IOC容器
      IOCContainer.saveClass("COMPONENT", targetClass, targetClass.name);
      // 保存调度元数据到 IOC 容器
      IOCContainer.attachClassMetadata(COMPONENT_SCHEDULED, DecoratorType.SCHEDULED, {
        method: methodName,
        cron,
        timezone,  // 保存确定的时区值
        overlap    // COR-06
      }, target as object, methodName);
    }
  }, 'method');
}
