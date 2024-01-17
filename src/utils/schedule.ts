/**
 * @ author: richen
 * @ copyright: Copyright (c) - <richenlin(at)gmail.com>
 * @ license: MIT
 * @ version: 2020-07-06 10:29:20
 */
import { Application, IOCContainer } from "koatty_container";
import { Helper } from "koatty_lib";
import { DefaultLogger as logger } from "koatty_logger";
import { CronJob } from "cron";
import { RedLockOptions, RedLocker } from "./redlock";
import { timeoutPromise } from "./lib";
import { Lock } from "@sesamecare-oss/redlock";

const SCHEDULE_KEY = 'SCHEDULE_KEY';

/**
 * Initiation schedule locker client.
 *
 * @returns {*}  
 */
export async function initRedLock() {
  const app = IOCContainer.getApp();
  app?.once("appStart", async function () {
    const opt: RedLockOptions = app.config("RedLock", "db") ?? {};
    if (Helper.isEmpty(opt)) {
      throw Error(`Missing configuration. Please write a configuration item with the key name 'RedLock' in the db.ts file.`);
    }
    RedLocker.getInstance(opt);
  })
}

/**
 * 
 * @param descriptor redLocker Descriptor
 * @param name 
 * @param method 
 * @param lockTime 
 * @returns 
 */
export function redLockerDescriptor(descriptor: PropertyDescriptor, name: string,
  method: string, options?: RedLockOptions): PropertyDescriptor {
  const { value, configurable, enumerable } = descriptor;
  const valueFunction = async (self: any, lock: Lock, lockTime: number, timeout: number,
    renewCount: number, props: any[]) => {
    let retryCount = 0;

    try {
      while (true) {
        // 等待函数执行完成或锁定超时
        const result = await Promise.race([value.apply(self, props), timeoutPromise(timeout)]);
        // 如果函数执行成功，退出循环 
        return result;
      }
    } catch (error) {
      // 如果是锁定超时，进行续期并重新执行，最多重试 renewCount 次
      if (error.message === 'TIME_OUT_ERROR' && retryCount < renewCount) {
        logger.Info(`Renew lock, Retry ${retryCount + 1}`);
        retryCount++;
        // Extend the lock. Note that this returns a new `Lock` instance.
        lock = await lock.extend(timeout);
        // 重试
        await valueFunction(self, lock, lockTime, timeout, renewCount, props);
      }
      throw error;
    } finally {
      // 释放锁
      lock.release();
    }
  }
  return {
    configurable,
    enumerable,
    writable: true,
    async value(...props: any[]) {
      const redlock = RedLocker.getInstance();
      // Acquire a lock.
      const lockTime = options.lockTimeOut || 10000;
      const renewCount = options.renewCount || 3;
      const lock = await redlock.acquire([method, name], lockTime);
      const timeout = lockTime - 200;
      if (timeout <= 0) {
        // Release the lock.
        await lock.release();
        throw new Error("The lock time is so short that the lock is released quickly," +
          "resulting in a failure of the function execution.");
      }

      return valueFunction(this, lock, lockTime, timeout, renewCount, props);
    },
  }
}

/**
 * 
 *
 * @param {*} target
 * @param {Container} container
 * @param {string} method
 * @param {string} cron
 * @param {string} timezone
 */
export function injectSchedule(target: any, method: string, cron: string, timezone?: string) {
  const app = IOCContainer.getApp();
  app?.once("appStart", () => {
    const identifier = IOCContainer.getIdentifier(target);
    const componentType = IOCContainer.getType(target);
    const instance: any = IOCContainer.get(identifier, componentType);

    if (instance && Helper.isFunction(instance[method]) && cron) {
      logger.Debug(`Register inject ${identifier} schedule key: ${method} => value: ${cron}`);
      new CronJob(
        cron, // cronTime
        async function () {
          logger.Info(`The schedule job ${identifier}_${method} started.`);
          try {
            const res = await instance[method]();
            return res;
          } catch (e) {
            logger.Error(e);
          }
        }, // onTick
        null, // onComplete
        true, // start
        timezone // timeZone
      );
    }
  });
};

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
//         execInjectSchedule(target, meta, val.cron);
//       }
//     }
//   }
// }
