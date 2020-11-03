/**
 * @ author: richen
 * @ copyright: Copyright (c) - <richenlin(at)gmail.com>
 * @ license: MIT
 * @ version: 2020-07-06 10:30:11
 */
// tslint:disable-next-line: no-import-side-effect
import "reflect-metadata";
import { CronJob } from "cron";
import logger from "think_logger";
import * as helper from "think_lib";
import { Application, Container, IOCContainer, TAGGED_CLS } from "koatty_container";
import { recursiveGetMetadata } from "./lib";
import { Locker, RedisOptions } from "./locker";

const SCHEDULE_KEY = 'SCHEDULE_KEY';
const APP_READY_HOOK = "APP_READY_HOOK";

/**
 * 
 *
 * @interface CacheStoreInterface
 */
interface ScheduleLockerInterface {
    locker?: LockerInterface;
}
interface LockerInterface {
    defineCommand?: () => Promise<any>;
    lock?: (key: string, expire?: number) => Promise<boolean>;
    waitLock?: (key: string, expire: number, interval?: number, waitTime?: number) => Promise<boolean>;
    unLock?: (key: string) => Promise<boolean>;
}
// 
const ScheduleLocker: ScheduleLockerInterface = {
    locker: null,
};

/**
 * initiation redis connection and client.
 *
 * @param {Application} app
 * @returns {*}  {Promise<LockerInterface>}
 */
async function InitRedisConn(app: Application): Promise<LockerInterface> {
    if (!ScheduleLocker.locker) {
        const opt = app.config("SchedulerLock", "db") || app.config("redis", "db");
        if (helper.isEmpty(opt)) {
            throw Error("Missing redis server configuration. Please write a configuration item with the key name 'SchedulerLock' or 'redis' in the db.ts file.");
        } else {
            const lockerStore = Locker.getInstance(opt);
            if (lockerStore && helper.isFunction(lockerStore.defineCommand)) {
                await lockerStore.defineCommand();
                ScheduleLocker.locker = lockerStore;
            } else {
                throw Error(`Redis connection failed. `);
            }
        }
    }

    return ScheduleLocker.locker;
}

/**
 * Enable scheduled lock support and initialize redis connection.
 * Need configuration item with the key name 'SchedulerLock' or 'redis' in the db.ts file
 * @export
 * @returns {*} 
 */
export function EnableScheduleLock(): ClassDecorator {
    logger.custom('think', '', 'EnableScheduleLock');

    return (target: any) => {
        if (!(target.__proto__.name === "Koatty")) {
            throw new Error(`class does not inherit from Koatty`);
        }
        IOCContainer.attachClassMetadata(TAGGED_CLS, APP_READY_HOOK, InitRedisConn, target);
    };
}

/**
 * Schedule task
 *
 * @export
 * @param {string} cron
 * * Seconds: 0-59
 * * Minutes: 0-59
 * * Hours: 0-23
 * * Day of Month: 1-31
 * * Months: 0-11 (Jan-Dec)
 * * Day of Week: 0-6 (Sun-Sat)
 * 
 * @returns {MethodDecorator}
 */
export function Scheduled(cron: string): MethodDecorator {
    if (helper.isEmpty(cron)) {
        // cron = "0 * * * * *";
        throw Error("ScheduleJob rule is not defined");
    }

    return (target, propertyKey: string, descriptor: PropertyDescriptor) => {
        const componentType = IOCContainer.getType(target);
        if (componentType !== "SERVICE" && componentType !== "COMPONENT") {
            throw Error("This decorator only used in the service、component class.");
        }
        IOCContainer.attachPropertyData(SCHEDULE_KEY, {
            cron,
            method: propertyKey
        }, target, propertyKey);
    };
}

/**
 * Redis-based distributed locks. Redis server config from db.ts.
 *
 * @export
 * @param {string} [name] The locker name. If name is duplicated, lock sharing contention will result.
 * @param {number} [lockTimeOut] Automatic release of lock within a limited maximum time.
 * @param {number} [waitLockInterval] Try to acquire lock every interval time(millisecond).
 * @param {number} [waitLockTimeOut] When using more than TimeOut(millisecond) still fails to get the lock and return failure.
 * 
 * @returns {MethodDecorator}
 */
