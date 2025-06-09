/**
 * @ author: richen
 * @ copyright: Copyright (c) - <richenlin(at)gmail.com>
 * @ license: MIT
 * @ version: 2020-07-06 10:29:20
 */
import { IOCContainer } from "koatty_container";
import { Helper } from "koatty_lib";
import { DefaultLogger as logger } from "koatty_logger";
import { CronJob } from "cron";
import { RedLockOptions, RedLocker } from "../locker/redlock";
import { timeoutPromise } from "../utils/lib";
import { Lock } from "@sesamecare-oss/redlock";

/**
 * Initiation schedule locker client.
 *
 * @returns {Promise<void>}  
 */
export async function initRedLock(): Promise<void> {
  const app = IOCContainer.getApp();
  app?.once("appStart", async function () {
    try {
      const opt: RedLockOptions = app.config("RedLock", "db") ?? {};
      if (Helper.isEmpty(opt)) {
        throw Error(`Missing RedLock configuration. Please write a configuration item with the key name 'RedLock' in the db.ts file.`);
      }
      RedLocker.getInstance(opt);
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
 * @param options - RedLock options
 * @returns Enhanced property descriptor
 */
export function redLockerDescriptor(
  descriptor: PropertyDescriptor, 
  name: string,
  method: string, 
  options?: RedLockOptions
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

  // 设置默认选项
  const lockOptions: RedLockOptions = {
    lockTimeOut: 10000,
    retryCount: 3,
    ...options
  };

  /**
   * Enhanced function wrapper with better error handling
   */
  const valueFunction = async (
    self: unknown, 
    lock: Lock, 
    lockTime: number, 
    timeout: number,
    props: unknown[]
  ): Promise<unknown> => {
    try {
      // Wait for the function to complete or for the lock to time out.
      const result = await Promise.race([
        value.apply(self, props), 
        timeoutPromise(timeout)
      ]);
      return result;
    } catch (error) {
      // If the lock times out and the function has not completed,
      // renew the lock once. after renewal, the function still has not completed,
      // the lock may be released prematurely.
      if (error instanceof Error && error.message === 'TIME_OUT_ERROR') {
        logger.Info(`The execution exceeds the lock duration, trigger lock renewal for method: ${method}`);
        try {
          // Extend the lock. Note that this returns a new `Lock` instance.
          const extendedLock = await lock.extend(timeout);
          // wait for timeout to release lock
          await timeoutPromise(timeout).catch(() => { 
            logger.Warn(`Extended lock timeout for method: ${method}`);
          });
          return extendedLock;
        } catch (extendError) {
          logger.Error(`Failed to extend lock for method: ${method}`, extendError);
          throw extendError;
        }
      }
      throw error;
    } finally {
      // release lock
      try {
        await lock.release();
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
 * Inject schedule job with enhanced error handling and validation
 *
 * @param {unknown} target - Target class
 * @param {string} method - Method name
 * @param {string} cron - Cron expression
 * @param {string} [timezone] - Timezone
 */
export function injectSchedule(
  target: unknown, 
  method: string, 
  cron: string, 
  timezone?: string
): void {
  // 参数验证
  if (!target) {
    throw new Error('Target is required for schedule injection');
  }
  if (!method || typeof method !== 'string') {
    throw new Error('Method name must be a non-empty string');
  }
  if (!cron || typeof cron !== 'string') {
    throw new Error('Cron expression must be a non-empty string');
  }

  const app = IOCContainer.getApp();
  app?.once("appStart", () => {
    try {
      const targetObj = target as object | Function;
      const identifier = IOCContainer.getIdentifier(targetObj);
      const componentType = IOCContainer.getType(targetObj);
      
      if (!identifier) {
        logger.Error(`Cannot find identifier for target in schedule injection`);
        return;
      }

      const instance: unknown = IOCContainer.get(identifier, componentType);

      if (instance && Helper.isFunction((instance as Record<string, unknown>)[method]) && cron) {
        const tz = timezone || "Asia/Beijing";
        logger.Debug(`Register inject ${identifier} schedule key: ${method} => value: ${cron}, timezone: ${tz}`);
        
        try {
          new CronJob(
            cron, // cronTime
            async function () {
              logger.Info(`The schedule job ${identifier}_${method} started.`);
              try {
                const methodFunc = (instance as Record<string, Function>)[method];
                const res = await methodFunc.call(instance);
                logger.Debug(`The schedule job ${identifier}_${method} completed successfully.`);
                return res;
              } catch (e) {
                logger.Error(`The schedule job ${identifier}_${method} failed:`, e);
              }
            }, // onTick
            null, // onComplete
            true, // start
            tz // timeZone
          );
          logger.Info(`Schedule job ${identifier}_${method} registered successfully`);
        } catch (cronError) {
          logger.Error(`Failed to create cron job for ${identifier}_${method}:`, cronError);
        }
      } else {
        logger.Warn(`Cannot inject schedule for ${identifier}_${method}: instance not found or method is not a function`);
      }
    } catch (error) {
      logger.Error('Failed to inject schedule:', error);
    }
  });
}

/**
 * Inject schedule job
 *
 * @export
 * @param {*} target
 */
// export function injectSchedule(target: any) {
//   const metaDatas = recursiveGetMetadata(SCHEDULE_KEY, target);
//   // tslint:disable-next-line: forin
//   for (const meta in metaDatas) {
//     for (const val of metaDatas[meta]) {
//       if (val.cron && meta) {
//         injectSchedule(target, meta, val.cron);
//       }
//     }
//   }
// }
