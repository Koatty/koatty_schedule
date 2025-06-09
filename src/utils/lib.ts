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
 * 返回一个 Promise，在指定时间后 reject
 * @param ms 
 * @returns 
 */
export function timeoutPromise(ms: number) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      clearTimeout(timeoutId);
      reject(new Error('TIME_OUT_ERROR'));
    }, ms);
  });
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
