
export type MethodDecorator = (
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
) => PropertyDescriptor | void;

export interface IScheduleOptions {
  cron: string;
  timezone?: string;
  retryTimes?: number;
  retryDelay?: number;
  timeout?: number;
}

export interface ILockOptions {
  name?: string;
  lockTimeout?: number;
  waitLockRetry?: number;
  renewalInterval?: number;
  renewalTimes?: number;
}

export interface IScheduleDecorator {
  (options: IScheduleOptions): MethodDecorator;
  (cron: string, timezone?: string): MethodDecorator;
}

export interface ILockDecorator {
  (options: ILockOptions): MethodDecorator;
  (name?: string, lockTimeout?: number): MethodDecorator;
}

export interface ITaskExecutor {
  execute(): Promise<void>;
  cancel(): void;
  getStatus(): TaskStatus;
}

export enum TaskStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
} 