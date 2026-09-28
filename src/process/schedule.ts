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
 * COR-06 (C-4): what happens when a tick fires while the previous run of the
 * same job is still in flight.
 *
 * - `skip` (default): the tick is dropped;
 * - `queue`: at most one follow-up run is remembered and started when the
 *   current one finishes;
 * - `allow`: legacy behaviour, runs overlap.
 */
export type OverlapPolicy = 'skip' | 'queue' | 'allow';

interface TaskState {
  running: boolean;
  queued: boolean;
}

/** per-task `running` / `queued` flags (COR-06) */
const taskStates = new Map<string, TaskState>();
/** jobs registered by `injectSchedule`, stopped together on shutdown */
const registeredJobs: CronJob[] = [];
/** in-flight task promises, awaited (bounded) on shutdown */
const inFlightTasks = new Set<Promise<unknown>>();

/**
 * Run one scheduled task honouring the overlap policy.
 *
 * Exported so the policy can be tested without a cron scheduler.
 */
export function runScheduledTask(
  taskName: string,
  targetMethod: () => unknown,
  overlap: OverlapPolicy = 'skip'
): Promise<void> | undefined {
  let state = taskStates.get(taskName);
  if (!state) {
    state = { running: false, queued: false };
    taskStates.set(taskName, state);
  }

  if (state.running) {
    if (overlap === 'allow') {
      // legacy behaviour: run concurrently
    } else if (overlap === 'queue') {
      if (state.queued) {
        logger.Debug(`The schedule job ${taskName} tick dropped: one run is already queued.`);
        return undefined;
      }
      state.queued = true;
      logger.Debug(`The schedule job ${taskName} queued behind the running one.`);
      return undefined;
    } else {
      logger.Warn(`The schedule job ${taskName} skipped: the previous run is still in progress (overlap: skip).`);
      return undefined;
    }
  }

  const runOnce = (): Promise<void> => {
    state!.running = true;
    logger.Debug(`The schedule job ${taskName} started.`);

    const task = Promise.resolve()
      .then(() => targetMethod())
      .then(() => {
        logger.Debug(`The schedule job ${taskName} completed.`);
      })
      .catch((error) => {
        logger.Error(`The schedule job ${taskName} failed:`, error);
      })
      .finally(() => {
        state!.running = false;
        inFlightTasks.delete(task);
        if (state!.queued) {
          // COR-06: at most one queued run, started as soon as this one is done
          state!.queued = false;
          runOnce();
        }
      });

    inFlightTasks.add(task);
    return task;
  };

  return runOnce();
}

/**
 * COR-06: stop every registered CronJob and (bounded by `drainTimeout`) wait for
 * the tasks that are still running, so a deploy does not cut a job mid-way.
 */
export async function stopSchedule(drainTimeout = 25000): Promise<void> {
  const jobs = registeredJobs.splice(0, registeredJobs.length);
  for (const job of jobs) {
    try {
      job.stop();
    } catch (error) {
      logger.Warn('Failed to stop a schedule job:', error);
    }
  }

  if (inFlightTasks.size === 0) {
    return;
  }

  logger.Info(`Waiting for ${inFlightTasks.size} running schedule job(s) to finish (timeout ${drainTimeout}ms)...`);
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    Promise.allSettled([...inFlightTasks]),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, drainTimeout);
    })
  ]);
  if (timer) clearTimeout(timer);
}

/** Number of jobs currently registered (test / diagnostics helper). */
export function getRegisteredJobCount(): number {
  return registeredJobs.length;
}

/** Number of tasks currently running (test / diagnostics helper). */
export function getRunningTaskCount(): number {
  return inFlightTasks.size;
}

/** Clear the internal registries (test helper). */
export function resetScheduleState(): void {
  registeredJobs.splice(0, registeredJobs.length);
  inFlightTasks.clear();
  taskStates.clear();
}

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
    // COR-06: stop the jobs and let the in-flight runs finish on shutdown
    if (Helper.isFunction(app.once)) {
      app.once('appStop', () => {
        void stopSchedule(options?.drainTimeout ?? 25000);
      });
    }
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

          // COR-06: overlap policy from the @Scheduled decorator (default: skip)
          const overlap: OverlapPolicy = (scheduleData as any).overlap ?? 'skip';

          const job = new CronJob(
            scheduleData.cron,
            async () => {
              await runScheduledTask(taskName, () => targetMethod.call(instance), overlap);
            },
            null,
            true,
            tz
          );
          registeredJobs.push(job);

          totalScheduled++;
          logger.Debug(`Schedule job ${taskName} registered with cron: ${scheduleData.cron} (overlap: ${overlap})`);
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
