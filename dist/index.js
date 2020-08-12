"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.injectSchedule = exports.Lock = exports.SchedulerLock = exports.Scheduled = void 0;
const tslib_1 = require("tslib");
/**
 * @ author: richen
 * @ copyright: Copyright (c) - <richenlin(at)gmail.com>
 * @ license: MIT
 * @ version: 2020-07-06 10:30:11
 */
// tslint:disable-next-line: no-import-side-effect
require("reflect-metadata");
const helper = tslib_1.__importStar(require("think_lib"));
const think_logger_1 = tslib_1.__importDefault(require("think_logger"));
const koatty_container_1 = require("koatty_container");
const cron_1 = require("cron");
const locker_1 = require("./locker");
const lib_1 = require("./lib");
const SCHEDULE_KEY = 'SCHEDULE_KEY';
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
function Scheduled(cron) {
    if (helper.isEmpty(cron)) {
        // cron = "0 * * * * *";
        throw Error("ScheduleJob rule is not defined");
    }
    return (target, propertyKey, descriptor) => {
        koatty_container_1.IOCContainer.attachPropertyData(SCHEDULE_KEY, {
            cron,
            method: propertyKey
        }, target, propertyKey);
    };
}
exports.Scheduled = Scheduled;
/**
 * Redis-based distributed locks. Reids server config from db.ts.
 *
 * @export
 * @param {string} [name] The locker name. If name is duplicated, lock sharing contention will result.
 * @param {number} [lockTimeOut] Automatic release of lock within a limited maximum time.
 * @param {number} [waitLockInterval] Try to acquire lock every interval time(millisecond).
 * @param {number} [waitLockTimeOut] When using more than TimeOut(millisecond) still fails to get the lock and return failure.
 *
 * @returns {MethodDecorator}
 */
function SchedulerLock(name, lockTimeOut, waitLockInterval, waitLockTimeOut) {
    return (target, methodName, descriptor) => {
        const componentType = koatty_container_1.IOCContainer.getType(target);
        if (componentType === "CONTROLLER") {
            throw Error("SchedulerLock decorator cannot be used in the controller class.");
        }
        const { value, configurable, enumerable } = descriptor;
        if (helper.isEmpty(name)) {
            const identifier = koatty_container_1.IOCContainer.getIdentifier(target) || (target.constructor ? target.constructor.name : "");
            name = `${identifier}_${methodName}`;
        }
        descriptor = {
            configurable,
            enumerable,
            writable: true,
            async value(...props) {
                // tslint:disable-next-line: no-invalid-this
                const redisOptions = this.app.config("SchedulerLock", "db") || this.app.config("redis", "db");
                if (helper.isEmpty(redisOptions)) {
                    throw Error("Missing redis server configuration. Please write a configuration item with the key name 'SchedulerLock' or 'redis' in the db.ts file.");
                }
                const lockerCls = locker_1.Locker.getInstance(redisOptions);
                let lockerFlag = false;
                if (!lockerCls) {
                    throw Error(`Redis connection failed. The method ${methodName} is not executed.`);
                }
                if (waitLockInterval || waitLockTimeOut) {
                    lockerFlag = await lockerCls.waitLock(name, lockTimeOut, waitLockInterval, waitLockTimeOut).catch((er) => {
                        think_logger_1.default.error(er);
                        return false;
                    });
                }
                else {
                    lockerFlag = await lockerCls.lock(name, lockTimeOut).catch((er) => {
                        think_logger_1.default.error(er);
                        return false;
                    });
                }
                if (lockerFlag) {
                    try {
                        think_logger_1.default.info(`The locker ${name} executed.`);
                        // tslint:disable-next-line: no-invalid-this
                        const res = await value.apply(this, props);
                        return res;
                    }
                    catch (e) {
                        return Promise.reject(e);
                    }
                    finally {
                        if (lockerCls.unLock) {
                            await lockerCls.unLock(name).catch((er) => {
                                think_logger_1.default.error(er);
                            });
                        }
                    }
                }
                else {
                    think_logger_1.default.warn(`Redis lock ${name} acquisition failed. The method ${methodName} is not executed.`);
                    return;
                }
            }
        };
        return descriptor;
    };
}
exports.SchedulerLock = SchedulerLock;
/**
 * Redis-based distributed locks. Reids server config from db.ts.
 *
 * @export
 * @param {string} [name] The locker name. If name is duplicated, lock sharing contention will result.
 * @param {number} [lockTimeOut] Automatic release of lock within a limited maximum time.
 * @param {number} [waitLockInterval] Try to acquire lock every interval time(millisecond).
 * @param {number} [waitLockTimeOut] When using more than TimeOut(millisecond) still fails to get the lock and return failure.
 *
 * @returns {MethodDecorator}
 */
exports.Lock = SchedulerLock;
/**
 *
 *
 * @param {*} target
 * @param {Container} container
 * @param {string} method
 * @param {string} cron
 */
const execInjectSchedule = function (target, container, method, cron) {
    const app = container.getApp();
    // tslint:disable-next-line: no-unused-expression
    app && app.once("appStart", () => {
        const identifier = koatty_container_1.IOCContainer.getIdentifier(target);
        const instance = container.getInsByClass(target);
        const name = `${identifier}_${method}`;
        if (instance && helper.isFunction(instance[method]) && cron) {
            // tslint:disable-next-line: no-unused-expression
            process.env.APP_DEBUG && think_logger_1.default.custom("think", "", `Register inject ${identifier} schedule key: ${method} => value: ${cron}`);
            new cron_1.CronJob(cron, async function () {
                think_logger_1.default.info(`The schedule job ${name} started.`);
                try {
                    const res = await instance[method]();
                    return res;
                }
                catch (e) {
                    think_logger_1.default.error(e);
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
function injectSchedule(target, instance, container) {
    const metaDatas = lib_1.recursiveGetMetadata(SCHEDULE_KEY, target);
    // tslint:disable-next-line: forin
    for (const meta in metaDatas) {
        for (const val of metaDatas[meta]) {
            if (val.cron && meta) {
                execInjectSchedule(target, container, meta, val.cron);
            }
        }
    }
}
exports.injectSchedule = injectSchedule;
//# sourceMappingURL=index.js.map