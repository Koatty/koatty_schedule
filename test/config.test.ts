/*
 * @Description: Configuration module comprehensive tests
 * @Usage: npm test
 * @Author: richen
 * @Date: 2024-01-17 21:00:00
 * @LastEditTime: 2024-01-17 21:00:00
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

import { 
  ConfigManager, 
  ScheduleConfig, 
  DecoratorType, 
  validateCronExpression, 
  validateRedLockOptions 
} from '../src/config/config';

// Mock dependencies
jest.mock('koatty_container', () => ({
  IOCContainer: {
    getApp: jest.fn(),
    reg: jest.fn()
  }
}));

jest.mock('koatty_logger', () => ({
  DefaultLogger: {
    Info: jest.fn(),
    Debug: jest.fn(),
    Warn: jest.fn(),
    Error: jest.fn()
  }
}));

describe('Configuration Module Tests', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton
    delete (ConfigManager as any).instance;
    
    // Reset environment variables
    delete process.env.KOATTY_SCHEDULE_TIMEZONE;
    delete process.env.REDLOCK_TIMEOUT;
    delete process.env.REDLOCK_RETRY_COUNT;
    delete process.env.REDLOCK_RETRY_DELAY;
    delete process.env.REDLOCK_RETRY_JITTER;
  });

  describe('ConfigManager', () => {
    
    describe('Constructor and Singleton', () => {
      test('should create instance with default configuration', () => {
        const manager = new ConfigManager();
        expect(manager).toBeInstanceOf(ConfigManager);
        
        const config = manager.getConfig();
        expect(config.timezone).toBe('Asia/Beijing');
        expect(config.RedLock?.lockTimeOut).toBe(10000);
        expect(config.RedLock?.retryCount).toBe(3);
      });

      test('should return same instance for singleton', () => {
        const instance1 = ConfigManager.getInstance();
        const instance2 = ConfigManager.getInstance();
        
        expect(instance1).toBe(instance2);
      });

      test('should load configuration on construction', () => {
        const manager = new ConfigManager();
        expect(manager.isLoaded()).toBe(true);
      });
    });

    describe('Environment Configuration Loading', () => {
      test('should load from environment variables only', () => {
        process.env.KOATTY_SCHEDULE_TIMEZONE = 'UTC';
        process.env.REDLOCK_TIMEOUT = '15000';
        process.env.REDLOCK_RETRY_COUNT = '5';
        process.env.REDLOCK_RETRY_DELAY = '300';
        process.env.REDLOCK_RETRY_JITTER = '400';

        const { IOCContainer } = require('koatty_container');
        IOCContainer.getApp.mockReturnValue(null);

        const manager = new ConfigManager();
        const config = manager.getConfig();
        
        expect(config.timezone).toBe('UTC');
        expect(config.RedLock?.lockTimeOut).toBe(15000);
        expect(config.RedLock?.retryCount).toBe(5);
        expect(config.RedLock?.retryDelay).toBe(300);
        expect(config.RedLock?.retryJitter).toBe(400);
      });

      test('should load from app configuration', () => {
        const mockApp = {
          config: jest.fn(() => ({
            timezone: 'Europe/London',
            lockTimeOut: 20000,
            retryCount: 7
          }))
        };

        const { IOCContainer } = require('koatty_container');
        IOCContainer.getApp.mockReturnValue(mockApp);

        const manager = new ConfigManager();
        const config = manager.getConfig();
        
        expect(config.timezone).toBe('Europe/London');
        expect(config.RedLock?.lockTimeOut).toBe(20000);
        expect(config.RedLock?.retryCount).toBe(7);
      });

      test('should handle app config loading error', () => {
        const { IOCContainer } = require('koatty_container');
        IOCContainer.getApp.mockImplementation(() => {
          throw new Error('Container error');
        });

        const manager = new ConfigManager();
        const config = manager.getConfig();
        
        // Should fallback to defaults
        expect(config.timezone).toBe('Asia/Beijing');
        expect(config.RedLock?.lockTimeOut).toBe(10000);
      });

      test('should handle app without config method', () => {
        const mockApp = {};

        const { IOCContainer } = require('koatty_container');
        IOCContainer.getApp.mockReturnValue(mockApp);

        const manager = new ConfigManager();
        const config = manager.getConfig();
        
        expect(config.timezone).toBe('Asia/Beijing');
      });

      test('should prefer app config over environment variables', () => {
        process.env.KOATTY_SCHEDULE_TIMEZONE = 'UTC';
        process.env.REDLOCK_TIMEOUT = '15000';

        const mockApp = {
          config: jest.fn(() => ({
            timezone: 'Asia/Tokyo',
            lockTimeOut: 25000
          }))
        };

        const { IOCContainer } = require('koatty_container');
        IOCContainer.getApp.mockReturnValue(mockApp);

        const manager = new ConfigManager();
        const config = manager.getConfig();
        
        expect(config.timezone).toBe('Asia/Tokyo');
        expect(config.RedLock?.lockTimeOut).toBe(25000);
      });

      test('should handle invalid environment variable numbers', () => {
        process.env.REDLOCK_TIMEOUT = 'invalid';
        process.env.REDLOCK_RETRY_COUNT = 'not-a-number';

        const { IOCContainer } = require('koatty_container');
        IOCContainer.getApp.mockReturnValue(null);

        const manager = new ConfigManager();
        const config = manager.getConfig();
        
        // Should use defaults when environment variables are invalid
        expect(config.RedLock?.lockTimeOut).toBe(10000);
        expect(config.RedLock?.retryCount).toBe(3);
      });
    });

    describe('IOC Container Registration', () => {
      test('should register in IOC container successfully', () => {
        const { IOCContainer } = require('koatty_container');
        
        new ConfigManager();
        
        expect(IOCContainer.reg).toHaveBeenCalledWith(
          'ConfigManager',
          expect.any(ConfigManager),
          {
            type: 'COMPONENT',
            args: []
          }
        );
      });

      test('should handle IOC container registration failure', () => {
        const { IOCContainer } = require('koatty_container');
        IOCContainer.reg.mockImplementation(() => {
          throw new Error('Registration failed');
        });

        expect(() => new ConfigManager()).not.toThrow();
      });

      test('should handle missing IOC container', () => {
        // Simulate missing koatty_container module
        jest.doMock('koatty_container', () => {
          throw new Error('Module not found');
        });

        expect(() => new ConfigManager()).not.toThrow();
      });
    });

    describe('Configuration Management', () => {
      let manager: ConfigManager;

      beforeEach(() => {
        manager = new ConfigManager();
      });

      test('should get current configuration', () => {
        const config = manager.getConfig();
        
        expect(config).toHaveProperty('timezone');
        expect(config).toHaveProperty('RedLock');
        expect(config.RedLock).toHaveProperty('lockTimeOut');
        expect(config.RedLock).toHaveProperty('retryCount');
      });

      test('should merge custom configuration', () => {
        const customConfig: Partial<ScheduleConfig> = {
          timezone: 'Europe/Paris',
          RedLock: {
            lockTimeOut: 30000,
            retryCount: 10
          }
        };

        manager.mergeConfig(customConfig);
        const config = manager.getConfig();
        
        expect(config.timezone).toBe('Europe/Paris');
        expect(config.RedLock?.lockTimeOut).toBe(30000);
        expect(config.RedLock?.retryCount).toBe(10);
        // Should keep other default values
        expect(config.RedLock?.retryDelay).toBe(200);
      });

      test('should merge partial RedLock configuration', () => {
        const customConfig: Partial<ScheduleConfig> = {
          RedLock: {
            lockTimeOut: 50000
          }
        };

        manager.mergeConfig(customConfig);
        const config = manager.getConfig();
        
        expect(config.RedLock?.lockTimeOut).toBe(50000);
        // Should keep other defaults
        expect(config.RedLock?.retryCount).toBe(3);
        expect(config.RedLock?.retryDelay).toBe(200);
      });

      test('should handle empty merge configuration', () => {
        const originalConfig = manager.getConfig();
        
        manager.mergeConfig({});
        const newConfig = manager.getConfig();
        
        expect(newConfig).toEqual(originalConfig);
      });

      test('should reset configuration to defaults', () => {
        // First modify the configuration
        manager.mergeConfig({
          timezone: 'UTC',
          RedLock: { lockTimeOut: 99999 }
        });

        // Then reset
        manager.reset();
        const config = manager.getConfig();
        
        expect(config.timezone).toBe('Asia/Beijing');
        expect(config.RedLock?.lockTimeOut).toBe(10000);
        expect(manager.isLoaded()).toBe(false);
      });

      test('should reload environment configuration after reset', () => {
        manager.reset();
        expect(manager.isLoaded()).toBe(false);
        
        manager.loadEnvironmentConfig();
        expect(manager.isLoaded()).toBe(true);
      });
    });
  });

  describe('Cron Expression Validation', () => {
    
    test('should validate correct 6-part cron expressions', () => {
      const validCronExpressions = [
        '0 0 0 * * *',     // Every day at midnight
        '*/5 * * * * *',   // Every 5 seconds
        '0 */15 * * * *',  // Every 15 minutes
        '0 0 12 * * *',    // Every day at noon
        '0 0 0 1 * *',     // First day of every month
        '0 0 0 * * 1',     // Every Monday
        '30 45 23 * * *'   // Every day at 23:45:30
      ];

      validCronExpressions.forEach(cron => {
        expect(() => validateCronExpression(cron)).not.toThrow();
      });
    });

    test('should validate correct 5-part cron expressions', () => {
      const validCronExpressions = [
        '0 0 * * *',       // Every day at midnight
        '*/15 * * * *',    // Every 15 minutes
        '0 12 * * *',      // Every day at noon
        '0 0 1 * *',       // First day of every month
        '0 0 * * 1'        // Every Monday
      ];

      validCronExpressions.forEach(cron => {
        expect(() => validateCronExpression(cron)).not.toThrow();
      });
    });

    test('should reject invalid cron expressions', () => {
      const invalidCronExpressions = [
        { expr: '', name: 'empty string' },
        { expr: '* * *', name: 'too few parts (3)' },
        { expr: '* * * *', name: 'too few parts (4)' },
        { expr: '* * * * * * *', name: 'too many parts (7)' },
        { expr: 'abc * * * * *', name: 'invalid field format' },
        { expr: '60 * * * * *', name: 'invalid seconds (60)' },
        { expr: '* 60 * * * *', name: 'invalid minutes (60)' },
        { expr: '* * 24 * * *', name: 'invalid hours (24)' },
      ];

      invalidCronExpressions.forEach(({ expr, name }) => {
        try {
          validateCronExpression(expr);
          fail(`Expected "${expr}" (${name}) to throw an error, but it didn't`);
        } catch (error) {
          // Expected - this cron expression should be rejected
          expect(error).toBeInstanceOf(Error);
        }
      });
    });

    test('should validate cron field formats', () => {
      // Valid field formats
      expect(() => validateCronExpression('0-59 * * * * *')).not.toThrow();
      expect(() => validateCronExpression('0,15,30,45 * * * * *')).not.toThrow();
      expect(() => validateCronExpression('*/10 * * * * *')).not.toThrow();
      
      // Invalid field formats (this would depend on the actual regex implementation)
      expect(() => validateCronExpression('abc * * * * *')).toThrow();
    });

    test('should handle non-string input', () => {
      expect(() => validateCronExpression(null as any)).toThrow('Cron expression must be a non-empty string');
      expect(() => validateCronExpression(undefined as any)).toThrow('Cron expression must be a non-empty string');
      expect(() => validateCronExpression(123 as any)).toThrow('Cron expression must be a non-empty string');
    });

    test('should handle whitespace in cron expressions', () => {
      expect(() => validateCronExpression('  0 0 * * *  ')).not.toThrow();
      expect(() => validateCronExpression('0  0  *  *  *')).not.toThrow();
    });
  });

  describe('RedLock Options Validation', () => {
    
    test('should validate correct RedLock options', () => {
      const validOptions = [
        { lockTimeOut: 5000 },
        { retryCount: 3 },
        { retryDelay: 200 },
        { retryJitter: 100 },
        { 
          lockTimeOut: 10000, 
          retryCount: 5, 
          retryDelay: 300,
          retryJitter: 200
        }
      ];

      validOptions.forEach(options => {
        expect(() => validateRedLockOptions(options)).not.toThrow();
      });
    });

    test('should reject invalid lockTimeOut values', () => {
      const invalidOptions = [
        { lockTimeOut: -1 },
        { lockTimeOut: 0 },
        { lockTimeOut: -1000 }
      ];

      invalidOptions.forEach(options => {
        expect(() => validateRedLockOptions(options)).toThrow();
      });
    });

    test('should reject invalid retryCount values', () => {
      const invalidOptions = [
        { retryCount: -1 },
        { retryCount: -5 }
      ];

      invalidOptions.forEach(options => {
        expect(() => validateRedLockOptions(options)).toThrow();
      });
    });

    test('should accept zero retryCount', () => {
      expect(() => validateRedLockOptions({ retryCount: 0 })).not.toThrow();
    });

    test('should handle empty options object', () => {
      expect(() => validateRedLockOptions({})).not.toThrow();
    });

    test('should validate multiple invalid fields', () => {
      const options = {
        lockTimeOut: -1000,
        retryCount: -5
      };

      expect(() => validateRedLockOptions(options)).toThrow();
    });

    test('should handle undefined retryDelay and retryJitter', () => {
      const options = {
        lockTimeOut: 5000,
        retryCount: 3
      };

      expect(() => validateRedLockOptions(options)).not.toThrow();
    });
  });

  describe('Decorator Types', () => {
    test('should have correct decorator type values', () => {
      expect(DecoratorType.SCHEDULED).toBe('SCHEDULED');
      expect(DecoratorType.REDLOCK).toBe('REDLOCK');
    });

    test('should be enumerable', () => {
      const types = Object.values(DecoratorType);
      expect(types).toContain('SCHEDULED');
      expect(types).toContain('REDLOCK');
      expect(types).toHaveLength(2);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle configuration loading with circular references', () => {
      const circularConfig: any = { timezone: 'UTC' };
      circularConfig.self = circularConfig;

      const manager = new ConfigManager();
      
      // This should not crash
      expect(() => manager.mergeConfig(circularConfig)).not.toThrow();
    });

    test('should handle very large timeout values', () => {
      const options = {
        lockTimeOut: Number.MAX_SAFE_INTEGER
      };

      expect(() => validateRedLockOptions(options)).not.toThrow();
    });

    test('should handle non-integer numeric values', () => {
      const options = {
        lockTimeOut: 5000.5,
        retryCount: 3.7
      };

      expect(() => validateRedLockOptions(options)).not.toThrow();
    });

    test('should preserve configuration object immutability', () => {
      const manager = new ConfigManager();
      const config1 = manager.getConfig();
      const config2 = manager.getConfig();
      
      // Modifying one should not affect the other
      config1.timezone = 'Modified';
      expect(config2.timezone).not.toBe('Modified');
    });
  });
}); 