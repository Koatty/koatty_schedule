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
import { Helper } from "koatty_lib";
import { DecoratorType, RedLockMethodOptions, validateRedLockMethodOptions } from "../config/config";

/**
 * Redis-based distributed lock decorator
 *
 * @export
 * @param {string} [name] - The locker name. If name is duplicated, lock sharing contention will result.
 *                          If not provided, a unique name will be auto-generated using method name + random suffix.
 *                          IMPORTANT: Auto-generated names are unique per method deployment and not predictable.
 * @param {RedLockMethodOptions} [options] - Lock configuration options for this method
 * 
 * @returns {MethodDecorator}
 * @throws {Error} When decorator is used on wrong class type or invalid configuration
 * 
 * @example
 * ```typescript
 * class UserService {
 *   @RedLock('user_update_lock', { lockTimeOut: 5000, maxRetries: 2 })
 *   async updateUser(id: string, data: any) {
 *     // This method will be protected by a distributed lock with predictable name
 *   }
 *   
 *   @RedLock() // Auto-generated unique name like "deleteUser_abc123_xyz789"
 *   async deleteUser(id: string) {
 *     // This method will be protected by a distributed lock with auto-generated unique name
 *   }
 * }
 * ```
 */
export function RedLock(lockName?: string, options?: RedLockMethodOptions): MethodDecorator {
  return (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) => {
    const methodName = propertyKey.toString();

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

    // 生成唯一的锁名称：用户指定的 > 自动生成的唯一名称
    if (!lockName || lockName.trim() === '') {
      const randomSuffix = Math.random().toString(36).substring(2, 8); // 6位随机字符
      const timestamp = Date.now().toString(36); // 时间戳转36进制
      lockName = `${methodName}_${randomSuffix}_${timestamp}`;
    }

    // 验证选项
    if (options) {
      validateRedLockMethodOptions(options);
    }

    // 保存RedLock元数据到 IOC 容器（lockName已确定）
    IOCContainer.attachClassMetadata('COMPONENT', DecoratorType.REDLOCK, {
      method: methodName,
      name: lockName,  // 确定的锁名称，不会为undefined
      options
    }, targetObj, methodName);
  };
}