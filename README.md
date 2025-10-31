# koatty_schedule

Powerful scheduled tasks and distributed locking solution for Koatty framework.

[![npm version](https://img.shields.io/npm/v/koatty_schedule.svg)](https://www.npmjs.com/package/koatty_schedule)
[![Build Status](https://img.shields.io/github/workflow/status/koattyjs/koatty_schedule/CI)](https://github.com/koattyjs/koatty_schedule)
[![License](https://img.shields.io/npm/l/koatty_schedule.svg)](https://github.com/koattyjs/koatty_schedule/blob/main/LICENSE)

## Features

- 🕒 **Flexible Scheduling**: Support for cron expressions with timezone configuration
- 🔐 **Distributed Locking**: RedLock-based distributed locks with auto-extension
- 🏗️ **Plugin Architecture**: Native Koatty plugin integration 
- ⚡ **Performance Optimized**: Singleton pattern, caching, and memory-leak-free design
- 🛡️ **Enhanced Safety**: Lock renewal logic with timeout protection and automatic cleanup
- 🌍 **Timezone Smart**: Three-tier priority system for timezone configuration
- 📊 **Health Monitoring**: Built-in health checks and detailed status reporting
- 🔧 **Easy Configuration**: Method-level and global configuration options
- 🚀 **Smart Initialization**: Unified initialization timing for optimal dependency resolution
- 🎯 **Advanced Validation**: Comprehensive cron expression validation with bilingual error messages
- 🔌 **Redis Multi-Mode**: Support for Standalone, Sentinel, and Cluster Redis deployments
- 🧩 **Extensible Architecture**: Abstract interfaces for easy customization and extension

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
import { RedisMode } from "koatty_schedule";

export default {
  list: ["Scheduled"], // Plugin loading order
  config: {
    Scheduled: {
      timezone: "Asia/Shanghai",
      lockTimeOut: 10000,
      maxRetries: 3,
      retryDelayMs: 200,
      redisConfig: {
        mode: RedisMode.STANDALONE,  // or SENTINEL, CLUSTER
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

### Redis Deployment Modes

koatty_schedule supports three Redis deployment modes:

#### Standalone Mode (Default)

```typescript
import { RedisMode } from "koatty_schedule";

export default {
  list: ["Scheduled"],
  config: {
    Scheduled: {
      redisConfig: {
        mode: RedisMode.STANDALONE,  // or omit for default
        host: "127.0.0.1",
        port: 6379,
        password: "your-password",
        db: 0,
        keyPrefix: "koatty:schedule:"
      }
    }
  }
};
```

#### Sentinel Mode (High Availability)

```typescript
import { RedisMode } from "koatty_schedule";

export default {
  list: ["Scheduled"],
  config: {
    Scheduled: {
      redisConfig: {
        mode: RedisMode.SENTINEL,
        sentinels: [
          { host: "192.168.1.10", port: 26379 },
          { host: "192.168.1.11", port: 26379 },
          { host: "192.168.1.12", port: 26379 }
        ],
        name: "mymaster",  // Sentinel master name
        password: "your-password",
        sentinelPassword: "sentinel-password",  // Optional
        db: 0,
        keyPrefix: "koatty:schedule:"
      }
    }
  }
};
```

#### Cluster Mode (Horizontal Scaling)

```typescript
import { RedisMode } from "koatty_schedule";

export default {
  list: ["Scheduled"],
  config: {
    Scheduled: {
      redisConfig: {
        mode: RedisMode.CLUSTER,
        nodes: [
          { host: "192.168.1.10", port: 7000 },
          { host: "192.168.1.11", port: 7001 },
          { host: "192.168.1.12", port: 7002 },
          { host: "192.168.1.13", port: 7003 },
          { host: "192.168.1.14", port: 7004 },
          { host: "192.168.1.15", port: 7005 }
        ],
        redisOptions: {
          password: "your-password",
          db: 0
        },
        keyPrefix: "koatty:schedule:"
      }
    }
  }
};
```

### Global Plugin Configuration

Configure global settings in `src/config/plugin.ts`:

```typescript
import { RedisMode } from "koatty_schedule";

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
        mode: RedisMode.STANDALONE,
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

koatty_schedule supports both 5-part and 6-part (with seconds) cron expressions with comprehensive validation:

### Basic Examples

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

### Advanced Examples (NEW in v3.4.0)

```typescript
export class AdvancedCronService {
  
  // Step values - Every 2 hours during business hours
  @Scheduled('0 0 9-17/2 * * 1-5')
  async businessHoursTask() { }

  // List values - Run at 9 AM, 12 PM, and 6 PM
  @Scheduled('0 0 9,12,18 * * *')
  async specificHoursTask() { }

  // Month names - Run on first day of Q1 months
  @Scheduled('0 0 0 1 JAN,FEB,MAR *')
  async quarterlyTask() { }

  // Weekday names - Weekend morning task
  @Scheduled('0 0 10 * * SAT,SUN')
  async weekendTask() { }

  // Complex expression - Every 15 minutes during working hours on weekdays
  @Scheduled('0 */15 9-17 * * MON-FRI')
  async frequentBusinessTask() { }

  // Range with step - Every 3 days
  @Scheduled('0 0 0 */3 * *')
  async everyThreeDaysTask() { }
}
```

### Cron Expression Format

**6-part format (with seconds):**
```
┌────────────── second (0-59)
│ ┌──────────── minute (0-59)
│ │ ┌────────── hour (0-23)
│ │ │ ┌──────── day of month (1-31)
│ │ │ │ ┌────── month (1-12 or JAN-DEC)
│ │ │ │ │ ┌──── day of week (0-7 or SUN-SAT, 0 and 7 are Sunday)
│ │ │ │ │ │
* * * * * *
```

**5-part format (without seconds):**
```
┌──────────── minute (0-59)
│ ┌────────── hour (0-23)
│ │ ┌──────── day of month (1-31)
│ │ │ ┌────── month (1-12 or JAN-DEC)
│ │ │ │ ┌──── day of week (0-7 or SUN-SAT)
│ │ │ │ │
* * * * *
```

### Special Characters

- `*` - Any value
- `,` - Value list separator (e.g., `1,3,5`)
- `-` - Range of values (e.g., `1-5`)
- `/` - Step values (e.g., `*/15` or `0-30/5`)

### Validation Features (NEW)

The enhanced validator will catch common errors:

```typescript
// ❌ Invalid - seconds out of range
@Scheduled('60 0 0 * * *')  // Error: 秒字段的值无效: 60，必须在 0-59 之间

// ❌ Invalid - hours out of range
@Scheduled('0 0 25 * * *')  // Error: 小时字段的值无效: 25，必须在 0-23 之间

// ❌ Invalid - invalid step value
@Scheduled('0 */0 * * * *')  // Error: 分钟字段的步长值无效: 0

// ❌ Invalid - range start > end
@Scheduled('0 0 17-9 * * *')  // Error: 小时字段的范围无效: 17-9

// ✅ Valid - all checks passed
@Scheduled('0 */15 9-17 * * 1-5')  // Every 15 minutes, 9-5, weekdays
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
- `cron`: Cron expression (5 or 6-part format, with comprehensive validation)
- `timezone`: Optional timezone override (defaults to 'Asia/Beijing')
- **Processing**: Records metadata in IOC container, CronJob created at `appReady`
- **Validation**: Full validation of all cron fields with bilingual error messages

#### `@RedLock(lockName?: string, options?: RedLockMethodOptions)`
- `lockName`: Unique lock identifier (auto-generated if not provided)
- `options`: Method-level lock configuration
- **Features**: Automatic lock renewal (up to 3 times), memory-leak-free implementation

### Configuration Types

```typescript
// Scheduled options with Redis mode support
interface ScheduledOptions {
  timezone?: string;
  lockTimeOut?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  clockDriftFactor?: number;
  redisConfig?: RedisConfig;  // Supports Standalone, Sentinel, Cluster
}

// RedLock method-level options
interface RedLockMethodOptions {
  lockTimeOut?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  clockDriftFactor?: number;
}

// Redis configuration (NEW in v3.4.0)
enum RedisMode {
  STANDALONE = 'standalone',
  SENTINEL = 'sentinel',
  CLUSTER = 'cluster'
}

interface RedisStandaloneConfig {
  mode?: RedisMode.STANDALONE;
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

interface RedisSentinelConfig {
  mode: RedisMode.SENTINEL;
  sentinels: Array<{ host: string; port: number }>;
  name: string;  // Master name
  password?: string;
  sentinelPassword?: string;
  db?: number;
  keyPrefix?: string;
}

interface RedisClusterConfig {
  mode: RedisMode.CLUSTER;
  nodes: Array<{ host: string; port: number }>;
  redisOptions?: {
    password?: string;
    db?: number;
  };
  keyPrefix?: string;
}
```

### Exported Interfaces (NEW in v3.4.0)

For advanced customization and extension:

```typescript
import {
  IDistributedLock,     // Abstract distributed lock interface
  IRedisClient,         // Abstract Redis client interface
  RedisFactory,         // Redis client factory
  RedisClientAdapter,   // Redis client adapter
  RedLocker             // RedLock implementation
} from "koatty_schedule";

// Example: Custom health check
const redLocker = RedLocker.getInstance();
const health = await redLocker.healthCheck();
console.log(health.status);  // 'healthy' | 'unhealthy'
console.log(health.details);  // Detailed status information
```

## Version Compatibility

- **Koatty**: >= 2.0.0
- **Node.js**: >= 14.0.0
- **Redis**: >= 3.0.0
- **Redis Sentinel**: >= 3.0.0 (for high availability)
- **Redis Cluster**: >= 3.0.0 (for horizontal scaling)

## What's New in v3.4.0 🎉

### 🐛 Bug Fixes

- **Fixed memory leak** in `timeoutPromise` - timers are now properly cleaned up
- **Improved initialization cleanup** - prevents state inconsistency on retry

### ✨ New Features

- **Redis Multi-Mode Support**: Standalone, Sentinel, and Cluster modes
- **Enhanced Cron Validation**: Complete validation of all fields with bilingual error messages
- **Abstract Interfaces**: `IDistributedLock` and `IRedisClient` for extensibility
- **Redis Factory**: `RedisFactory` for flexible Redis client creation

### 🚀 Improvements

- Memory-leak-free design for long-running applications
- Better error messages with Chinese and English support
- Comprehensive cron expression validation (steps, ranges, lists, month/weekday names)
- Health check now reports Redis mode information

### 📖 Documentation

- Added `UPGRADE_GUIDE.md` with migration instructions
- Added `IMPROVEMENTS_SUMMARY.md` with technical details
- Enhanced README with Redis multi-mode examples

## Migration from v3.3.x

Most code works without changes. To use new features:

```typescript
// Optional: Explicitly set Redis mode (defaults to STANDALONE)
import { RedisMode } from "koatty_schedule";

redisConfig: {
  mode: RedisMode.STANDALONE,  // or SENTINEL, CLUSTER
  // ... rest of config
}
```

See [UPGRADE_GUIDE.md](UPGRADE_GUIDE.md) for details.

## Performance & Stability

- ✅ **Memory Stable**: No leaks in long-running applications
- ✅ **Production Ready**: Used in production environments
- ✅ **Well Tested**: Comprehensive test coverage
- ✅ **High Availability**: Sentinel mode support
- ✅ **Scalable**: Cluster mode for horizontal scaling

## License

[BSD-3-Clause](LICENSE)

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## Support

- 📚 [Documentation](https://koatty.js.org/)
- 🐛 [Issues](https://github.com/koattyjs/koatty_schedule/issues)
- 💬 [Discussions](https://github.com/koattyjs/koatty_schedule/discussions)
- 📖 [Upgrade Guide](UPGRADE_GUIDE.md)
- 📝 [Changelog](CHANGELOG.md)

---

**Maintained with ❤️ by the Koatty Team**