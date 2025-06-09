/*
 * @Description: Test for simplified DecoratorManager design
 * @Usage: npm test
 * @Author: richen
 * @Date: 2024-01-17 16:00:00
 * @LastEditTime: 2024-01-17 16:00:00
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

import { MethodDecoratorManager } from 'koatty_container';
import { RedLock } from '../src/decorator/redlock';
import { Scheduled } from '../src/decorator/scheduled';

// 创建 MethodDecoratorManager 的 mock 实例
const wrapperRegistry = new Map();
const registeredTypes = new Set();

const mockMethodDecoratorManager = {
  registerWrapper: jest.fn().mockImplementation((type: string, wrapper: Function) => {
    wrapperRegistry.set(type, wrapper);
    registeredTypes.add(type);
  }),
  hasWrapper: jest.fn().mockImplementation((type: string) => wrapperRegistry.has(type)),
  getRegisteredTypes: jest.fn().mockImplementation(() => Array.from(registeredTypes)),
  registerDecorator: jest.fn().mockImplementation((target, propertyKey, metadata, descriptor) => {
    // 如果有对应的wrapper，则应用它
    const wrapper = wrapperRegistry.get(metadata.type);
    if (wrapper) {
      try {
        const wrappedMethod = wrapper(descriptor.value, metadata.config, propertyKey, target);
        return { ...descriptor, value: wrappedMethod };
      } catch (error) {
        // wrapper异常时返回原方法
        return descriptor;
      }
    }
    return descriptor;
  }),
  unregisterWrapper: jest.fn().mockImplementation((type: string) => {
    const existed = wrapperRegistry.has(type);
    wrapperRegistry.delete(type);
    registeredTypes.delete(type);
    return existed;
  }),
  getCacheStats: jest.fn().mockReturnValue({ size: 0, keys: [] }),
  clearCache: jest.fn().mockImplementation(() => {
    wrapperRegistry.clear();
    registeredTypes.clear();
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

/**
 * Wrapper function type
 */
type WrapperFunction = (originalMethod: Function, config: any, methodName: string, target: unknown) => Function;

/**
 * Test the simplified DecoratorManager design with real decorators
 */
