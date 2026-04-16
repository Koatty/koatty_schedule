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
import { COMPONENT_SCHEDULED, DecoratorType, getEffectiveTimezone } from "../config/config";
import { Koatty } from "koatty_core";

/**
 * 初始化调度任务系统
 * 在appReady时触发批量注入调度任务，确保所有初始化工作完成
 *
 * @param {Koatty} app - Koatty 应用实例
 * @param {any} options - 调度任务配置
 */
export async function initSchedule(options: any, app: Koatty): Promise<void> {
  if (!app || !Helper.isFunction(app.once)) {
    logger.Warn(`Schedule initialization skipped: Koatty app not available or not initialized`);
    return;
  }
  try {
    await injectSchedule(options);
    logger.Info('Schedule system initialized successfully');
  } catch (error) {
    logger.Error('Failed to initialize Schedule system:', error);
    throw error;
  }
}

/**
 * Inject schedule job with enhanced error handling and validation
 *
 * @param {unknown} target - Target class
 * @param {string} method - Method name
 * @param {string} cron - Cron expression
 * @param {string} [timezone] - Timezone
 */
/**
 * 批量注入调度任务 - 从IOC容器读取类元数据并创建所有CronJob
 */
export async function injectSchedule(options: any): Promise<void> {
  try {
    logger.Debug('Starting batch schedule injection...');
    let totalScheduled = 0;
    const componentList = IOCContainer.listClass("COMPONENT");
    for (const component of componentList) {
      const classMetadata = IOCContainer.getClassMetadata(COMPONENT_SCHEDULED, DecoratorType.SCHEDULED,
        component.target);
      if (!classMetadata || !Array.isArray(classMetadata)) {
        continue;
      }

      const instance: any = IOCContainer.get(component.id);
      if (!instance) {
        continue;
      }

      for (const scheduleData of classMetadata) {
        try {
          if (!scheduleData || !scheduleData.method) {
            continue;
          }

          const targetMethod = instance[scheduleData.method];
          if (!Helper.isFunction(targetMethod)) {
            logger.Warn(`Schedule injection skipped: method ${scheduleData.method} is not a function in ${component.id}`);
            continue;
          }

          const taskName = `${component.id}_${scheduleData.method}`;
          const tz = getEffectiveTimezone(options, scheduleData.timezone);

          new CronJob(
            scheduleData.cron,
            () => {
              logger.Debug(`The schedule job ${taskName} started.`);
              Promise.resolve(targetMethod.call(instance))
                .then(() => {
                  logger.Debug(`The schedule job ${taskName} completed.`);
                })
                .catch((error) => {
                  logger.Error(`The schedule job ${taskName} failed:`, error);
                });
            },
            null,
            true,
            tz
          );

          totalScheduled++;
          logger.Debug(`Schedule job ${taskName} registered with cron: ${scheduleData.cron}`);
        } catch (error) {
          logger.Error(`Failed to process schedule for ${component.id}:`, error);
        }
      }
    }

    logger.Info(`Batch schedule injection completed. ${totalScheduled} jobs registered.`);
  } catch (error) {
    logger.Error('Failed to inject schedules:', error);
  }
}
