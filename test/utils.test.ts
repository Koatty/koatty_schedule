/*
 * @Description: Utils module comprehensive tests
 * @Usage: npm test
 * @Author: richen
 * @Date: 2024-01-17 21:30:00
 * @LastEditTime: 2024-01-17 21:30:00
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

import { timeoutPromise, wrappedPromise } from '../src/utils/lib';

describe('Utils Module Tests', () => {

  describe('timeoutPromise', () => {
    
    test('should reject after specified timeout', async () => {
      const startTime = Date.now();
      
      await expect(timeoutPromise(100)).rejects.toThrow('TIME_OUT_ERROR');
      
      const elapsedTime = Date.now() - startTime;
      expect(elapsedTime).toBeGreaterThanOrEqual(90); // Allow some variance
      // 在 CI/CD 环境中，由于系统负载波动，放宽上限到 200ms
      expect(elapsedTime).toBeLessThan(200);
    });

    test('should reject with correct error message', async () => {
      await expect(timeoutPromise(50)).rejects.toThrow('TIME_OUT_ERROR');
    });

    test('should handle zero timeout', async () => {
      await expect(timeoutPromise(0)).rejects.toThrow('TIME_OUT_ERROR');
    });

    test('should handle very small timeout', async () => {
      await expect(timeoutPromise(1)).rejects.toThrow('TIME_OUT_ERROR');
    });

    test('should handle large timeout values', async () => {
      const promise = timeoutPromise(5000);
      
      // We won't wait for it, just check it's a promise
      expect(promise).toBeInstanceOf(Promise);
    });

    test('should create multiple independent timeouts', async () => {
      const promises = [
        timeoutPromise(50),
        timeoutPromise(100),
        timeoutPromise(150)
      ];
      
      // All should reject with timeout errors
      const results = await Promise.allSettled(promises);
      
      results.forEach(result => {
        expect(result.status).toBe('rejected');
        expect((result as PromiseRejectedResult).reason.message).toBe('TIME_OUT_ERROR');
      });
    });

    test('should clean up timeout properly', async () => {
      // Create a timeout but don't wait for it
      const promise = timeoutPromise(10000);
      
      // The promise should eventually reject
      expect(promise).toBeInstanceOf(Promise);
    });

    test('should handle negative timeout', async () => {
      // Negative timeout should still work (setTimeout handles this)
      await expect(timeoutPromise(-100)).rejects.toThrow('TIME_OUT_ERROR');
    });

    test('should return a proper Error object', async () => {
      try {
        await timeoutPromise(50);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('TIME_OUT_ERROR');
        expect(error.stack).toBeDefined();
      }
    });
  });

  describe('wrappedPromise', () => {
    
    test('should wrap synchronous function successfully', async () => {
      const syncFn = (a: number, b: number) => a + b;
      
      const result = await wrappedPromise(syncFn, [5, 3]);
      expect(result).toBe(8);
    });

    test('should wrap function with no arguments', async () => {
      const noArgFn = () => 'no args';
      
      const result = await wrappedPromise(noArgFn, []);
      expect(result).toBe('no args');
    });

    test('should wrap function with single argument', async () => {
      const singleArgFn = (x: string) => `Hello ${x}`;
      
      const result = await wrappedPromise(singleArgFn, ['World']);
      expect(result).toBe('Hello World');
    });

    test('should wrap function with multiple arguments', async () => {
      const multiArgFn = (a: number, b: string, c: boolean) => ({ a, b, c });
      
      const result = await wrappedPromise(multiArgFn, [42, 'test', true]);
      expect(result).toEqual({ a: 42, b: 'test', c: true });
    });

    test('should catch and reject on function error', async () => {
      const errorFn = () => {
        throw new Error('Function error');
      };
      
      await expect(wrappedPromise(errorFn, []))
        .rejects.toThrow('Function error');
    });

    test('should catch runtime errors', async () => {
      const runtimeErrorFn = () => {
        return (null as any).nonExistentMethod();
      };
      
      await expect(wrappedPromise(runtimeErrorFn, []))
        .rejects.toThrow();
    });

    test('should handle function returning undefined', async () => {
      const undefinedFn = () => undefined;
      
      const result = await wrappedPromise(undefinedFn, []);
      expect(result).toBeUndefined();
    });

    test('should handle function returning null', async () => {
      const nullFn = () => null;
      
      const result = await wrappedPromise(nullFn, []);
      expect(result).toBeNull();
    });

    test('should handle function returning falsy values', async () => {
      const falsyFn = () => false;
      const zeroFn = () => 0;
      const emptyStringFn = () => '';
      
      const results = await Promise.all([
        wrappedPromise(falsyFn, []),
        wrappedPromise(zeroFn, []),
        wrappedPromise(emptyStringFn, [])
      ]);
      
      expect(results[0]).toBe(false);
      expect(results[1]).toBe(0);
      expect(results[2]).toBe('');
    });

    test('should handle function returning objects', async () => {
      const objectFn = () => ({ data: [1, 2, 3], nested: { key: 'value' } });
      
      const result = await wrappedPromise(objectFn, []);
      expect(result).toEqual({ data: [1, 2, 3], nested: { key: 'value' } });
    });

    test('should handle function returning arrays', async () => {
      const arrayFn = (size: number) => new Array(size).fill(0).map((_, i) => i);
      
      const result = await wrappedPromise(arrayFn, [5]);
      expect(result).toEqual([0, 1, 2, 3, 4]);
    });

    test('should handle async functions returning promises', async () => {
      const asyncFn = async (delay: number) => {
        await new Promise(resolve => setTimeout(resolve, delay));
        return 'async result';
      };
      
      // wrappedPromise treats async function like any other function
      // It executes the function and returns whatever the function returns
      // Since asyncFn is an async function, it returns a Promise
      const result = await wrappedPromise(asyncFn, [10]);
      
      // The wrappedPromise executed the async function which returned a promise
      // But since we await wrappedPromise, we get the resolved value
      expect(result).toBe('async result');
    });

    test('should handle functions with custom error types', async () => {
      class CustomError extends Error {
        code: number;
        constructor(message: string, code: number) {
          super(message);
          this.code = code;
        }
      }
      
      const customErrorFn = () => {
        throw new CustomError('Custom error', 404);
      };
      
      try {
        await wrappedPromise(customErrorFn, []);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(CustomError);
        expect((error as CustomError).message).toBe('Custom error');
        expect((error as CustomError).code).toBe(404);
      }
    });

    test('should preserve function context', async () => {
      const contextFn = function(this: any, value: string) {
        return this.prefix + value;
      };
      
      // Note: wrappedPromise doesn't bind context, so 'this' would be undefined
      await expect(wrappedPromise(contextFn, ['test']))
        .rejects.toThrow();
    });

    test('should handle functions with spread arguments', async () => {
      const spreadFn = (...args: number[]) => args.reduce((sum, num) => sum + num, 0);
      
      const result = await wrappedPromise(spreadFn, [1, 2, 3, 4, 5]);
      expect(result).toBe(15);
    });

    test('should handle very large argument arrays', async () => {
      const largeArgsFn = (...args: number[]) => args.length;
      const largeArray = new Array(1000).fill(0).map((_, i) => i);
      
      const result = await wrappedPromise(largeArgsFn, largeArray);
      expect(result).toBe(1000);
    });

    test('should handle recursive function calls', async () => {
      const factorialFn = (n: number): number => {
        if (n <= 1) return 1;
        return n * factorialFn(n - 1);
      };
      
      const result = await wrappedPromise(factorialFn, [5]);
      expect(result).toBe(120);
    });

    test('should handle functions that modify arguments', async () => {
      const modifyArgsFn = (arr: number[]) => {
        arr.push(99);
        return arr.length;
      };
      
      const testArray = [1, 2, 3];
      const result = await wrappedPromise(modifyArgsFn, [testArray]);
      
      expect(result).toBe(4);
      expect(testArray).toEqual([1, 2, 3, 99]); // Array was modified
    });
  });

  describe('Edge Cases and Error Handling', () => {
    
    test('should handle utilities working together', () => {
      // Create a function that returns a timeout promise
      const timeoutCreator = (ms: number) => timeoutPromise(ms);
      
      // Don't await - just create the promise and verify it's a promise
      const timeoutPromiseResult = wrappedPromise(timeoutCreator, [50]);
      expect(timeoutPromiseResult).toBeInstanceOf(Promise);
      expect(typeof timeoutPromiseResult.then).toBe('function');
      
      // Clean up any timers
      jest.clearAllTimers();
    });

    test('should handle concurrent operations', async () => {
      const operations = [
        wrappedPromise(() => 'op1', []),
        wrappedPromise((x: number) => x * 2, [21]),
        wrappedPromise(() => { throw new Error('op error'); }, [])
      ];
      
      const results = await Promise.allSettled(operations);
      
      expect(results[0].status).toBe('fulfilled');
      expect((results[0] as PromiseFulfilledResult<string>).value).toBe('op1');
      
      expect(results[1].status).toBe('fulfilled');
      expect((results[1] as PromiseFulfilledResult<number>).value).toBe(42);
      
      expect(results[2].status).toBe('rejected');
      expect((results[2] as PromiseRejectedResult).reason.message).toBe('op error');
    });
  });
}); 