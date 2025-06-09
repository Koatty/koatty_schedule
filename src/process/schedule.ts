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
