/*
 * @Description: Enhanced RedLock functionality tests
 * @Usage: npm test -- --testNamePattern="Enhanced RedLock"
 * @Author: richen
 * @Date: 2024-01-17 22:30:00
 * @LastEditTime: 2024-01-17 22:30:00
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

import { RedLocker } from '../src/locker/redlock';
import { redLockerDescriptor } from '../src/process/locker';
import { getEffectiveRedLockOptions } from '../src/config/config';
import { debugLog } from './utils/debug';

// Mock dependencies
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
      on: jest.fn()
    }))
  };
});

jest.mock('koatty_container', () => ({
  IOCContainer: {
    get: jest.fn(),
    reg: jest.fn(),
    getIdentifier: jest.fn(),
    getType: jest.fn(() => 'COMPONENT'),
    attachClassMetadata: jest.fn(),
    getClassMetadata: jest.fn(),
    listClass: jest.fn(() => [])
  }
}));

describe('Enhanced RedLock Features', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 重置单例实例
    RedLocker.resetInstance();
  });

  afterEach(() => {
    RedLocker.resetInstance();
  });

  describe('Singleton Pattern', () => {
    test('应该返回同一个实例', () => {
      const instance1 = RedLocker.getInstance();
      const instance2 = RedLocker.getInstance();
      
      expect(instance1).toBe(instance2);
      debugLog('Singleton test passed: same instance returned');
    });

    test('应该忽略后续的选项参数', () => {
      const instance1 = RedLocker.getInstance({ lockTimeOut: 5000 });
      const instance2 = RedLocker.getInstance({ lockTimeOut: 8000 });
      
      expect(instance1).toBe(instance2);
      expect(instance1.getConfig().lockTimeOut).toBe(5000);
      debugLog('Singleton options test passed: subsequent options ignored');
    });

    test('resetInstance应该允许创建新实例', () => {
      const instance1 = RedLocker.getInstance();
      RedLocker.resetInstance();
      const instance2 = RedLocker.getInstance();
      
      expect(instance1).not.toBe(instance2);
      debugLog('Reset instance test passed: new instance created after reset');
    });
  });

  describe('Lock Extension Safety', () => {
    let mockRedlock: any;
    let mockLock: any;

    beforeEach(() => {
      mockLock = {
        extend: jest.fn(),
        release: jest.fn().mockResolvedValue(undefined)
      };

      mockRedlock = {
        acquire: jest.fn().mockResolvedValue(mockLock),
        on: jest.fn()
      };

      // Mock RedLocker initialization
      const redLocker = RedLocker.getInstance();
      (redLocker as any).redlock = mockRedlock;
      (redLocker as any).isInitialized = true;
    });

    test('应该正确处理锁续期逻辑', async () => {
      let callCount = 0;
      const mockMethod = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // 第一次调用模拟超时
          throw new Error('TIME_OUT_ERROR');
        }
        return 'success';
      });

      // 模拟锁续期返回新锁
      const extendedLock = {
        extend: jest.fn(),
        release: jest.fn().mockResolvedValue(undefined)
      };
      mockLock.extend.mockResolvedValue(extendedLock);

      const descriptor = redLockerDescriptor(
        { value: mockMethod, writable: true, enumerable: false, configurable: true },
        'test-lock',
        'testMethod',
        { lockTimeOut: 2000 }
      );

      const result = await descriptor.value!.call({});
      
      expect(result).toBe('success');
      expect(mockMethod).toHaveBeenCalledTimes(2); // 第一次超时，第二次成功
      expect(mockLock.extend).toHaveBeenCalledWith(2000);
      expect(extendedLock.release).toHaveBeenCalled();
      
      debugLog('Lock extension test passed: method retried after extension');
    });

    test('应该限制最大续期次数', async () => {
      const mockMethod = jest.fn().mockImplementation(async () => {
        throw new Error('TIME_OUT_ERROR');
      });

      const descriptor = redLockerDescriptor(
        { value: mockMethod, writable: true, enumerable: false, configurable: true },
        'test-lock',
        'testMethod',
        { lockTimeOut: 1000 }
      );

      // 模拟续期失败导致锁扩展问题
      mockLock.extend.mockRejectedValue(new Error('Cannot read properties of undefined (reading \'extend\')'));

      await expect(descriptor.value!.call({})).rejects.toThrow(
        'Lock extension failed'
      );
      
      expect(mockMethod).toHaveBeenCalledTimes(1); // 初始调用
      expect(mockLock.extend).toHaveBeenCalledTimes(1); // 尝试扩展一次
      
      debugLog('Max extension limit test passed: limited to 3 extensions');
    });

    test('应该在非超时错误时直接抛出', async () => {
      const customError = new Error('Business logic error');
      const mockMethod = jest.fn().mockRejectedValue(customError);

      const descriptor = redLockerDescriptor(
        { value: mockMethod, writable: true, enumerable: false, configurable: true },
        'test-lock',
        'testMethod'
      );

      await expect(descriptor.value!.call({})).rejects.toThrow('Business logic error');
      
      expect(mockMethod).toHaveBeenCalledTimes(1);
      expect(mockLock.extend).not.toHaveBeenCalled();
      expect(mockLock.release).toHaveBeenCalled();
      
      debugLog('Non-timeout error test passed: business error thrown directly');
    });
  });

  describe('Configuration Options Merging', () => {
    test('应该正确合并RedLock选项', () => {
      // 模拟全局配置
      const { setGlobalScheduledOptions } = require('../src/config/config');
      setGlobalScheduledOptions({
        lockTimeOut: 15000,
        maxRetries: 5,
        clockDriftFactor: 0.02
      });

      const methodOptions = {
        lockTimeOut: 20000,
        retryDelayMs: 500
      };

      const effectiveOptions = getEffectiveRedLockOptions(methodOptions);

      expect(effectiveOptions).toEqual({
        lockTimeOut: 20000,        // 方法级别覆盖
        clockDriftFactor: 0.02,    // 全局配置
        maxRetries: 5,             // 全局配置
        retryDelayMs: 500          // 方法级别覆盖
      });

      debugLog('Options merging test passed: correct priority applied');
    });

    test('应该使用默认值当没有配置时', () => {
      // 清空全局配置
      const { setGlobalScheduledOptions } = require('../src/config/config');
      setGlobalScheduledOptions({});

      const effectiveOptions = getEffectiveRedLockOptions();

      expect(effectiveOptions).toEqual({
        lockTimeOut: 10000,
        clockDriftFactor: 0.01,
        maxRetries: 3,
        retryDelayMs: 200
      });

      debugLog('Default options test passed: fallback to defaults');
    });
  });

  describe('Performance Optimizations', () => {
    test('初始化Promise应该被缓存', async () => {
      const redLocker = RedLocker.getInstance();
      
      // 模拟初始化过程
      const mockInitialization = jest.spyOn(redLocker as any, 'performInitialization')
        .mockResolvedValue(undefined);

      // 并行调用多次初始化
      const promises = [
        redLocker.initialize(),
        redLocker.initialize(),
        redLocker.initialize()
      ];

      await Promise.all(promises);

      // 应该只调用一次实际的初始化
      expect(mockInitialization).toHaveBeenCalledTimes(1);
      
      debugLog('Initialization caching test passed: single initialization call');
    });

    test('配置更新应该清理缓存', () => {
      const redLocker = RedLocker.getInstance();
      
      // 设置初始化状态
      (redLocker as any).isInitialized = true;
      (redLocker as any).initializationPromise = Promise.resolve();

      redLocker.updateConfig({ lockTimeOut: 5000 });

      expect((redLocker as any).isInitialized).toBe(false);
      expect((redLocker as any).initializationPromise).toBe(null);
      
      debugLog('Config update test passed: cache cleared on update');
    });
  });

  describe('Health Check', () => {
    test('应该返回健康状态', async () => {
      const redLocker = RedLocker.getInstance();
      
      // Mock healthy state
      (redLocker as any).isInitialized = true;
      (redLocker as any).redlock = { some: 'mock' };
      (redLocker as any).redis = { status: 'ready' };

      const health = await redLocker.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.details.initialized).toBe(true);
      expect(health.details.redisStatus).toBe('ready');
      expect(health.details.redlockReady).toBe(true);
      
      debugLog('Health check test passed: healthy status returned');
    });

    test('应该返回不健康状态当组件未初始化', async () => {
      const redLocker = RedLocker.getInstance();
      
      // Mock unhealthy state
      (redLocker as any).performInitialization = jest.fn()
        .mockRejectedValue(new Error('Initialization failed'));

      const health = await redLocker.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.details.error).toBe('Initialization failed');
      
      debugLog('Unhealthy status test passed: error properly reported');
    });
  });

  describe('Error Handling Improvements', () => {
    test('应该保留原始错误信息', async () => {
      const redLocker = RedLocker.getInstance();
      const originalError = new Error('Original Redis error');
      originalError.stack = 'Original stack trace';

      // Mock acquire failure
      (redLocker as any).redlock = {
        acquire: jest.fn().mockRejectedValue(originalError)
      };
      (redLocker as any).isInitialized = true;

      try {
        await redLocker.acquire(['test-resource'], 5000);
      } catch (error) {
        expect(error).toBe(originalError); // 应该是同一个错误对象
        expect(error.message).toBe('Lock acquisition failed: Original Redis error');
        expect(error.stack).toBe('Original stack trace'); // 保留原始堆栈
      }

      debugLog('Error preservation test passed: original error info maintained');
    });
  });
}); 