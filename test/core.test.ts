/*
 * @Description: Core functionality tests for koatty_schedule
 * @Usage: npm test
 * @Author: richen
 * @Date: 2024-01-17 18:00:00
 * @LastEditTime: 2024-01-17 18:00:00
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

import { Scheduled, RedLock } from '../src/index';
import { MethodDecoratorManager } from 'koatty_container';
import { ConfigManager, DecoratorType } from '../src/config/config';
import { RedLocker } from '../src/locker/redlock';
import { validateCronExpression, validateRedLockOptions } from '../src/config/config';
import { timeoutPromise } from '../src/utils/lib';

// 创建 MethodDecoratorManager 的 mock 实例
const wrapperRegistryCore = new Map();
const registeredTypesCore = new Set();

const mockMethodDecoratorManager = {
  registerWrapper: jest.fn().mockImplementation((type: string, wrapper: Function) => {
    wrapperRegistryCore.set(type, wrapper);
    registeredTypesCore.add(type);
  }),
  hasWrapper: jest.fn().mockImplementation((type: string) => wrapperRegistryCore.has(type)),
  getRegisteredTypes: jest.fn().mockImplementation(() => Array.from(registeredTypesCore)),
  registerDecorator: jest.fn().mockImplementation((target, propertyKey, metadata, descriptor) => descriptor),
  unregisterWrapper: jest.fn().mockImplementation((type: string) => {
    const existed = wrapperRegistryCore.has(type);
    wrapperRegistryCore.delete(type);
    registeredTypesCore.delete(type);
    return existed;
  }),
  getCacheStats: jest.fn().mockReturnValue({ size: 0, keys: [] }),
  clearCache: jest.fn().mockImplementation(() => {
    wrapperRegistryCore.clear();
    registeredTypesCore.clear();
  })
};

// 模拟依赖
jest.mock('koatty_container', () => ({
  IOCContainer: {
    getType: () => 'SERVICE',
    getIdentifier: () => 'TestService',
    get: jest.fn(),
    reg: jest.fn(),
    getApp: () => ({
      once: jest.fn(),
      config: () => ({ lockTimeOut: 5000 })
    })
  },
  MethodDecoratorManager: {
    getInstance: jest.fn(() => mockMethodDecoratorManager)
  }
}));

jest.mock('koatty_logger', () => ({
  DefaultLogger: {
    Info: jest.fn(),
    Debug: jest.fn(),
    Warn: jest.fn(),
    Error: jest.fn()
  }
}));

jest.mock('ioredis', () => {
  return {
    Redis: jest.fn().mockImplementation(() => ({
      status: 'ready',
      quit: jest.fn()
    }))
  };
});

jest.mock('@sesamecare-oss/redlock', () => ({
  Redlock: jest.fn().mockImplementation(() => ({
    acquire: jest.fn().mockResolvedValue({
      release: jest.fn(),
      extend: jest.fn()
    }),
    on: jest.fn()
  }))
}));

jest.mock('cron', () => ({
  CronJob: jest.fn().mockImplementation(() => ({}))
}));

describe('koatty_schedule Core Tests', () => {

  // Reset singletons before each test
  beforeEach(() => {
    // Clear require cache for modules with singletons
    delete require.cache[require.resolve('../src/config/config')];
    delete require.cache[require.resolve('koatty_container')];
    delete require.cache[require.resolve('../src/locker/redlock')];
    
    // 重置所有的 mock
    jest.clearAllMocks();
    
    // 重置wrapper registry
    wrapperRegistryCore.clear();
    registeredTypesCore.clear();
  });

  describe('Configuration Management', () => {
    let configManager: ConfigManager;

    beforeEach(() => {
      configManager = new ConfigManager();
    });

    test('validateCronExpression should validate correct cron expressions', () => {
      expect(() => validateCronExpression('0 0 * * * *')).not.toThrow();
      expect(() => validateCronExpression('*/5 * * * * *')).not.toThrow();
      expect(() => validateCronExpression('0 0 12 * * *')).not.toThrow();
    });

    test('validateCronExpression should reject invalid cron expressions', () => {
      expect(() => validateCronExpression('')).toThrow();
      expect(() => validateCronExpression('invalid')).toThrow();
      expect(() => validateCronExpression('* * * *')).toThrow();
      // Only check for standalone 60, not as part of larger numbers
      expect(() => validateCronExpression('60 * * * * *')).toThrow();
    });

    test('validateRedLockOptions should validate correct RedLock options', () => {
      expect(() => validateRedLockOptions({ lockTimeOut: 5000 })).not.toThrow();
      expect(() => validateRedLockOptions({ retryCount: 3 })).not.toThrow();
    });

    test('validateRedLockOptions should reject invalid RedLock options', () => {
      expect(() => validateRedLockOptions({ lockTimeOut: -1 })).toThrow();
      expect(() => validateRedLockOptions({ retryCount: -1 })).toThrow();
    });

    test('ConfigManager should load default configuration', () => {
      const config = configManager.getConfig();
      expect(config).toBeDefined();
      expect(config.timezone).toBe('Asia/Beijing');
    });

    test('ConfigManager should merge custom configuration', () => {
      const customConfig = {
        timezone: 'UTC',
        RedLock: { lockTimeOut: 8000 }
      };

      configManager.mergeConfig(customConfig);
      const config = configManager.getConfig();

      expect(config.timezone).toBe('UTC');
      expect(config.RedLock?.lockTimeOut).toBe(8000);
    });
  });

  describe('RedLocker', () => {
    let redLocker: RedLocker;

    beforeEach(() => {
      redLocker = new RedLocker();
    });

    test('should create instance', () => {
      expect(redLocker).toBeDefined();
      expect(redLocker).toBeInstanceOf(RedLocker);
    });

    test('should validate lock acquisition parameters before initialization', async () => {
      await expect(redLocker.acquire([], 1000)).rejects.toThrow('Resources array cannot be empty');
    });

    test('should return correct configuration', () => {
      const config = redLocker.getConfig();
      expect(config).toBeDefined();
      expect(config.lockTimeOut).toBeDefined();
    });

    test('should perform health check', async () => {
      const health = await redLocker.healthCheck();
      expect(health).toBeDefined();
      expect(health.status).toMatch(/healthy|unhealthy/);
      expect(health.details).toBeDefined();
    });
  });

  describe('Decorators', () => {

    describe('@Scheduled', () => {
      test('should apply decorator with valid parameters', () => {
        class TestService {
          @Scheduled('0 * * * * *', 'UTC')
          testMethod() {
            return 'test';
          }
        }

        const instance = new TestService();
        expect(instance.testMethod).toBeDefined();
        expect(typeof instance.testMethod).toBe('function');
      });

      test('should throw error with invalid cron expression', () => {
        expect(() => {
          class TestService {
            @Scheduled('invalid-cron')
            testMethod() {
              return 'test';
            }
          }
          new TestService();
        }).toThrow();
      });

      test('should use default timezone when not specified', () => {
        expect(() => {
          class TestService {
            @Scheduled('0 * * * * *')
            testMethod() {
              return 'test';
            }
          }
          new TestService();
        }).not.toThrow();
      });
    });

    describe('@RedLock', () => {
      test('should apply decorator with valid parameters', () => {
        class TestService {
          @RedLock('testLock', { lockTimeOut: 5000 })
          testMethod() {
            return 'test';
          }
        }

        const instance = new TestService();
        expect(instance.testMethod).toBeDefined();
        expect(typeof instance.testMethod).toBe('function');
      });

      test('should generate lock name when not provided', () => {
        expect(() => {
          class TestService {
            @RedLock()
            testMethod() {
              return 'test';
            }
          }
          new TestService();
        }).not.toThrow();
      });

      test('should validate RedLock options', () => {
        expect(() => {
          class TestService {
            @RedLock('test', { lockTimeOut: -1 })
            testMethod() {
              return 'test';
            }
          }
          new TestService();
        }).toThrow();
      });
    });

    describe('Combined Decorators', () => {
      test('should apply both @Scheduled and @RedLock', () => {
        expect(() => {
          class TestService {
            @Scheduled('0 * * * * *')
            @RedLock('combinedLock')
            testMethod() {
              return 'test';
            }
          }
          new TestService();
        }).not.toThrow();
      });
    });
  });

  describe('Utility Functions', () => {

    describe('timeoutPromise', () => {
      test('should reject after specified timeout', async () => {
        const promise = timeoutPromise(100);
        await expect(promise).rejects.toThrow('TIME_OUT_ERROR');
      });

      test('should handle immediate timeout', async () => {
        const promise = timeoutPromise(0);
        await expect(promise).rejects.toThrow('TIME_OUT_ERROR');
      });
    });
  });

  describe('Integration Tests', () => {

    test('should handle complex service with multiple decorators', () => {
      class ComplexService {
        @Scheduled('0 */5 * * * *')
        @RedLock('scheduledTask', { lockTimeOut: 30000 })
        async heavyTask() {
          // Simulate heavy work
          await new Promise(resolve => setTimeout(resolve, 100));
          return 'completed';
        }

        @RedLock('quickTask')
        async quickTask() {
          return 'quick';
        }

        @Scheduled('0 0 * * * *')
        async dailyTask() {
          return 'daily';
        }
      }

      const service = new ComplexService();
      expect(service.heavyTask).toBeDefined();
      expect(service.quickTask).toBeDefined();
      expect(service.dailyTask).toBeDefined();
    });

    test('should maintain method signatures and context', async () => {
      class ContextService {
        private data = 'test-data';

        @RedLock('contextTest')
        async getContextData() {
          return this.data;
        }
      }

      const service = new ContextService();
      // Note: In real scenario with Redis, this would work properly
      // Here we just test that the method structure is preserved
      expect(service.getContextData).toBeDefined();
      expect(typeof service.getContextData).toBe('function');
    });
  });
}); 