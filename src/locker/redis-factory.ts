/*
 * @Description: Redis client factory supporting multiple modes
 * @Usage: 
 * @Author: richen
 * @Date: 2025-10-30 12:00:00
 * @LastEditTime: 2025-10-30 12:00:00
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

import Redis, { Cluster, RedisOptions, ClusterOptions } from "ioredis";
import { DefaultLogger as logger } from "koatty_logger";
import {
  IRedisClient,
  RedisConfig,
  RedisMode,
  RedisStandaloneConfig,
  RedisSentinelConfig,
  RedisClusterConfig
} from "./interface";

/**
 * Redis client wrapper that implements IRedisClient interface
 * Wraps ioredis client to provide unified interface
 */
class RedisClientAdapter implements IRedisClient {
  constructor(private client: Redis | Cluster) {}

  get status(): string {
    return this.client.status;
  }

  async call(command: string, ...args: any[]): Promise<any> {
    return this.client.call(command, ...args);
  }

  async set(key: string, value: string | Buffer, mode?: string, duration?: number): Promise<'OK' | null> {
    if (mode && duration) {
      // Use type assertion for mode parameter due to ioredis strict typing
      return this.client.set(key, value, mode as any, duration) as Promise<'OK' | null>;
    }
    return this.client.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(...keys: string[]): Promise<number> {
    return this.client.del(...keys);
  }

  async exists(key: string): Promise<number> {
    return this.client.exists(key);
  }

  async eval(script: string, numKeys: number, ...args: any[]): Promise<any> {
    return this.client.eval(script, numKeys, ...args);
  }

  async quit(): Promise<'OK'> {
    return this.client.quit();
  }

  disconnect(): void {
    this.client.disconnect();
  }

  /**
   * Get underlying Redis/Cluster instance
   * Used for RedLock initialization
   */
  getClient(): Redis | Cluster {
    return this.client;
  }
}

/**
 * Redis client factory
 * Creates appropriate Redis client based on configuration
 */
export class RedisFactory {
  /**
   * Create Redis client based on configuration mode
   * @param config - Redis configuration
   * @returns Redis client adapter
   */
  static createClient(config: RedisConfig): RedisClientAdapter {
    const mode = config.mode || RedisMode.STANDALONE;

    logger.Debug(`Creating Redis client in ${mode} mode`);

    switch (mode) {
      case RedisMode.STANDALONE:
        return this.createStandaloneClient(config as RedisStandaloneConfig);
      
      case RedisMode.SENTINEL:
        return this.createSentinelClient(config as RedisSentinelConfig);
      
      case RedisMode.CLUSTER:
        return this.createClusterClient(config as RedisClusterConfig);
      
      default:
        throw new Error(`不支持的 Redis 模式: ${mode} (Unsupported Redis mode: ${mode})`);
    }
  }

  /**
   * Create standalone Redis client
   * @param config - Standalone configuration
   */
  private static createStandaloneClient(config: RedisStandaloneConfig): RedisClientAdapter {
    logger.Debug(`Creating standalone Redis client: ${config.host}:${config.port}`);

    const options: RedisOptions = {
      host: config.host,
      port: config.port,
      password: config.password || undefined,
      db: config.db || 0,
      keyPrefix: config.keyPrefix || '',
      connectTimeout: config.connectTimeout || 10000,
      commandTimeout: config.commandTimeout || 5000,
      maxRetriesPerRequest: config.maxRetriesPerRequest || 3,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        logger.Debug(`Redis reconnecting, attempt ${times}, delay ${delay}ms`);
        return delay;
      },
      reconnectOnError: (err: Error) => {
        logger.Warn('Redis connection error, attempting reconnect:', err.message);
        return true;
      }
    };

    const client = new Redis(options);

    client.on('connect', () => {
      logger.Info('Redis standalone client connected successfully');
    });

    client.on('error', (err: Error) => {
      logger.Error('Redis standalone client error:', err);
    });

    return new RedisClientAdapter(client);
  }

