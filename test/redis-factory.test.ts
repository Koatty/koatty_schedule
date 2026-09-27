/*
 * @Description: Tests for Redis factory and multi-mode support
 * @Usage: npm test -- --testNamePattern="Redis Factory"
 * @Author: richen
 * @Date: 2025-10-30 12:00:00
 * @LastEditTime: 2025-10-30 12:00:00
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

import { RedisFactory } from '../src/locker/redis-factory';
import { RedisMode, RedisStandaloneConfig, RedisSentinelConfig, RedisClusterConfig } from '../src/locker/interface';

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
  const mockClient = {
    status: 'ready',
    on: jest.fn(),
    call: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    eval: jest.fn(),
    quit: jest.fn(),
    disconnect: jest.fn()
  };

  return {
    __esModule: true,
    default: jest.fn(() => mockClient),
    Cluster: jest.fn(() => mockClient)
  };
});

describe('Redis Factory Multi-Mode Support', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Standalone Mode', () => {
    test('应该成功创建单机模式 Redis 客户端', () => {
      const config: RedisStandaloneConfig = {
        mode: RedisMode.STANDALONE,
        host: '127.0.0.1',
        port: 6379,
        password: 'test123',
        db: 0,
        keyPrefix: 'test:'
      };

      expect(() => RedisFactory.validateConfig(config)).not.toThrow();
      
      const client = RedisFactory.createClient(config);
      expect(client).toBeDefined();
      expect(client.status).toBe('ready');
    });

    test('应该拒绝缺少 host 的单机配置', () => {
      const config = {
        mode: RedisMode.STANDALONE,
        port: 6379
      } as RedisStandaloneConfig;

      expect(() => RedisFactory.validateConfig(config)).toThrow(
        'Standalone mode requires host configuration'
      );
    });

    test('应该拒绝缺少 port 的单机配置', () => {
      const config = {
        mode: RedisMode.STANDALONE,
        host: '127.0.0.1'
      } as RedisStandaloneConfig;

      expect(() => RedisFactory.validateConfig(config)).toThrow(
        'Standalone mode requires port configuration'
      );
    });
  });

  describe('Sentinel Mode', () => {
    test('应该成功创建哨兵模式 Redis 客户端', () => {
      const config: RedisSentinelConfig = {
        mode: RedisMode.SENTINEL,
        sentinels: [
          { host: '127.0.0.1', port: 26379 },
          { host: '127.0.0.1', port: 26380 }
        ],
        name: 'mymaster',
        password: 'test123',
        db: 0
      };

      expect(() => RedisFactory.validateConfig(config)).not.toThrow();
      
      const client = RedisFactory.createClient(config);
      expect(client).toBeDefined();
      expect(client.status).toBe('ready');
    });

    test('应该拒绝缺少哨兵节点的配置', () => {
      const config = {
        mode: RedisMode.SENTINEL,
        sentinels: [],
        name: 'mymaster'
      } as RedisSentinelConfig;

      expect(() => RedisFactory.validateConfig(config)).toThrow(
        'Sentinel mode requires at least one sentinel node'
      );
    });

    test('应该拒绝缺少 master name 的配置', () => {
      const config = {
        mode: RedisMode.SENTINEL,
        sentinels: [{ host: '127.0.0.1', port: 26379 }]
      } as RedisSentinelConfig;

      expect(() => RedisFactory.validateConfig(config)).toThrow(
        'Sentinel mode requires master name'
      );
    });
  });

  describe('Cluster Mode', () => {
    test('应该成功创建集群模式 Redis 客户端', () => {
      const config: RedisClusterConfig = {
        mode: RedisMode.CLUSTER,
        nodes: [
          { host: '127.0.0.1', port: 7000 },
          { host: '127.0.0.1', port: 7001 },
          { host: '127.0.0.1', port: 7002 }
        ],
        redisOptions: {
          password: 'test123',
          db: 0
        }
      };

      expect(() => RedisFactory.validateConfig(config)).not.toThrow();
      
      const client = RedisFactory.createClient(config);
      expect(client).toBeDefined();
      expect(client.status).toBe('ready');
    });

    test('应该拒绝缺少节点的集群配置', () => {
      const config = {
        mode: RedisMode.CLUSTER,
        nodes: []
      } as RedisClusterConfig;

      expect(() => RedisFactory.validateConfig(config)).toThrow(
        'Cluster mode requires at least one node'
      );
    });
  });

  describe('Default Mode', () => {
    test('应该默认使用单机模式', () => {
      const config = {
        host: '127.0.0.1',
        port: 6379
      } as RedisStandaloneConfig;

      expect(() => RedisFactory.validateConfig(config)).not.toThrow();
      
      const client = RedisFactory.createClient(config);
      expect(client).toBeDefined();
    });
  });

  describe('Invalid Configuration', () => {
    test('应该拒绝空配置', () => {
      expect(() => RedisFactory.validateConfig(null as any)).toThrow(
        'Redis configuration cannot be empty'
      );
    });

    test('应该拒绝不支持的模式', () => {
      const config = {
        mode: 'unsupported',
        host: '127.0.0.1',
        port: 6379
      } as any;

      expect(() => RedisFactory.validateConfig(config)).toThrow(
        'Unsupported Redis mode'
      );
    });
  });

  describe('Client Adapter', () => {
    test('客户端适配器应该实现所有必需的方法', () => {
      const config: RedisStandaloneConfig = {
        mode: RedisMode.STANDALONE,
        host: '127.0.0.1',
        port: 6379
      };

      const client = RedisFactory.createClient(config);

      expect(typeof client.call).toBe('function');
      expect(typeof client.set).toBe('function');
      expect(typeof client.get).toBe('function');
      expect(typeof client.del).toBe('function');
      expect(typeof client.exists).toBe('function');
      expect(typeof client.eval).toBe('function');
      expect(typeof client.quit).toBe('function');
      expect(typeof client.disconnect).toBe('function');
      expect(typeof client.getClient).toBe('function');
    });
  });
});

