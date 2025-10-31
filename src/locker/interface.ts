/*
 * @Description: Abstract interfaces for Redis client and distributed lock
 * @Usage: 
 * @Author: richen
 * @Date: 2025-10-30 12:00:00
 * @LastEditTime: 2025-10-30 12:00:00
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

import type { Lock, Settings } from "@sesamecare-oss/redlock";

/**
 * Redis connection mode
 */
export enum RedisMode {
  STANDALONE = 'standalone',  // 单机模式
  SENTINEL = 'sentinel',       // 哨兵模式
  CLUSTER = 'cluster'          // 集群模式
}

/**
 * Base Redis configuration
 */
export interface BaseRedisConfig {
  mode?: RedisMode;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  connectTimeout?: number;
  commandTimeout?: number;
  maxRetriesPerRequest?: number;
}

/**
 * Sentinel configuration
 */
export interface RedisSentinelConfig extends BaseRedisConfig {
  mode: RedisMode.SENTINEL;
  sentinels: Array<{ host: string; port: number }>;
  name: string;  // sentinel master name
  sentinelPassword?: string;
}

/**
 * Cluster configuration
 */
export interface RedisClusterConfig extends BaseRedisConfig {
  mode: RedisMode.CLUSTER;
  nodes: Array<{ host: string; port: number }>;
  redisOptions?: {
    password?: string;
    db?: number;
  };
}

/**
 * Standalone configuration
 */
export interface RedisStandaloneConfig extends BaseRedisConfig {
  mode?: RedisMode.STANDALONE;
  host: string;
  port: number;
}

/**
 * Union type for all Redis configurations
 */
export type RedisConfig = RedisStandaloneConfig | RedisSentinelConfig | RedisClusterConfig;

/**
 * Abstract Redis client interface
 * Provides unified interface for different Redis implementations
 */
export interface IRedisClient {
  /**
   * Get connection status
   */
  readonly status: string;

  /**
   * Execute Redis command
   * @param command - Command name
   * @param args - Command arguments
   */
  call(command: string, ...args: any[]): Promise<any>;

  /**
   * Set a key-value pair
   * @param key - Key name
   * @param value - Value
   * @param mode - Optional mode (e.g., 'EX' for expiration)
   * @param duration - Optional duration in seconds
   */
  set(key: string, value: string | Buffer, mode?: string, duration?: number): Promise<'OK' | null>;

  /**
   * Get value by key
   * @param key - Key name
   */
  get(key: string): Promise<string | null>;

  /**
   * Delete one or more keys
   * @param keys - Key names
   */
  del(...keys: string[]): Promise<number>;

  /**
   * Check if key exists
   * @param key - Key name
   */
  exists(key: string): Promise<number>;

  /**
   * Evaluate Lua script
   * @param script - Lua script
   * @param numKeys - Number of keys
   * @param args - Script arguments
   */
  eval(script: string, numKeys: number, ...args: any[]): Promise<any>;

  /**
   * Close the connection
   */
  quit(): Promise<'OK'>;

  /**
   * Disconnect immediately
   */
  disconnect(): void;
}

/**
 * Abstract distributed lock interface
 * Allows for different lock implementations (RedLock, Zookeeper, etc.)
 */
export interface IDistributedLock {
  /**
   * Initialize the lock system
   */
  initialize(): Promise<void>;

  /**
   * Acquire a distributed lock
   * @param resources - Resource identifiers
   * @param ttl - Time to live in milliseconds
   */
  acquire(resources: string[], ttl: number): Promise<Lock>;

  /**
   * Release a lock
   * @param lock - Lock instance
   */
  release(lock: Lock): Promise<void>;

  /**
   * Extend lock TTL
   * @param lock - Lock instance
   * @param ttl - New TTL in milliseconds
   */
  extend(lock: Lock, ttl: number): Promise<Lock>;

  /**
   * Check if the lock system is ready
   */
  isReady(): boolean;

  /**
   * Get current configuration
   */
  getConfig(): any;

  /**
   * Close and cleanup
   */
  close(): Promise<void>;

  /**
   * Health check
   */
  healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: Record<string, any> }>;
}

/**
 * Lock configuration options
 */
export interface ILockOptions extends Partial<Settings> {
  lockTimeOut?: number;
  clockDriftFactor?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  redisConfig?: RedisConfig;
}

