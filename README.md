# koatty_schedule

Powerful scheduled tasks and distributed locking solution for Koatty framework.

[![npm version](https://img.shields.io/npm/v/koatty_schedule.svg)](https://www.npmjs.com/package/koatty_schedule)
[![Build Status](https://img.shields.io/github/workflow/status/koattyjs/koatty_schedule/CI)](https://github.com/koattyjs/koatty_schedule)
[![License](https://img.shields.io/npm/l/koatty_schedule.svg)](https://github.com/koattyjs/koatty_schedule/blob/main/LICENSE)

## Features

- 🕒 **Flexible Scheduling**: Support for cron expressions with timezone configuration
- 🔐 **Distributed Locking**: RedLock-based distributed locks with auto-extension
- 🏗️ **Plugin Architecture**: Native Koatty plugin integration 
- ⚡ **Performance Optimized**: Singleton pattern, caching, and batch processing
- 🛡️ **Enhanced Safety**: Lock renewal logic with timeout protection
- 🌍 **Timezone Smart**: Three-tier priority system for timezone configuration
- 📊 **Health Monitoring**: Built-in health checks and detailed status reporting
- 🔧 **Easy Configuration**: Method-level and global configuration options
- 🚀 **Smart Initialization**: Unified initialization timing for optimal dependency resolution

## Installation

```bash
npm install koatty_schedule
```

## Quick Start

### 1. Generate Plugin Template

Use Koatty CLI to generate the plugin template:

```bash
kt plugin Scheduled
```

Create `src/plugin/Scheduled.ts`:

```typescript
import { Plugin, IPlugin, App } from "koatty";
import { KoattyScheduled } from "koatty_schedule";

@Plugin()
export class Scheduled implements IPlugin {
  run(options: any, app: App) {
    return KoattyScheduled(options, app);
  }
}
```

### 2. Configure Plugin

Update `src/config/plugin.ts`:

```typescript
export default {
  list: ["Scheduled"], // Plugin loading order
  config: {
    Scheduled: {
      timezone: "Asia/Shanghai",
      lockTimeOut: 10000,
      maxRetries: 3,
      retryDelayMs: 200,
      redisConfig: {
        host: "127.0.0.1",
        port: 6379,
        db: 0,
        keyPrefix: "koatty:schedule:"
      }
    }
  }
};
```

## Usage

### Basic Scheduling

```typescript
import { Scheduled, RedLock } from "koatty_schedule";

export class TaskService {
  
  @Scheduled("0 */5 * * * *") // Every 5 minutes
  async processData() {
    console.log("Processing data...");
    // Your business logic here
  }

  @Scheduled("0 0 2 * * *", "UTC") // 2 AM UTC daily
  async dailyCleanup() {
    console.log("Running daily cleanup...");
  }
}
```

### Distributed Locking

```typescript
export class CriticalTaskService {
  
  @Scheduled("0 */10 * * * *")
  @RedLock("critical-task") // Prevents concurrent execution
  async criticalTask() {
    console.log("Running critical task with lock protection...");
    // Only one instance can execute this at a time
  }

  @RedLock("user-sync", { 
    lockTimeOut: 30000,    // 30 seconds
    maxRetries: 5,         // Retry 5 times
    retryDelayMs: 500      // Wait 500ms between retries
  })
  async syncUsers() {
    console.log("Syncing users with lock protection...");
  }
}
```

## Advanced Configuration

### Global Plugin Configuration

Configure global settings in `src/config/plugin.ts`:

```typescript
export default {
  list: ["Scheduled"],
  config: {
    Scheduled: {
      // Global timezone (can be overridden per method)
      timezone: "Asia/Shanghai",
      
      // Default RedLock settings
      lockTimeOut: 15000,
      maxRetries: 3,
      retryDelayMs: 200,
      clockDriftFactor: 0.01,
      
      // Redis configuration for distributed locks
      redisConfig: {
        host: "redis.example.com",
        port: 6379,
        password: "your-password",
        db: 1,
        keyPrefix: "myapp:locks:",
        connectTimeout: 5000,
        commandTimeout: 10000
      }
    }
  }
};
```

### Method-Level Overrides

```typescript
export class AdvancedTaskService {
  
  // Custom timezone override
  @Scheduled('0 0 8 * * 1-5', 'America/New_York') // 8 AM EST, weekdays only
  async businessHoursTask() {
    console.log("Running during business hours...");
  }

  // Extended lock configuration for long-running tasks
  @Scheduled('0 0 3 * * *')
  @RedLock('heavy-processing', {
    lockTimeOut: 300000,    // 5 minutes
    maxRetries: 1,          // Don't retry if another instance is running
    retryDelayMs: 1000
  })
  async heavyProcessing() {
    console.log("Running heavy processing task...");
    // Long-running task with extended timeout
  }

  // Custom lock name with timestamp
  @RedLock() // Auto-generates unique lock name
  async dynamicTask() {
    console.log("Running with auto-generated lock name...");
  }
}
```

## Configuration Priority System

The library uses a three-tier priority system for configuration:

1. **Method-level** (highest priority)
2. **Global plugin config** 
3. **Built-in defaults** (lowest priority)

### Timezone Resolution

```typescript
// Priority: Method > Global > Default ('Asia/Beijing')

@Scheduled('0 0 12 * * *', 'UTC')  // Uses UTC (method-level)
async task1() { ... }

@Scheduled('0 0 12 * * *')  // Uses global timezone from plugin config
async task2() { ... }
```

### RedLock Options Resolution

```typescript
// Global config in plugin.ts
Scheduled: {
  lockTimeOut: 10000,
  maxRetries: 3
}

// Method-level override
@RedLock('my-lock', { 
  lockTimeOut: 20000  // Overrides global, keeps maxRetries: 3
})
async task() { ... }
```

## Monitoring and Health Checks

### Health Status Check

```typescript
import { RedLocker } from "koatty_schedule";

export class MonitoringService {
  
  @Scheduled('*/30 * * * * *') // Every 30 seconds
  async checkSystemHealth() {
    const redLocker = RedLocker.getInstance();
    const health = await redLocker.healthCheck();
    
    console.log('RedLock Status:', health.status);
    console.log('Connection Details:', health.details);
    
    if (health.status === 'unhealthy') {
      // Send alert or take corrective action
      console.error('RedLock is unhealthy!', health.details);
    }
  }
}
```

### Performance Monitoring

```typescript
export class PerformanceService {
  
  @Scheduled('0 */15 * * * *')
  async monitorPerformance() {
    const redLocker = RedLocker.getInstance();
    const config = redLocker.getConfig();
    
    console.log('Current RedLock Configuration:', {
      lockTimeOut: config.lockTimeOut,
      retryCount: config.retryCount,
      retryDelay: config.retryDelay
    });
  }
}
```

## Error Handling and Best Practices

### Robust Error Handling

```typescript
export class RobustTaskService {
  
  @Scheduled('0 */5 * * * *')
  @RedLock('robust-task', { maxRetries: 2 })
  async robustTask() {
    try {
      // Your business logic
      await this.processData();
    } catch (error) {
      // Handle business logic errors
      console.error('Task failed:', error);
      
      // Don't re-throw unless you want to stop the schedule
      // The scheduler will continue with the next execution
    }
  }

  private async processData() {
    // Simulate work that might fail
    if (Math.random() < 0.1) {
      throw new Error('Random processing error');
    }
    console.log('Data processed successfully');
  }
}
```

### Lock Extension for Long Tasks

```typescript
export class LongRunningTaskService {
  
  @Scheduled('0 0 1 * * *') // Daily at 1 AM
  @RedLock('daily-backup', { 
    lockTimeOut: 60000,  // 1 minute initial lock
    maxRetries: 1        // Don't wait if another instance is running
  })
  async dailyBackup() {
    console.log('Starting daily backup...');
    
    // The lock will automatically extend up to 3 times (configurable)
    // if the task takes longer than the initial timeout
    await this.performLongBackup(); // May take several minutes
    
    console.log('Daily backup completed');
  }

  private async performLongBackup() {
    // Simulate long-running backup process
    await new Promise(resolve => setTimeout(resolve, 150000)); // 2.5 minutes
  }
}
```

## Cron Expression Examples

```typescript
export class CronExamplesService {
  
  @Scheduled('0 0 * * * *')    // Every hour
  async hourlyTask() { }

  @Scheduled('0 */30 * * * *')  // Every 30 minutes
  async halfHourlyTask() { }

  @Scheduled('0 0 9 * * 1-5')   // 9 AM, Monday to Friday
  async weekdayMorningTask() { }

  @Scheduled('0 0 0 1 * *')     // First day of every month
  async monthlyTask() { }

  @Scheduled('0 0 0 * * 0')     // Every Sunday
  async weeklyTask() { }

  @Scheduled('*/10 * * * * *')  // Every 10 seconds
  async frequentTask() { }
}
```

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**
   ```typescript
   // Check your CacheStore configuration
   "CacheStore": {
     type: "redis",  // Must be "redis" for distributed locking
     host: '127.0.0.1',
     port: 6379,
     // ... other settings
   }
   ```

2. **Lock Acquisition Timeout**
   ```typescript
   // Increase timeout or reduce retries
   @RedLock('my-lock', { 
     lockTimeOut: 30000,  // Increase timeout
     maxRetries: 1        // Reduce retries to fail fast
   })
   ```

3. **Timezone Issues**
   ```typescript
   // Always specify timezone explicitly for critical tasks
   @Scheduled('0 0 9 * * *', 'America/New_York')
   async criticalMorningTask() { }
   ```

### Debug Mode

Enable debug logging by setting environment variable:

```bash
DEBUG=koatty_schedule* npm start
```

## API Reference

### Decorators

#### `@Scheduled(cron: string, timezone?: string)`
- `cron`: Cron expression (6-part format with seconds)
- `timezone`: Optional timezone override (defaults to 'Asia/Beijing')
- **Processing**: Records metadata in IOC container, CronJob created at `appReady`

#### `@RedLock(lockName?: string, options?: RedLockMethodOptions)`
- `lockName`: Unique lock identifier (auto-generated if not provided)
- `options`: Method-level lock configuration

### Configuration Types

```typescript
interface ScheduledOptions {
  timezone?: string;
  lockTimeOut?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  clockDriftFactor?: number;
  redisConfig?: RedisConfig;
}

interface RedLockMethodOptions {
  lockTimeOut?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  clockDriftFactor?: number;
}
```

## Version Compatibility

- **Koatty**: >= 2.0.0
- **Node.js**: >= 14.0.0
- **Redis**: >= 3.0.0

## License

[BSD-3-Clause](LICENSE)

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## Support

- 📚 [Documentation](https://koatty.js.org/)
- 🐛 [Issues](https://github.com/koattyjs/koatty_schedule/issues)
- 💬 [Discussions](https://github.com/koattyjs/koatty_schedule/discussions)