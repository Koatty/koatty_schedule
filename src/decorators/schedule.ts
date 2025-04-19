import { IOCContainer } from 'koatty_container';
import { IScheduleOptions, IScheduleDecorator } from '../interfaces';
import { TaskExecutor } from '../utils/schedule/task';
import { getConfig } from '../config';
import { DefaultLogger as Logger } from 'koatty_logger';
import { MetricsCollector } from '../utils/monitor/metrics';

// 任务注册表
const taskRegistry = new Map<string, {
  target: any;
  method: string;
  options: IScheduleOptions;
}>();

export const Scheduled: IScheduleDecorator = (
  optionsOrCron: string | IScheduleOptions,
  timezone?: string
): MethodDecorator => {
  let options: IScheduleOptions;

  if (typeof optionsOrCron === 'string') {
    options = {
      cron: optionsOrCron,
      timezone: timezone || getConfig().schedule.timezone,
    };
  } else {
    options = {
      ...optionsOrCron,
      timezone: optionsOrCron.timezone || getConfig().schedule.timezone,
    };
  }

  if (!options.cron) {
    throw new Error('ScheduleJob rule is not defined');
  }

  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const componentType = IOCContainer.getType(target);
    if (componentType !== 'SERVICE' && componentType !== 'COMPONENT') {
      throw new Error('This decorator only used in the service、component class.');
    }

    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const taskExecutor = new TaskExecutor(
        () => originalMethod.apply(this, args),
        {
          timeout: options.timeout,
          retryTimes: options.retryTimes,
          retryDelay: options.retryDelay,
        }
      );

      const metricsCollector = MetricsCollector.getInstance();
      
      const startTime = Date.now();
      
      try {
        Logger.log('info', `Starting scheduled task: ${propertyKey}`);
        await taskExecutor.execute();
        Logger.log('info', `Completed scheduled task: ${propertyKey}`);
        
        // 记录任务执行时间
        const executionTime = Date.now() - startTime;
        metricsCollector.recordMetric(`task.${propertyKey}.execution_time`, executionTime);
      } catch (error) {
        Logger.log('error', `Task execution failed: ${propertyKey}`, error as Error);
        metricsCollector.recordMetric(`task.${propertyKey}.error_count`, 1);
        throw error;
      }
    };

    // 注册任务
    registerScheduledTask(target, propertyKey, options);

    return descriptor;
  };
};

function registerScheduledTask(
  target: any,
  propertyKey: string,
  options: IScheduleOptions
): void {
  const taskId = `${target.constructor.name}_${propertyKey}`;
  taskRegistry.set(taskId, { target, method: propertyKey, options });
  
  Logger.log('info', `Registered scheduled task: ${taskId} with cron: ${options.cron}`);
}

// 导出任务注册表，用于外部访问
export function getTaskRegistry() {
  return taskRegistry;
} 