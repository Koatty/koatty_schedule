/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2024-01-16 19:53:14
 * @LastEditTime: 2024-01-17 09:24:45
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

import { IOCContainer } from "koatty_container";

const functionPrototype = Object.getPrototypeOf(Function);
// get property of an object
// https://tc39.github.io/ecma262/#sec-ordinarygetprototypeof
function ordinaryGetPrototypeOf(obj: any): any {
  const proto = Object.getPrototypeOf(obj);
  if (typeof obj !== "function" || obj === functionPrototype) {
    return proto;
  }

  // TypeScript doesn't set __proto__ in ES5, as it's non-standard.
  // Try to determine the superclass constructor. Compatible implementations
  // must either set __proto__ on a subclass constructor to the superclass constructor,
  // or ensure each class has a valid `constructor` property on its prototype that
  // points back to the constructor.

  // If this is not the same as Function.[[Prototype]], then this is definitely inherited.
  // This is the case when in ES6 or when using __proto__ in a compatible browser.
  if (proto !== functionPrototype) {
    return proto;
  }

  // If the super prototype is Object.prototype, null, or undefined, then we cannot determine the heritage.
  const prototype = obj.prototype;
  const prototypeProto = prototype && Object.getPrototypeOf(prototype);
  // tslint:disable-next-line: triple-equals
  if (prototypeProto == undefined || prototypeProto === Object.prototype) {
    return proto;
  }

  // If the constructor was not a function, then we cannot determine the heritage.
  const constructor = prototypeProto.constructor;
  if (typeof constructor !== "function") {
    return proto;
  }

  // If we have some kind of self-reference, then we cannot determine the heritage.
  if (constructor === obj) {
    return proto;
  }

  // we have a pretty good guess at the heritage.
  return constructor;
}
/**
 * get metadata value of a metadata key on the prototype chain of an object and property
 * @param metadataKey metadata key
 * @param target the target of metadataKey
 */
export function recursiveGetMetadata(metadataKey: any, target: any, propertyKey?: string | symbol): any[] {
  // get metadata value of a metadata key on the prototype
  // let metadata = Reflect.getOwnMetadata(metadataKey, target, propertyKey);
  const metadata = IOCContainer.listPropertyData(metadataKey, target) || {};

  // get metadata value of a metadata key on the prototype chain
  let parent = ordinaryGetPrototypeOf(target);
  while (parent !== null) {
    // metadata = Reflect.getOwnMetadata(metadataKey, parent, propertyKey);
    const pMetadata = IOCContainer.listPropertyData(metadataKey, parent);
    if (pMetadata) {
      for (const n in pMetadata) {
        if (!Object.hasOwnProperty.call(metadata, n)) {
          metadata[n] = pMetadata[n];
        }
      }
    }
    parent = ordinaryGetPrototypeOf(parent);
  }
  return metadata;
}


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
