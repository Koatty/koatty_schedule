/**
 * @ author: richen
 * @ copyright: Copyright (c) - <richenlin(at)gmail.com>
 * @ license: MIT
 * @ version: 2020-06-05 09:40:35
 */
interface RedisOptions {
    key_prefix: string;
    host: string;
    port: number;
    password: string;
    db: string;
}
export declare class Locker {
    lockMap: Map<any, any>;
    options: any;
    store: any;
    private static instance;
    client: any;
    /**
     *
     *
     * @static
     * @param {RedisOptions} options
     * @param {boolean} [force=false]
     * @returns
     * @memberof Locker
     */
    static getInstance(options: RedisOptions, force?: boolean): Locker;
    /**
     * Creates an instance of Locker.
     * @param {RedisOptions} options
     * @memberof Locker
     */
    private constructor();
    /**
     *
     *
     * @returns
     * @memberof Locker
     */
    defineCommand(): Promise<any>;
    /**
     * Get a locker.
     *
     * @param {string} key
     * @param {number} [expire=10000]
     * @returns
     * @memberof Locker
     */
    lock(key: string, expire?: number): Promise<boolean>;
    /**
     * Get a locker.
     * Attempts to lock once every interval time, and fails when return time exceeds waitTime
     *
     * @param {string} key
     * @param {number} expire
     * @param {number} [interval=500]
     * @param {number} [waitTime=5000]
     * @returns
     * @memberof Locker
     */
    waitLock(key: string, expire: number, interval?: number, waitTime?: number): Promise<boolean>;
    /**
     * Release lock.
     * Regardless of whether the key exists and the unlock is successful, no error will be thrown (except for network reasons).
     *
     * The specific return value is:
     *
     * null: key does not exist locally
     *
     * 0: key does not exist on redis
     *
     * 1: unlocked successfully
     *
     * -1: value does not correspond and cannot be unlocked
     *
     * @param {*} key
     * @returns
     * @memberof Locker
     */
    unLock(key: string): Promise<boolean>;
}
export {};
