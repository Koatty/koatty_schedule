/**
 * @ author: richen
 * @ copyright: Copyright (c) - <richenlin(at)gmail.com>
 * @ license: MIT
 * @ version: 2020-07-06 10:30:11
 */
// tslint:disable-next-line: no-import-side-effect
import "reflect-metadata";

import * as helper from "koatty_lib";
import { Application, IOCContainer } from "koatty_container";
import { initRedLock, injectSchedule, redLockerDescriptor } from "./utils/schedule";
import { RedLockOptions } from "./utils/redlock";


/**
 * Schedule task
 *
 * @export
 * @param {string} cron
 * @param {string} timezone
 * * Seconds: 0-59
 * * Minutes: 0-59
 * * Hours: 0-23
 * * Day of Month: 1-31
 * * Months: 1-12 (Jan-Dec)
 * * Day of Week: 1-7 (Sun-Sat)
 * 
 * @returns {MethodDecorator}
 */
export function Scheduled(cron: string, timezone = 'Asia/Beijing'): MethodDecorator {
  if (helper.isEmpty(cron)) {
    // cron = "0 * * * * *";
    throw Error("ScheduleJob rule is not defined");
  }

  return (target, propertyKey: string, descriptor: PropertyDescriptor) => {
    const componentType = IOCContainer.getType(target);
    if (componentType !== "SERVICE" && componentType !== "COMPONENT") {
      throw Error("This decorator only used in the service、component class.");
    }
    // IOCContainer.attachPropertyData(SCHEDULE_KEY, {
    //     cron,
    //     method: propertyKey
    // }, target, propertyKey);
    injectSchedule(target, propertyKey, cron);
  };
}

/**
 * Redis-based distributed locks. Redis server config from db.ts.
 *
 * @export
 * @param {string} [name] The locker name. If name is duplicated, lock sharing contention will result.
 * @param {number} [lockTimeOut] Automatic release of lock within a limited maximum time. default 10000
 * @param {number} [waitLockRetry] Try to acquire lock max time. default 3
 * 
 * @returns {MethodDecorator}
 */
export function RedLock(name?: string, options?: RedLockOptions): MethodDecorator {
  return (target: any, methodName: string, descriptor: PropertyDescriptor) => {
    const componentType = IOCContainer.getType(target);
    if (componentType !== "SERVICE" && componentType !== "COMPONENT") {
      throw Error("This decorator only used in the service、component class.");
    }
    if (helper.isEmpty(name)) {
      const identifier = IOCContainer.getIdentifier(target) || (target.constructor ? target.constructor.name : "");
      name = `${identifier}_${methodName}`;
    }

    descriptor = redLockerDescriptor(descriptor, name, methodName, options);

    // bind app_ready hook event 
    initRedLock();
    return descriptor;
  };
}

