/*
 * @Description: Decorator preprocessing mechanism for koatty_schedule
 * @Usage: 
 * @Author: richen
 * @Date: 2024-01-17 16:00:00
 * @LastEditTime: 2024-01-17 16:00:00
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

import { DefaultLogger as logger } from "koatty_logger";
import { IOCContainer } from "koatty_container";
import { RedLockOptions } from "../locker/redlock";
import { redLockerDescriptor } from "../process/schedule";

/**
 * Decorator types supported by the system
 */
export enum DecoratorType {
  SCHEDULED = 'SCHEDULED',
  REDLOCK = 'REDLOCK'
}

/**
 * Decorator metadata interface
 */
export interface DecoratorMetadata {
  type: DecoratorType;
  config: ScheduledConfig | RedLockConfig;
  applied: boolean;
  priority: number;
}

/**
 * Scheduled decorator configuration
 */
export interface ScheduledConfig {
  cron: string;
  timezone?: string;
}

/**
 * RedLock decorator configuration  
 */
export interface RedLockConfig {
  name?: string;
  options?: RedLockOptions;
}

/**
 * Method wrapper information
 */
interface MethodWrapper {
  originalMethod: Function;
  wrappedMethod: Function;
  decorators: Map<DecoratorType, DecoratorMetadata>;
  isWrapped: boolean;
}

/**
 * Decorator manager for preprocessing and performance optimization
 * Integrated with koatty IOC container
 */
export class DecoratorManager {
  // Use WeakMap to avoid memory leaks and keep metadata private
  private methodRegistry = new WeakMap<Function, MethodWrapper>();
  
  // Cache for compiled wrapper functions
  private wrapperCache = new Map<string, Function>();
  
  // Symbols for marking decorated methods
  private static readonly DECORATED_SYMBOL = Symbol('koatty_schedule_decorated');
  private static readonly METADATA_SYMBOL = Symbol('koatty_schedule_metadata');

  constructor() {
    // Register this instance in IOC container
    this.registerInContainer();
  }

  /**
   * Register DecoratorManager in IOC container
   * @private
   */
  private registerInContainer(): void {
    try {
      // Register as a singleton component in IOC container
      IOCContainer.reg('DecoratorManager', this, {
        type: 'COMPONENT',
        args: []
      });
      logger.Debug('DecoratorManager registered in IOC container');
    } catch (_error) {
      logger.Warn('Failed to register DecoratorManager in IOC container:', _error);
    }
  }

  /**
   * Get DecoratorManager instance from IOC container
   * @static
   * @returns DecoratorManager instance
   */
  public static getInstance(): DecoratorManager {
    try {
      // Try to get from IOC container first
      let instance = IOCContainer.get('DecoratorManager', 'COMPONENT') as DecoratorManager;
      if (!instance) {
        // Create new instance if not found in container
        instance = new DecoratorManager();
      }
      return instance;
    } catch (error) {
      logger.Debug('Creating new DecoratorManager instance outside IOC container');
      return new DecoratorManager();
    }
  }

  /**
   * Register a decorator for a method
   * @param target - Target object
   * @param propertyKey - Method name
   * @param decorator - Decorator metadata
   * @param originalDescriptor - Original property descriptor
   * @returns Enhanced property descriptor
   */
  registerDecorator(
    target: unknown,
    propertyKey: string,
    decorator: DecoratorMetadata,
    originalDescriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = originalDescriptor.value;
    
    if (typeof originalMethod !== 'function') {
      throw new Error(`Cannot decorate non-function property: ${propertyKey}`);
    }

    // Check if method is already wrapped
    let wrapper = this.methodRegistry.get(originalMethod);
    if (!wrapper) {
      wrapper = {
        originalMethod,
        wrappedMethod: originalMethod,
        decorators: new Map(),
        isWrapped: false
      };
      this.methodRegistry.set(originalMethod, wrapper);
    }

    // Check if this decorator type is already applied
    if (wrapper.decorators.has(decorator.type)) {
      logger.Warn(`Decorator ${decorator.type} is already applied to ${propertyKey}, skipping duplicate`);
      return originalDescriptor;
    }

    // Register the decorator
    wrapper.decorators.set(decorator.type, decorator);

    // Create or update the wrapped method
    const wrappedMethod = this.createOptimizedWrapper(wrapper, target, propertyKey);
    wrapper.wrappedMethod = wrappedMethod;
    wrapper.isWrapped = true;

    // Mark the original method as decorated
    this.markAsDecorated(originalMethod, wrapper.decorators);

    return {
      ...originalDescriptor,
      value: wrappedMethod
    };
  }

