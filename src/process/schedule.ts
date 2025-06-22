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
 *
 * @param {RedLockOptions} options - RedLock 配置选项  
 * @param {Koatty} app - Koatty 应用实例
 */
export async function injectSchedule(_options: any, _app: any): Promise<void> {
  try {
    logger.Debug('Starting batch schedule injection...');

    const componentList = IOCContainer.listClass(COMPONENT_SCHEDULED);
    for (const component of componentList) {
      const classMetadata = IOCContainer.getClassMetadata(COMPONENT_SCHEDULED, DecoratorType.SCHEDULED,
        component.target);
      if (!classMetadata) {
        continue;
      }
      let scheduledCount = 0;

      for (const [className, metadata] of classMetadata) {
        try {
          const instance: any = IOCContainer.get(className);
          if (!instance) {
            continue;
          }

          // 查找所有调度方法的元数据
          for (const [key, value] of Object.entries(metadata)) {
            if (key.startsWith('SCHEDULED')) {
              const scheduleData = value as {
                method: string;
                cron: string;
                timezone?: string;
              };

              const targetMethod = instance[scheduleData.method];
              if (!Helper.isFunction(targetMethod)) {
                logger.Warn(`Schedule injection skipped: method ${scheduleData.method} is not a function in ${className}`);
                continue;
              }

              const taskName = `${className}_${scheduleData.method}`;
              const tz = getEffectiveTimezone(scheduleData.timezone);

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
                null, // onComplete
                true, // start
                tz // timeZone
              );

              scheduledCount++;
              logger.Debug(`Schedule job ${taskName} registered with cron: ${scheduleData.cron}`);
            }
          }
        } catch (error) {
          logger.Error(`Failed to process class ${className}:`, error);
        }
      }

      logger.Info(`Batch schedule injection completed. ${scheduledCount} jobs registered.`);
    }
  } catch (error) {
    logger.Error('Failed to inject schedules:', error);
  }
}
