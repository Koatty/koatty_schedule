/**
 * @ author: richen
 * @ copyright: Copyright (c) - <richenlin(at)gmail.com>
 * @ license: MIT
 * @ version: 2020-07-06 10:30:11
 */

import { Koatty } from "koatty_core";
import { RedLock } from "./decorator/redlock";
import { Scheduled } from "./decorator/scheduled";
import { initRedLock } from "./process/locker";
import { initSchedule } from "./process/schedule";
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
  
  // 初始化RedLock（appReady时触发，确保所有依赖就绪）
  await initRedLock(options, app);
  
  // 初始化调度任务系统（appReady时触发，确保所有组件都已初始化）
  await initSchedule(app);
}