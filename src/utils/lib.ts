/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2024-01-16 19:53:14
 * @LastEditTime: 2024-11-07 16:47:58
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

/**
 * 返回一个可取消的 Promise，在指定时间后 reject
 * @param ms 超时时间（毫秒）
 * @returns 带有 cancel 方法的 Promise
 */
export interface CancelablePromise<T> extends Promise<T> {
  cancel: () => void;
}

export function timeoutPromise(ms: number): CancelablePromise<never> {
  let timeoutId: NodeJS.Timeout | null = null;
  
  const promise = new Promise<never>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      timeoutId = null;
      reject(new Error('TIME_OUT_ERROR'));
    }, ms);
  }) as CancelablePromise<never>;

  // 添加取消方法，防止内存泄漏
  promise.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return promise;
}
/**
 * @description: 使用 Promise.resolve 包装不确定的函数，并捕获错误
 * @param {Function} fn
 * @param {any} args
 * @return {*}
 */
export function wrappedPromise(fn: Function, args: any[]) {
  return new Promise((resolve, reject) => {
    try {
      const result = fn(...args);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}
