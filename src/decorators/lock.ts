import { IOCContainer } from 'koatty_container';
import { ILockOptions, ILockDecorator } from '../interfaces';
import { RedLock } from '../utils/lock/redlock';
import { DefaultLogger as Logger } from 'koatty_logger';
import { MetricsCollector } from '../utils/monitor/metrics';

export const RedLockDecorator: ILockDecorator = (
  optionsOrName: string | ILockOptions,
  lockTimeout?: number
): MethodDecorator => {
  let options: ILockOptions;

  if (typeof optionsOrName === 'string') {
    options = {
      name: optionsOrName,
      lockTimeout,
    };
  } else {
    options = optionsOrName;
  }

  return (target: any, methodName: string, descriptor: PropertyDescriptor) => {
    const componentType = IOCContainer.getType(target);
    if (componentType !== 'SERVICE' && componentType !== 'COMPONENT') {
      throw new Error('This decorator only used in the service、component class.');
    }

    if (!options.name) {
      const identifier = IOCContainer.getIdentifier(target) || 
        (target.constructor ? target.constructor.name : '');
      options.name = `${identifier}_${methodName}`;
    }

    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const redLock = RedLock.getInstance();
      const metricsCollector = MetricsCollector.getInstance();
      
      const lockStartTime = Date.now();
      Logger.log('info', `Attempting to acquire lock: ${options.name}`);
      
      const locked = await redLock.lock(options.name!, options);

      if (!locked) {
        Logger.log('error', `Failed to acquire lock: ${options.name}`);
        metricsCollector.recordMetric(`lock.${options.name}.acquisition_failure`, 1);
        throw new Error(`Failed to acquire lock: ${options.name}`);
      }

      const lockAcquisitionTime = Date.now() - lockStartTime;
      Logger.log('info', `Acquired lock: ${options.name} in ${lockAcquisitionTime}ms`);
      metricsCollector.recordMetric(`lock.${options.name}.acquisition_time`, lockAcquisitionTime);
      metricsCollector.recordMetric(`lock.${options.name}.acquisition_success`, 1);

      try {
        return await originalMethod.apply(this, args);
      } finally {
        const unlockStartTime = Date.now();
        await redLock.unlock(options.name!);
        const unlockTime = Date.now() - unlockStartTime;
        Logger.log('info', `Released lock: ${options.name} in ${unlockTime}ms`);
        metricsCollector.recordMetric(`lock.${options.name}.release_time`, unlockTime);
      }
    };

    return descriptor;
  };
}; 