  /**
   * Create an optimized wrapper function that combines all decorators
   * @param wrapper - Method wrapper information
   * @param target - Target object
   * @param propertyKey - Method name
   * @returns Optimized wrapper function
   */
  private createOptimizedWrapper(wrapper: MethodWrapper, target: unknown, propertyKey: string): Function {
    const decorators = Array.from(wrapper.decorators.values());
    
    // Sort decorators by priority (higher priority executes first)
    decorators.sort((a, b) => b.priority - a.priority);

    // Generate cache key for this combination of decorators
    const cacheKey = this.generateCacheKey(decorators, propertyKey);
    
    // Check if we have a cached wrapper for this combination
          const cachedWrapper = this.wrapperCache.get(cacheKey);
      if (cachedWrapper) {
      logger.Debug(`Using cached wrapper for ${propertyKey}`);
      return cachedWrapper.bind(target);
    }

    // Create new optimized wrapper
    const optimizedWrapper = this.compileWrapper(wrapper.originalMethod, decorators, propertyKey, wrapper);
    
    // Cache the wrapper for future use
    this.wrapperCache.set(cacheKey, optimizedWrapper);
    
    logger.Debug(`Created optimized wrapper for ${propertyKey} with decorators: ${decorators.map(d => d.type).join(', ')}`);
    
    return optimizedWrapper;
  }

  /**
   * Compile a single wrapper function that handles all decorators efficiently
   * @param originalMethod - Original method
   * @param decorators - Applied decorators
   * @param methodName - Method name for debugging
   * @param wrapper - Method wrapper information
   * @returns Compiled wrapper function
   */
  private compileWrapper(originalMethod: Function, decorators: DecoratorMetadata[], methodName: string, wrapper: MethodWrapper): Function {
    const hasScheduled = decorators.some(d => d.type === DecoratorType.SCHEDULED);
    const hasRedLock = decorators.some(d => d.type === DecoratorType.REDLOCK);

    if (hasRedLock && hasScheduled) {
      // Combined wrapper for both scheduled and redlock
      return this.createCombinedWrapper(originalMethod, decorators, methodName, wrapper);
    } else if (hasRedLock) {
      // RedLock only wrapper using redLockerDescriptor
      return this.createRedLockWrapper(originalMethod, decorators.find(d => d.type === DecoratorType.REDLOCK)!, methodName, wrapper);
    } else if (hasScheduled) {
      // Scheduled only wrapper (no wrapping needed at runtime, handled at registration)
      return originalMethod;
    }

    return originalMethod;
  }

  /**
   * Create a combined wrapper for methods with both @Scheduled and @RedLock
   * @param originalMethod - Original method
   * @param decorators - Applied decorators
   * @param methodName - Method name
   * @param wrapper - Method wrapper information
   * @returns Combined wrapper function
   */
  private createCombinedWrapper(originalMethod: Function, decorators: DecoratorMetadata[], methodName: string, _wrapper: MethodWrapper): Function {
    const redlockDecorator = decorators.find(d => d.type === DecoratorType.REDLOCK);
    if (!redlockDecorator) {
      return originalMethod;
    }

    const config = redlockDecorator.config as RedLockConfig;
    
    // Use redLockerDescriptor for the combined wrapper as well
    const originalDescriptor: PropertyDescriptor = {
      value: originalMethod,
      writable: true,
      enumerable: false,
      configurable: true
    };

    const lockName = config.name || `combined_${methodName}`;
    const enhancedDescriptor = redLockerDescriptor(originalDescriptor, lockName, methodName, config.options);
    
    return enhancedDescriptor.value!;
  }

