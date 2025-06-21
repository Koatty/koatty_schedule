/**
 * @ author: richen
 * @ copyright: Copyright (c) - <richenlin(at)gmail.com>
 * @ license: MIT
 * @ version: 2020-07-06 10:30:11
 */

import { Koatty } from "koatty_core";
import { RedLock } from "./decorator/redlock";
import { Scheduled } from "./decorator/scheduled";
import { initRedLock, injectRedLock } from "./process/locker";
import { injectSchedule } from "./process/schedule";
import { ScheduledOptions, setGlobalScheduledOptions } from "./config/config";

// Export the decorators
export { RedLock, Scheduled };

/**
 * @deprecated Use RedLock instead. This will be removed in v3.0.0
 */
export const SchedulerLock = RedLock;

/** 
 * defaultOptions
 */
const defaultOptions: ScheduledOptions = {
  timezone: "Asia/Beijing",
  lockTimeOut: 10000,
  clockDriftFactor: 0.01,
  maxRetries: 3,
  retryDelayMs: 200,
  redisConfig: {
    host: "localhost",
    port: 6379,
    password: "",
    db: 0,
    keyPrefix: "redlock:"
  }
}

/**
 * @param options - The options for the scheduled job
 * @param app - The Koatty application instance
 */
export async function KoattyScheduled(options: ScheduledOptions, app: Koatty) {
  options = { ...defaultOptions, ...options };
  
  // 保存全局配置
  setGlobalScheduledOptions(options);
  
  await initRedLock(options, app);
  await injectRedLock(options, app);
  await injectSchedule(options, app);
}