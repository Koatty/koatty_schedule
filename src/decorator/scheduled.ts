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
export function Scheduled(cron: string, timezone?: string): MethodDecorator {
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

  return (target: unknown, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    // 验证装饰器使用的类型（从原型对象获取类构造函数）
    const targetClass = (target as any).constructor;
    const componentType = IOCContainer.getType(targetClass);
    if (componentType !== "SERVICE" && componentType !== "COMPONENT") {
      throw Error("@Scheduled decorator can only be used on SERVICE or COMPONENT classes.");
    }

    // 验证方法名
    const methodName = propertyKey.toString();
    if (!methodName || typeof methodName !== 'string') {
      throw Error("Method name is required for @Scheduled decorator");
    }

    // 验证方法描述符
    if (!descriptor || typeof descriptor.value !== 'function') {
      throw Error("@Scheduled decorator can only be applied to methods");
    }
    // 保存类到IOC容器
    IOCContainer.saveClass('COMPONENT', targetClass, targetClass.name);
    // 保存调度元数据到 IOC 容器
    IOCContainer.attachClassMetadata('COMPONENT', DecoratorType.SCHEDULED, {
      method: methodName,
      cron,
      timezone  // 保存用户指定的值，可能为undefined
    }, target as object, methodName);
  };
}