  /**
   * Create a RedLock-only wrapper using the complete redLockerDescriptor
   * @param originalMethod - Original method
   * @param decorator - RedLock decorator metadata
   * @param methodName - Method name
   * @param wrapper - Method wrapper information
   * @returns RedLock wrapper function
   */
  private createRedLockWrapper(originalMethod: Function, decorator: DecoratorMetadata, methodName: string, _wrapper: MethodWrapper): Function {
    const config = decorator.config as RedLockConfig;
    
    // Create property descriptor for redLockerDescriptor
    const originalDescriptor: PropertyDescriptor = {
      value: originalMethod,
      writable: true,
      enumerable: false,
      configurable: true
    };

    const lockName = config.name || `redlock_${methodName}`;
    
    // Use the complete redLockerDescriptor function
    const enhancedDescriptor = redLockerDescriptor(originalDescriptor, lockName, methodName, config.options);
    
    return enhancedDescriptor.value!;
  }

  /**
   * Generate cache key for decorator combination
   * @param decorators - Applied decorators
   * @param methodName - Method name
   * @returns Cache key
   */
  private generateCacheKey(decorators: DecoratorMetadata[], methodName: string): string {
    const decoratorKeys = decorators
      .map(d => `${d.type}:${JSON.stringify(d.config)}`)
      .sort()
      .join('|');
    
    return `${methodName}:${decoratorKeys}`;
  }

  /**
   * Mark a method as decorated to prevent duplicate processing
   * @param method - Method to mark
   * @param decorators - Applied decorators
   */
  private markAsDecorated(method: Function, decorators: Map<DecoratorType, DecoratorMetadata>): void {
    // Check if already marked, if not, mark it
    if (!Object.prototype.hasOwnProperty.call(method, DecoratorManager.DECORATED_SYMBOL)) {
      Object.defineProperty(method, DecoratorManager.DECORATED_SYMBOL, {
        value: true,
        writable: false,
        enumerable: false,
        configurable: true // Allow updates for multiple decorators
      });
    }

    // Always update metadata as new decorators are added
    Object.defineProperty(method, DecoratorManager.METADATA_SYMBOL, {
      value: decorators,
      writable: false,
      enumerable: false,
      configurable: true // Allow updates for multiple decorators
    });
  }

  /**
   * Check if a method is already decorated
   * @param method - Method to check
   * @returns true if decorated, false otherwise
   */
  isDecorated(method: Function): boolean {
    return !!(method as any)[DecoratorManager.DECORATED_SYMBOL];
  }

  /**
   * Get decorator metadata for a method
   * @param method - Method to check
   * @returns Decorator metadata map
   */
  getDecoratorMetadata(method: Function): Map<DecoratorType, DecoratorMetadata> | null {
    return (method as any)[DecoratorManager.METADATA_SYMBOL] || null;
  }

  /**
   * Clear all cached wrappers (useful for testing or hot reloading)
   */
  clearCache(): void {
    this.wrapperCache.clear();
    logger.Debug('Decorator wrapper cache cleared');
  }

  /**
   * Get cache statistics
   * @returns Cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.wrapperCache.size,
      keys: Array.from(this.wrapperCache.keys())
    };
  }

  /**
   * Get container registration status
   * @returns Registration information
   */
  getContainerInfo(): { registered: boolean; identifier: string } {
    try {
      const instance = IOCContainer.get('DecoratorManager', 'COMPONENT');
      return {
        registered: !!instance,
        identifier: 'DecoratorManager'
      };
    } catch {
      return {
        registered: false,
        identifier: 'DecoratorManager'
      };
    }
  }
} 