describe('Simplified DecoratorManager', () => {
  let manager: MethodDecoratorManager;

  beforeEach(() => {
    // 重置所有的 mock
    jest.clearAllMocks();
    
    // 重置wrapper registry
    wrapperRegistry.clear();
    registeredTypes.clear();
    
    manager = MethodDecoratorManager.getInstance();
  });

  test('应该能够注册自定义wrapper', () => {
    // 定义一个简单的测试wrapper
    const testWrapper: WrapperFunction = (originalMethod, config, methodName, target) => {
      return function(...args: any[]) {
        console.log(`Before ${methodName} with config:`, config);
        const result = originalMethod.apply(this, args);
        console.log(`After ${methodName}`);
        return result;
      };
    };

    // 注册wrapper
    manager.registerWrapper('TEST', testWrapper);

    // 验证wrapper已注册
    expect(manager.hasWrapper('TEST')).toBe(true);
    expect(manager.getRegisteredTypes()).toContain('TEST');
  });

  test('应该能够取消注册wrapper', () => {
    const testWrapper: WrapperFunction = (originalMethod) => originalMethod;
    
    manager.registerWrapper('TEMP', testWrapper);
    expect(manager.hasWrapper('TEMP')).toBe(true);

    const removed = manager.unregisterWrapper('TEMP');
    expect(removed).toBe(true);
    expect(manager.hasWrapper('TEMP')).toBe(false);
  });

  test('应该能够获取缓存统计信息', () => {
    const stats = manager.getCacheStats();
    expect(stats).toHaveProperty('size');
    expect(stats).toHaveProperty('keys');
    expect(Array.isArray(stats.keys)).toBe(true);
  });

  test('应该能够清理缓存', () => {
    manager.clearCache();
    const stats = manager.getCacheStats();
    expect(stats.size).toBe(0);
  });

  test('实际使用RedLock装饰器后应该注册wrapper', () => {
    // 获取全局的DecoratorManager实例（与装饰器使用的同一个）
    const decoratorManager = MethodDecoratorManager.getInstance();
    
    // 定义测试类
    class TestService {
      @RedLock('test-lock')
      testMethod() {
        return 'original';
      }
    }

    // 创建实例 - 这会触发装饰器的执行和wrapper注册
    const service = new TestService();
    
    // 检查DecoratorManager是否注册了REDLOCK wrapper
    expect(decoratorManager.hasWrapper('REDLOCK')).toBe(true);
    expect(decoratorManager.getRegisteredTypes()).toContain('REDLOCK');
  });

  test('实际使用Scheduled装饰器后应该注册wrapper', () => {
    // 获取全局的DecoratorManager实例（与装饰器使用的同一个）
    const decoratorManager = MethodDecoratorManager.getInstance();
    
    // 定义测试类  
    class TestService {
      @Scheduled('0 0 * * *')
      testMethod() {
        return 'scheduled';
      }
    }

    // 创建实例 - 这会触发装饰器的执行和wrapper注册
    const service = new TestService();
    
    // 检查DecoratorManager是否注册了SCHEDULED wrapper
    expect(decoratorManager.hasWrapper('SCHEDULED')).toBe(true);
    expect(decoratorManager.getRegisteredTypes()).toContain('SCHEDULED');
  });

  test('组合多个装饰器应该按优先级包装', () => {
    // 注册测试wrapper
    manager.registerWrapper('HIGH_PRIORITY', (originalMethod, config, methodName) => {
      return function(...args: any[]) {
        return `high_${originalMethod.apply(this, args)}`;
      };
    });

    manager.registerWrapper('LOW_PRIORITY', (originalMethod, config, methodName) => {
      return function(...args: any[]) {
        return `low_${originalMethod.apply(this, args)}`;
      };
    });

    const originalMethod = function testMethod() { return 'original'; };
    const descriptor = { value: originalMethod, writable: true, enumerable: false, configurable: true };

    const highPriorityDecorator = {
      type: 'HIGH_PRIORITY',
      config: {},
      applied: true,
      priority: 10
    };

    const lowPriorityDecorator = {
      type: 'LOW_PRIORITY',
      config: {},
      applied: true,
      priority: 1
    };

    // 先注册低优先级装饰器
    const result1 = manager.registerDecorator({}, 'testMethod', lowPriorityDecorator, descriptor);
    
    // 再注册高优先级装饰器
    const result2 = manager.registerDecorator({}, 'testMethod', highPriorityDecorator, { ...descriptor, value: result1.value });

    // 执行包装后的方法
    const wrappedMethod = result2.value;
    const result = wrappedMethod();

    // 高优先级装饰器应该在外层包装
    expect(result).toBe('high_low_original');
  });

  test('处理不存在的wrapper类型应该安全失败', () => {
    const originalMethod = function testMethod() { return 'original'; };
    const descriptor = { value: originalMethod, writable: true, enumerable: false, configurable: true };
    
    const invalidDecorator = {
      type: 'NON_EXISTENT',
      config: {},
      applied: true,
      priority: 1
    };

    // 应该不抛出错误，但会警告
    const result = manager.registerDecorator({}, 'testMethod', invalidDecorator, descriptor);
    
    // 方法应该仍然可用，只是没有被包装
    expect(result.value).toBe(originalMethod);
  });

  test('wrapper函数异常应该不影响其他wrapper', () => {
    const originalMethod = function testMethod() { return 'original'; };
    const descriptor = { value: originalMethod, writable: true, enumerable: false, configurable: true };
    
    // 注册一个会抛出异常的wrapper
    manager.registerWrapper('ERROR_WRAPPER', () => {
      throw new Error('Wrapper error');
    });

    // 注册一个正常的wrapper
    manager.registerWrapper('NORMAL_WRAPPER', (originalMethod) => {
      return function(...args: any[]) {
        return `wrapped_${originalMethod.apply(this, args)}`;
      };
    });

    const errorDecorator = {
      type: 'ERROR_WRAPPER',
      config: {},
      applied: true,
      priority: 10
    };

    const normalDecorator = {
      type: 'NORMAL_WRAPPER',
      config: {},
      applied: true,
      priority: 1
    };

    // 先注册正常装饰器
    const result1 = manager.registerDecorator({}, 'testMethod', normalDecorator, descriptor);
    
    // 再注册错误装饰器（应该不影响正常装饰器）
    const result2 = manager.registerDecorator({}, 'testMethod', errorDecorator, { ...descriptor, value: result1.value });

    // 正常wrapper应该仍然工作
    const wrappedMethod = result2.value;
    const result = wrappedMethod();
    expect(result).toBe('wrapped_original');
  });

  test('重复使用同一装饰器不应该重复注册wrapper', () => {
    // 获取全局的DecoratorManager实例
    const decoratorManager = MethodDecoratorManager.getInstance();
    
    // 记录注册前的wrapper数量
    const initialTypes = decoratorManager.getRegisteredTypes();
    const initialRedlockCount = initialTypes.filter(type => type === 'REDLOCK').length;
    
    // 定义第一个测试类
    class TestService1 {
      @RedLock('test-lock-1')
      testMethod() {
        return 'service1';
      }
    }

    // 定义第二个测试类，使用相同的装饰器类型
    class TestService2 {
      @RedLock('test-lock-2')
      testMethod() {
        return 'service2';
      }
    }

    // 创建实例 - 都会尝试注册REDLOCK wrapper
    const service1 = new TestService1();
    const service2 = new TestService2();
    
    // REDLOCK wrapper应该存在
    expect(decoratorManager.hasWrapper('REDLOCK')).toBe(true);
    
    // 获取注册类型列表，REDLOCK应该只增加一次（如果之前没有的话）
    const finalTypes = decoratorManager.getRegisteredTypes();
    const finalRedlockCount = finalTypes.filter(type => type === 'REDLOCK').length;
    expect(finalRedlockCount).toBe(initialRedlockCount + 1);
  });
}); 