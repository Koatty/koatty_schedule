import { ITaskExecutor, TaskStatus } from '../../interfaces';
import { getConfig } from '../../config';

export class TaskExecutor implements ITaskExecutor {
  private status: TaskStatus = TaskStatus.PENDING;
  private startTime: number = 0;
  private endTime: number = 0;
  private error: Error | null = null;
  private timeoutTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly task: () => Promise<void>,
    private readonly options: {
      timeout?: number;
      retryTimes?: number;
      retryDelay?: number;
    } = {}
  ) {}

  public async execute(): Promise<void> {
    const config = getConfig();
    const timeout = this.options.timeout || config.schedule.defaultTimeout;
    const retryTimes = this.options.retryTimes || config.schedule.defaultRetryTimes;
    const retryDelay = this.options.retryDelay || config.schedule.defaultRetryDelay;

    this.startTime = Date.now();
    this.status = TaskStatus.RUNNING;

    try {
      await this.executeWithTimeout(timeout);
      this.status = TaskStatus.COMPLETED;
    } catch (error) {
      this.error = error as Error;
      
      if (retryTimes > 0) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return this.execute();
      }
      
      this.status = TaskStatus.FAILED;
      throw error;
    } finally {
      this.endTime = Date.now();
      if (this.timeoutTimer) {
        clearTimeout(this.timeoutTimer);
        this.timeoutTimer = null;
      }
    }
  }

  private async executeWithTimeout(timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.timeoutTimer = setTimeout(() => {
        this.cancel();
        reject(new Error(`Task execution timeout after ${timeout}ms`));
      }, timeout);

      this.task()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          if (this.timeoutTimer) {
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = null;
          }
        });
    });
  }

  public cancel(): void {
    if (this.status === TaskStatus.RUNNING) {
      this.status = TaskStatus.CANCELLED;
      if (this.timeoutTimer) {
        clearTimeout(this.timeoutTimer);
        this.timeoutTimer = null;
      }
    }
  }

  public getStatus(): TaskStatus {
    return this.status;
  }

  public getExecutionTime(): number {
    if (this.status === TaskStatus.PENDING) {
      return 0;
    }
    return this.endTime - this.startTime;
  }

  public getError(): Error | null {
    return this.error;
  }
} 