  /**
   * Create sentinel Redis client
   * @param config - Sentinel configuration
   */
  private static createSentinelClient(config: RedisSentinelConfig): RedisClientAdapter {
    logger.Debug(`Creating sentinel Redis client for master: ${config.name}`);

    const options: RedisOptions = {
      sentinels: config.sentinels,
      name: config.name,
      password: config.password || undefined,
      sentinelPassword: config.sentinelPassword || undefined,
      db: config.db || 0,
      keyPrefix: config.keyPrefix || '',
      connectTimeout: config.connectTimeout || 10000,
      commandTimeout: config.commandTimeout || 5000,
      maxRetriesPerRequest: config.maxRetriesPerRequest || 3,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        logger.Debug(`Sentinel Redis reconnecting, attempt ${times}, delay ${delay}ms`);
        return delay;
      }
    };

    const client = new Redis(options);

    client.on('connect', () => {
      logger.Info(`Redis sentinel client connected to master: ${config.name}`);
    });

    client.on('error', (err: Error) => {
      logger.Error('Redis sentinel client error:', err);
    });

    return new RedisClientAdapter(client);
  }

  /**
   * Create cluster Redis client
   * @param config - Cluster configuration
   */
  private static createClusterClient(config: RedisClusterConfig): RedisClientAdapter {
    logger.Debug(`Creating cluster Redis client with ${config.nodes.length} nodes`);

    const clusterOptions: ClusterOptions = {
      redisOptions: {
        password: config.redisOptions?.password || config.password || undefined,
        db: config.redisOptions?.db || config.db || 0,
        keyPrefix: config.keyPrefix || '',
        connectTimeout: config.connectTimeout || 10000,
        commandTimeout: config.commandTimeout || 5000,
        maxRetriesPerRequest: config.maxRetriesPerRequest || 3
      },
      clusterRetryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        logger.Debug(`Cluster Redis reconnecting, attempt ${times}, delay ${delay}ms`);
        return delay;
      }
    };

    const cluster = new Cluster(config.nodes, clusterOptions);

    cluster.on('connect', () => {
      logger.Info('Redis cluster client connected successfully');
    });

    cluster.on('error', (err: Error) => {
      logger.Error('Redis cluster client error:', err);
    });

    cluster.on('node error', (err: Error, address: string) => {
      logger.Error(`Redis cluster node error at ${address}:`, err);
    });

    return new RedisClientAdapter(cluster);
  }

  /**
   * Validate Redis configuration
   * @param config - Redis configuration to validate
   */
  static validateConfig(config: RedisConfig): void {
    if (!config) {
      throw new Error('Redis 配置不能为空 (Redis configuration cannot be empty)');
    }

    const mode = config.mode || RedisMode.STANDALONE;

    switch (mode) {
      case RedisMode.STANDALONE:
        this.validateStandaloneConfig(config as RedisStandaloneConfig);
        break;
      
      case RedisMode.SENTINEL:
        this.validateSentinelConfig(config as RedisSentinelConfig);
        break;
      
      case RedisMode.CLUSTER:
        this.validateClusterConfig(config as RedisClusterConfig);
        break;
      
      default:
        throw new Error(`不支持的 Redis 模式: ${mode} (Unsupported Redis mode: ${mode})`);
    }
  }

  private static validateStandaloneConfig(config: RedisStandaloneConfig): void {
    if (!config.host) {
      throw new Error('单机模式需要 host 配置 (Standalone mode requires host configuration)');
    }
    if (!config.port) {
      throw new Error('单机模式需要 port 配置 (Standalone mode requires port configuration)');
    }
  }

  private static validateSentinelConfig(config: RedisSentinelConfig): void {
    if (!config.sentinels || config.sentinels.length === 0) {
      throw new Error('哨兵模式需要至少一个哨兵节点配置 (Sentinel mode requires at least one sentinel node)');
    }
    if (!config.name) {
      throw new Error('哨兵模式需要 master name 配置 (Sentinel mode requires master name)');
    }
  }

  private static validateClusterConfig(config: RedisClusterConfig): void {
    if (!config.nodes || config.nodes.length === 0) {
      throw new Error('集群模式需要至少一个节点配置 (Cluster mode requires at least one node)');
    }
  }
}

export { RedisClientAdapter };

