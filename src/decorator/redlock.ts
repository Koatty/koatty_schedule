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
import { RedLockMethodOptions, validateRedLockMethodOptions } from "../config/config";
import { redLockerDescriptor, generateLockName } from "../process/locker";

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
  return (target: unknown, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const methodName = propertyKey.toString();

    // 验证装饰器使用的类型（从原型对象获取类构造函数）
    const targetClass = (target as any).constructor;
    const componentType = IOCContainer.getType(targetClass);
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

    // 生成锁名称：用户指定的 > 基于类名和方法名生成
    const finalLockName = lockName || generateLockName(lockName, methodName, target);

    // 验证选项
    if (options) {
      validateRedLockMethodOptions(options);
    }

    // 保存类到IOC容器
    IOCContainer.saveClass("COMPONENT", targetClass, targetClass.name);

    try {
      // 直接在装饰器中包装方法，而不是延迟处理
      const enhancedDescriptor = redLockerDescriptor(
        descriptor,
        finalLockName,
        methodName,
        options
      );

      return enhancedDescriptor;
    } catch (error) {
      throw new Error(`Failed to apply RedLock to ${methodName}: ${(error as Error).message}`);
    }
  };
}