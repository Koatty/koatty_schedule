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
import { DecoratorType, validateCronExpression } from "../config/config";
import { injectSchedule } from "../process/schedule";
import { IOCContainer, MethodDecoratorManager, DecoratorMetadata } from "koatty_container";

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
      const decoratorManager = MethodDecoratorManager.getInstance();

      // Register wrapper for Scheduled decorator if not already registered
      if (!decoratorManager.hasWrapper(DecoratorType.SCHEDULED)) {
        decoratorManager.registerWrapper(DecoratorType.SCHEDULED, (originalMethod) => {
          // Scheduled decorator doesn't wrap the method, it registers for cron execution
          return originalMethod;
        });
      }

      const decoratorMetadata: DecoratorMetadata = {
        type: DecoratorType.SCHEDULED,
        config: { cron, timezone },
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

      injectSchedule(target, propertyKey, cron, timezone);
      return processedDescriptor;
    } catch (error) {
      throw Error(`Failed to inject schedule for ${propertyKey}: ${(error as Error).message}`);
    }
  };
}
