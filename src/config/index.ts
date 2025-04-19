import { RedisOptions } from 'ioredis';

export interface ScheduleConfig {
  timezone: string;
  defaultRetryTimes: number;
  defaultRetryDelay: number;
  defaultTimeout: number;
}

export interface LockConfig {
  defaultLockTimeout: number;
  defaultWaitLockRetry: number;
  lockRenewalInterval: number;
  lockRenewalTimes: number;
}

export interface RedisConfig extends RedisOptions {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

export interface Config {
  schedule: ScheduleConfig;
  lock: LockConfig;
  redis: RedisConfig;
}

const defaultConfig: Config = {
  schedule: {
    timezone: 'Asia/Shanghai',
    defaultRetryTimes: 3,
    defaultRetryDelay: 1000,
    defaultTimeout: 30000,
  },
  lock: {
    defaultLockTimeout: 10000,
    defaultWaitLockRetry: 3,
    lockRenewalInterval: 5000,
    lockRenewalTimes: 3,
  },
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0,
  },
};

let config: Config = { ...defaultConfig };

export function setConfig(newConfig: Partial<Config>) {
  config = {
    ...config,
    ...newConfig,
    schedule: { ...config.schedule, ...newConfig.schedule },
    lock: { ...config.lock, ...newConfig.lock },
    redis: { ...config.redis, ...newConfig.redis },
  };
}

export function getConfig(): Config {
  return config;
} 