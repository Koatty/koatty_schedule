/**
 * @ author: richen
 * @ copyright: Copyright (c) - <richenlin(at)gmail.com>
 * @ license: MIT
 * @ version: 2020-07-06 10:30:11
 */

import { RedLock } from "./decorator/redlock";
import { Scheduled } from "./decorator/scheduled";

// Export the decorators
export { RedLock, Scheduled };

// Export utility functions and types for advanced usage
export { RedLockOptions } from "./locker/redlock";
export { DecoratorType, validateCronExpression, validateRedLockOptions } from "./config/config";
export { 
  DecoratorManager, 
  DecoratorMetadata,
  WrapperFunction
} from "./decorator/manager";
// Legacy compatibility - maintain the original SchedulerLock name
/**
 * @deprecated Use RedLock instead. This will be removed in v3.0.0
 */
export const SchedulerLock = RedLock;