export function SchedulerLock(name?: string, lockTimeOut?: number, waitLockInterval?: number, waitLockTimeOut?: number): MethodDecorator {
    return (target: any, methodName: string, descriptor: PropertyDescriptor) => {
        const componentType = IOCContainer.getType(target);
        if (componentType !== "SERVICE" && componentType !== "COMPONENT") {
            throw Error("This decorator only used in the service、component class.");
        }
        const { value, configurable, enumerable } = descriptor;
        if (helper.isEmpty(name)) {
            const identifier = IOCContainer.getIdentifier(target) || (target.constructor ? target.constructor.name : "");
            name = `${identifier}_${methodName}`;
        }
        descriptor = {
            configurable,
            enumerable,
            writable: true,
            async value(...props: any[]) {
                const lockerCls = ScheduleLocker.locker;
                let lockerFlag = false;
                if (!lockerCls) {
                    throw Error(`Redis lock ${name} acquisition failed. The method ${methodName} is not executed.`);
                }
                if (waitLockInterval || waitLockTimeOut) {
                    lockerFlag = await lockerCls.waitLock(name,
                        lockTimeOut,
                        waitLockInterval,
                        waitLockTimeOut
                    ).catch((er: any) => {
                        logger.error(er);
                        return false;
                    });
                } else {
                    lockerFlag = await lockerCls.lock(name, lockTimeOut).catch((er: any) => {
                        logger.error(er);
                        return false;
                    });
                }
                if (lockerFlag) {
                    try {
                        logger.info(`The locker ${name} executed.`);
                        // tslint:disable-next-line: no-invalid-this
                        const res = await value.apply(this, props);
                        return res;
                    } catch (e) {
                        return Promise.reject(e);
                    } finally {
                        if (lockerCls.unLock) {
                            await lockerCls.unLock(name).catch((er: any) => {
                                logger.error(er);
                            });
                        }
                    }
                } else {
                    logger.warn(`Redis lock ${name} acquisition failed. The method ${methodName} is not executed.`);
                    return;
                }
            }
        };
        return descriptor;
    };
}

/**
 * Redis-based distributed locks. Redis server config from db.ts.
 *
 * @export
 * @param {string} [name] The locker name. If name is duplicated, lock sharing contention will result.
 * @param {number} [lockTimeOut] Automatic release of lock within a limited maximum time.
 * @param {number} [waitLockInterval] Try to acquire lock every interval time(millisecond).
 * @param {number} [waitLockTimeOut] When using more than TimeOut(millisecond) still fails to get the lock and return failure.
 *
 * @returns {MethodDecorator}
 */
export const Lock = SchedulerLock;

/**
 * 
 *
 * @param {*} target
 * @param {Container} container
 * @param {string} method
 * @param {string} cron
 */
const execInjectSchedule = function (target: any, container: Container, method: string, cron: string) {
    const app = container.getApp();
    app.once("appReady", () => {
        const identifier = IOCContainer.getIdentifier(target);
        const instance: any = container.getInsByClass(target);
        const name = `${identifier}_${method}`;

        if (instance && helper.isFunction(instance[method]) && cron) {
            // tslint:disable-next-line: no-unused-expression
            process.env.APP_DEBUG && logger.custom("think", "", `Register inject ${identifier} schedule key: ${method} => value: ${cron}`);
            new CronJob(cron, async function () {
                logger.info(`The schedule job ${name} started.`);
                try {
                    const res = await instance[method]();
                    return res;
                } catch (e) {
                    logger.error(e);
                }
            }).start();
        }
    });
};

/**
 * Inject schedule job
 *
 * @export
 * @param {*} target
 * @param {*} instance
 * @param {Container} container
 */
export function injectSchedule(target: any, instance: any, container: Container) {
    const metaDatas = recursiveGetMetadata(SCHEDULE_KEY, target);
    // tslint:disable-next-line: forin
    for (const meta in metaDatas) {
        for (const val of metaDatas[meta]) {
            if (val.cron && meta) {
                execInjectSchedule(target, container, meta, val.cron);
            }
        }
    }
}
