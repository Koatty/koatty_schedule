/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2024-01-16 20:19:23
 * @LastEditTime: 2024-01-17 11:24:06
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
import {
  ExecutionResult, Lock, Redlock, RedlockAbortSignal,
  RedlockUsingContext, Settings
} from "@sesamecare-oss/redlock";
import Client, { RedisOptions } from "ioredis";


/**
 * @description: RedLockOptions
 * @return {*}
 */
export interface RedLockOptions {
  /**
   * lock a resource times
   */
  lockTimeOut?: number;
  /**
   * The max number of times Redlock will attempt to lock a resource
   */
  retryCount?: number;
  /**
   * redis config
   */
  RedisOptions: RedisOptions;
}


/**
 * @description: 
 * @return {*}
 */
export class RedLocker {
  private options?: RedLockOptions = {
    RedisOptions: {
      host: '127.0.0.1',
      port: 6379,
      name: "",
      username: "",
      password: "",
    }
  };
  private static instance: RedLocker | null = null;

  // 私有构造函数，防止外部实例化
  private constructor(options: RedLockOptions) {
    if (options) {
      this.options = { ...this.options, ...options };
    }

    // 初始化单例
    const client = new Client(this.options.RedisOptions);
    RedLocker.instance = new Redlock(
      // You should have one client for each independent redis node
      // or cluster.
      [client],
      {
        // The expected clock drift; for more details see:
        // http://redis.io/topics/distlock
        driftFactor: 0.01, // multiplied by lock ttl to determine drift time

        // The max number of times Redlock will attempt to lock a resource
        // before erroring.
        retryCount: this.options.retryCount || 10,

        // the time in ms between attempts
        retryDelay: 200, // time in ms

        // the max time in ms randomly added to retries
        // to improve performance under high contention
        // see https://www.awsarchitectureblog.com/2015/03/backoff.html
        retryJitter: 200, // time in ms

        // The minimum remaining time on a lock before an extension is automatically
        // attempted with the `using` API.
        automaticExtensionThreshold: 500, // time in ms
      }
    );
  }

  // 获取单例实例的静态方法
  public static getInstance(options?: RedLockOptions): RedLocker {
    if (!RedLocker.instance) {
      RedLocker.instance = new RedLocker(options);
    }

    return RedLocker.instance;
  }

  /**
   * @description: This method acquires a locks on the resources for the duration specified by
     * the `duration`.
   * @param {string} resources
   * @param {number} duration
   * @param {Partial} settings
   * @return {*}
   */
  acquire(resources: string[], duration: number, settings?: Partial<Settings>): Promise<Lock> {
    return RedLocker.instance.acquire(resources, duration, settings);
  }

  /**
     * This method unlocks the provided lock from all servers still persisting it.
     * It will fail with an error if it is unable to release the lock on a quorum
     * of nodes, but will make no attempt to restore the lock in the case of a
     * failure to release. It is safe to re-attempt a release or to ignore the
     * error, as the lock will automatically expire after its timeout.
     */
  release(lock: Lock, settings?: Partial<Settings>): Promise<ExecutionResult> {
    return RedLocker.instance.release(lock, settings);
  }
  /**
   * This method extends a valid lock by the provided `duration`.
   */
  extend(existing: Lock, duration: number, settings?: Partial<Settings>): Promise<Lock> {
    return RedLocker.instance.extend(existing, duration, settings);
  }
  /**
     * Wrap and execute a routine in the context of an auto-extending lock,
     * returning a promise of the routine's value. In the case that auto-extension
     * fails, an AbortSignal will be updated to indicate that abortion of the
     * routine is in order, and to pass along the encountered error.
     *
     * @example
     * ```ts
     * await redlock.using([senderId, recipientId], 5000, { retryCount: 5 }, async (signal) => {
     *   const senderBalance = await getBalance(senderId);
     *   const recipientBalance = await getBalance(recipientId);
     *
     *   if (senderBalance < amountToSend) {
     *     throw new Error("Insufficient balance.");
     *   }
     *
     *   // The abort signal will be true if:
     *   // 1. the above took long enough that the lock needed to be extended
     *   // 2. redlock was unable to extend the lock
     *   //
     *   // In such a case, exclusivity can no longer be guaranteed for further
     *   // operations, and should be handled as an exceptional case.
     *   if (signal.aborted) {
     *     throw signal.error;
     *   }
     *
     *   await setBalances([
     *     {id: senderId, balance: senderBalance - amountToSend},
     *     {id: recipientId, balance: recipientBalance + amountToSend},
     *   ]);
     * });
     * ```
     */
  using<T>(resources: string[], duration: number, settings: Partial<Settings>,
    routine?: (signal: RedlockAbortSignal, context: RedlockUsingContext) => Promise<T>): Promise<T> {
    return RedLocker.instance.using(resources, duration, settings, routine);
  }

}