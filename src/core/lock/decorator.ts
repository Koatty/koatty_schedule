import { MethodDecorator } from '../../interfaces';
import { RedLock } from './redlock';
import { DefaultLogger as Logger } from 'koatty_logger';
import { ILockOptions } from '../../interfaces';

export function Lock(options: ILockOptions = {}): MethodDecorator {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const lockName = `${target.constructor.name}:${propertyKey}`;
      const redLock = RedLock.getInstance();

      try {
        const locked = await redLock.lock(lockName, options);
        if (!locked) {
          Logger.warn(`Failed to acquire lock for ${lockName}`);
          return;
        }

        try {
          return await originalMethod.apply(this, args);
        } finally {
          await redLock.unlock(lockName);
        }
      } catch (error) {
        Logger.error(`Error in lock decorator for ${lockName}:`, error);
        throw error;
      }
    };

    return descriptor;
  };
} 