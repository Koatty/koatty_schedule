/*
 * @Description: Integration tests for enhanced koatty_schedule features
 * @Usage: npm test -- --testNamePattern="Integration Enhanced"
 * @Author: richen
 * @Date: 2024-01-17 23:00:00
 * @LastEditTime: 2024-01-17 23:00:00
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

import { RedLocker } from '../src/locker/redlock';
import { redLockerDescriptor } from '../src/process/locker';
import { 
  getEffectiveTimezone, 
  getEffectiveRedLockOptions,
  setGlobalScheduledOptions,
  getGlobalScheduledOptions,
  validateCronExpression
} from '../src/config/config';
import { debugLog } from './utils/debug';

// Mock external dependencies
jest.mock('koatty_logger', () => ({
  DefaultLogger: {
    Info: jest.fn(),
    Debug: jest.fn(),
    Warn: jest.fn(),
    Error: jest.fn()
  }
}));

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    status: 'ready',
    quit: jest.fn().mockResolvedValue(undefined)
  }));
});

jest.mock('@sesamecare-oss/redlock', () => {
  return {
    Redlock: jest.fn().mockImplementation(() => ({
      acquire: jest.fn(),
      using: jest.fn(async (_resources: string[], _ttl: number, _settings: any, handler: any) => handler(new AbortController().signal)),
      on: jest.fn()
    }))
  };
});

describe('Integration Enhanced Features', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    RedLocker.resetInstance();
    setGlobalScheduledOptions({});
  });

  afterEach(() => {
    RedLocker.resetInstance();
  });

  describe('Enhanced RedLocker Singleton & Performance', () => {
    test('单例模式应该确保相同实例并缓存初始化', async () => {
      const instance1 = RedLocker.getInstance({ lockTimeOut: 5000 });
      const instance2 = RedLocker.getInstance({ lockTimeOut: 8000 }); // 应被忽略

      expect(instance1).toBe(instance2);
      expect(instance1.getConfig().lockTimeOut).toBe(5000);

      // 测试并行初始化缓存
      const initSpy = jest.spyOn(instance1 as any, 'performInitialization')
        .mockResolvedValue(undefined);

      await Promise.all([
        instance1.initialize(),
        instance1.initialize(),
        instance1.initialize()
      ]);

      expect(initSpy).toHaveBeenCalledTimes(1);

      debugLog('Singleton and initialization caching test passed');
    });

    test('resetInstance应该清理状态并允许新实例', () => {
      const instance1 = RedLocker.getInstance();
      const config1 = instance1.getConfig();

      RedLocker.resetInstance();

      const instance2 = RedLocker.getInstance({ lockTimeOut: 9999 });
      const config2 = instance2.getConfig();

      expect(instance1).not.toBe(instance2);
      expect(config2.lockTimeOut).toBe(9999);
      expect(config1.lockTimeOut).not.toBe(config2.lockTimeOut);

      debugLog('Reset instance test passed');
    });
  });

  describe('Enhanced Lock Safety & Extension', () => {
    let redLocker: RedLocker;
    let mockLock: any;

    beforeEach(() => {
      redLocker = RedLocker.getInstance();
      
      mockLock = {
        extend: jest.fn(),
        release: jest.fn().mockResolvedValue(undefined)
      };

      // COR-05: the wrapper now goes through RedLocker.using() (auto-renewal)
      (redLocker as any).redlock = {
        acquire: jest.fn().mockResolvedValue(mockLock),
        on: jest.fn(),
        using: jest.fn(async (_resources: string[], ttl: number, _settings: any, handler: any) => {
          // 模拟 redlock 库在 TTL 到期前于后台自动续期
          await mockLock.extend(ttl);
          return handler(new AbortController().signal);
        })
      };
      (redLocker as any).isInitialized = true;
    });

    test('锁由后台自动续期，业务逻辑只执行一次', async () => {
      let callCount = 0;
      const mockBusinessMethod = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount > 1) {
          // COR-05 回归：绝不允许因超时重跑业务逻辑
          throw new Error('business method must not be re-run');
        }
        return 'success_1';
      });

      const descriptor = redLockerDescriptor(
        { value: mockBusinessMethod, writable: true, enumerable: false, configurable: true },
        'test-lock',
        'testMethod',
        { lockTimeOut: 2000 }
      );

      const result = await descriptor.value!.call({});

      expect(result).toBe('success_1');
      expect(mockBusinessMethod).toHaveBeenCalledTimes(1);
      expect(mockLock.extend).toHaveBeenCalledWith(2000);

      debugLog('Lock auto-renewal test passed: business method executed exactly once');
    });

    test('超过 maxHoldTime 后报错而不是重跑业务逻辑', async () => {
      const slowMethod = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 30));
        return 'late-result';
      });

      const descriptor = redLockerDescriptor(
        { value: slowMethod, writable: true, enumerable: false, configurable: true },
        'test-lock',
        'testMethod',
        { lockTimeOut: 1000, maxHoldTime: 5 }
      );

      await expect(descriptor.value!.call({})).rejects.toThrow(/exceeded maxHoldTime/);

      expect(slowMethod).toHaveBeenCalledTimes(1); // 只执行一次

      debugLog('Max hold time test passed: bounded hold time, no re-run');
    });

    test('非超时错误应该直接抛出而不重试', async () => {
      const businessError = new Error('Business Logic Error');
      const failingMethod = jest.fn().mockRejectedValue(businessError);

      const descriptor = redLockerDescriptor(
        { value: failingMethod, writable: true, enumerable: false, configurable: true },
        'test-lock',
        'testMethod'
      );

      await expect(descriptor.value!.call({})).rejects.toThrow('Business Logic Error');

      expect(failingMethod).toHaveBeenCalledTimes(1);
      // 续期/释放由 redlock 库的 using() 负责；错误不触发重试
      expect(mockLock.extend).toHaveBeenCalledTimes(1);

      debugLog('Non-timeout error handling test passed');
    });
  });

  describe('Intelligent Configuration System', () => {
    test('时区智能解析：用户指定 > 全局配置 > 默认值', () => {
      // 测试默认值
      expect(getEffectiveTimezone({})).toBe('Asia/Beijing');

      // 设置全局配置
      setGlobalScheduledOptions({ timezone: 'America/New_York' });
      expect(getEffectiveTimezone(getGlobalScheduledOptions())).toBe('America/New_York');

      // 用户指定优先级最高
      expect(getEffectiveTimezone(getGlobalScheduledOptions(), 'Europe/London')).toBe('Europe/London');

      // 空值应该fallback到全局配置
      expect(getEffectiveTimezone(getGlobalScheduledOptions(), '')).toBe('America/New_York');
      expect(getEffectiveTimezone(getGlobalScheduledOptions(), undefined)).toBe('America/New_York');

      debugLog('Timezone priority system test passed');
    });

    test('RedLock选项智能合并：方法级别 > 全局配置 > 默认值', () => {
      // 测试默认值
      expect(getEffectiveRedLockOptions()).toEqual({
        lockTimeOut: 10000,
        clockDriftFactor: 0.01,
        maxRetries: 3,
        retryDelayMs: 200
      });

      // 设置全局配置
      setGlobalScheduledOptions({
        lockTimeOut: 15000,
        maxRetries: 5,
        clockDriftFactor: 0.02
      });

      // 测试全局配置覆盖默认值
      expect(getEffectiveRedLockOptions()).toEqual({
        lockTimeOut: 15000,     // 全局配置
        clockDriftFactor: 0.02, // 全局配置
        maxRetries: 5,          // 全局配置
        retryDelayMs: 200       // 默认值
      });

      // 测试方法级别配置优先级最高
      const methodOptions = {
        lockTimeOut: 20000,
        retryDelayMs: 500
      };

      expect(getEffectiveRedLockOptions(methodOptions)).toEqual({
        lockTimeOut: 20000,     // 方法级别优先
        clockDriftFactor: 0.02, // 全局配置
        maxRetries: 5,          // 全局配置
        retryDelayMs: 500       // 方法级别优先
      });

      debugLog('RedLock options priority system test passed');
    });

    test('全局配置管理应该支持完整替换', () => {
      // 初始配置
      setGlobalScheduledOptions({
        timezone: 'Asia/Tokyo',
        lockTimeOut: 5000
      });

      let config = getGlobalScheduledOptions();
      expect(config.timezone).toBe('Asia/Tokyo');
      expect(config.lockTimeOut).toBe(5000);

      // 完整替换配置（实际行为）
      setGlobalScheduledOptions({
        lockTimeOut: 8000,
        maxRetries: 4
      });

      config = getGlobalScheduledOptions();
      expect(config.timezone).toBeUndefined();       // 被替换掉了
      expect(config.lockTimeOut).toBe(8000);         // 新值
      expect(config.maxRetries).toBe(4);             // 新值

      debugLog('Global config replacement test passed');
    });
  });

  describe('Enhanced Health Check & Error Handling', () => {
    test('健康检查应该报告详细状态', async () => {
      const redLocker = RedLocker.getInstance();
      
      // Mock 健康状态 - 需要 mock redisClient 而不是 redis
      (redLocker as any).isInitialized = true;
      (redLocker as any).redlock = { initialized: true };
      (redLocker as any).redisClient = { status: 'ready' };

      const health = await redLocker.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.details.initialized).toBe(true);
      expect(health.details.redisStatus).toBe('ready');
      expect(health.details.redlockReady).toBe(true);

      debugLog('Health check detailed status test passed');
    });

    test('健康检查应该检测不健康状态', async () => {
      const redLocker = RedLocker.getInstance();
      
      // Mock 不健康状态 - 初始化失败
      (redLocker as any).performInitialization = jest.fn()
        .mockRejectedValue(new Error('Redis connection failed'));

      const health = await redLocker.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.details.error).toBe('Redis connection failed');

      debugLog('Unhealthy state detection test passed');
    });

    test('错误处理应该保留原始错误上下文', async () => {
      const redLocker = RedLocker.getInstance();
      const originalError = new Error('Original Redis Error');
      originalError.stack = 'Original Stack Trace';

      // Mock acquire 失败
      (redLocker as any).redlock = {
        acquire: jest.fn().mockRejectedValue(originalError)
      };
      (redLocker as any).isInitialized = true;

      try {
        await redLocker.acquire(['test-resource'], 5000);
      } catch (error: any) {
        expect(error).toBe(originalError);
        expect(error.message).toBe('Lock acquisition failed: Original Redis Error');
        expect(error.stack).toBe('Original Stack Trace');
      }

      debugLog('Error context preservation test passed');
    });
  });

  describe('Cron Expression Enhanced Validation', () => {
    test('增强的cron验证应该接受有效格式', () => {
      const validCrons = [
        '0 */5 * * * *',        // 6-part with seconds
        '*/10 * * * *',         // 5-part without seconds  
        '0 0 12 * * 0',         // Specific time
        '15,45 2 * * *',        // Multiple values
        '0-23 * * * *',         // Range
        '*/15 9-17 * * 1-5'     // Complex expression
      ];

      validCrons.forEach(cron => {
        expect(() => validateCronExpression(cron)).not.toThrow();
      });

      debugLog('Enhanced cron validation for valid expressions passed');
    });

    test('增强的cron验证应该拒绝无效格式', () => {
      const invalidCrons = [
        '',                     // Empty
        '* * * *',             // Too few parts
        '* * * * * * *',       // Too many parts
        '60 * * * * *',        // Invalid seconds
        'invalid',             // Non-numeric
        null,                  // Null
        undefined              // Undefined
      ];

      invalidCrons.forEach(cron => {
        expect(() => validateCronExpression(cron as any)).toThrow();
      });

      // 单独测试一些可能通过基本检查但实际无效的表达式
      expect(() => validateCronExpression('60 0 0 1 1 1')).toThrow(); // seconds = 60
      
      debugLog('Enhanced cron validation for invalid expressions passed');
    });
  });

  describe('Performance Optimizations Verification', () => {
    test('配置更新应该清理缓存状态', () => {
      const redLocker = RedLocker.getInstance();
      
      // 设置初始化状态
      (redLocker as any).isInitialized = true;
      (redLocker as any).initializationPromise = Promise.resolve();

      // 更新配置应该清理缓存
      redLocker.updateConfig({ lockTimeOut: 7000 });

      expect((redLocker as any).isInitialized).toBe(false);
      expect((redLocker as any).initializationPromise).toBe(null);
      expect(redLocker.getConfig().lockTimeOut).toBe(7000);

      debugLog('Config update cache clearing test passed');
    });

    test('重复初始化应该使用缓存的Promise', async () => {
      const redLocker = RedLocker.getInstance();
      
      const mockPerformInit = jest.spyOn(redLocker as any, 'performInitialization')
        .mockResolvedValue(undefined);

      // 并行调用多次初始化
      const promises = Array(5).fill(null).map(() => redLocker.initialize());
      await Promise.all(promises);

      // 应该只调用一次实际初始化
      expect(mockPerformInit).toHaveBeenCalledTimes(1);

      debugLog('Initialization promise caching test passed');
    });
  });
}); 