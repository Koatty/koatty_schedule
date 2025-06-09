/**
 * RedLock装饰器验证测试
 * 详细验证方法是否被正确包装
 */

import { RedLock, Scheduled, DecoratorManager } from "../src/index";

class VerificationService {
  
  // 原始方法，未装饰
  async originalMethod() {
    console.log("原始方法执行");
    return "原始方法结果";
  }

  // 只有RedLock装饰的方法
  @RedLock("verification-lock", { lockTimeOut: 3000 })
  async redlockOnlyMethod() {
    console.log("RedLock方法执行");
    return "RedLock方法结果";
  }

  // 只有Scheduled装饰的方法  
  @Scheduled("*/30 * * * * *")
  async scheduledOnlyMethod() {
    console.log("Scheduled方法执行");
    return "Scheduled方法结果";
  }

  // 组合装饰的方法
  @RedLock("combo-lock", { lockTimeOut: 5000 })
  @Scheduled("*/60 * * * * *")
  async combinedDecoratorsMethod() {
    console.log("组合装饰器方法执行");
    return "组合方法结果";
  }
}

function verifyMethodWrapping() {
  const service = new VerificationService();
  
  console.log("=== 方法包装验证 ===");
  
  // 检查原始方法
  console.log(`1. originalMethod:`);
  console.log(`   - 类型: ${typeof service.originalMethod}`);
  console.log(`   - 是否async: ${service.originalMethod.constructor.name === 'AsyncFunction'}`);
  console.log(`   - 函数长度: ${service.originalMethod.length}`);
  console.log(`   - toString片段: ${service.originalMethod.toString().substring(0, 50)}...`);
  
  // 检查RedLock装饰的方法
  console.log(`\n2. redlockOnlyMethod:`);
  console.log(`   - 类型: ${typeof service.redlockOnlyMethod}`);
  console.log(`   - 是否async: ${service.redlockOnlyMethod.constructor.name === 'AsyncFunction'}`);
  console.log(`   - 函数长度: ${service.redlockOnlyMethod.length}`);
  console.log(`   - toString片段: ${service.redlockOnlyMethod.toString().substring(0, 50)}...`);
  
  // 检查Scheduled装饰的方法
  console.log(`\n3. scheduledOnlyMethod:`);
  console.log(`   - 类型: ${typeof service.scheduledOnlyMethod}`);
  console.log(`   - 是否async: ${service.scheduledOnlyMethod.constructor.name === 'AsyncFunction'}`);
  console.log(`   - 函数长度: ${service.scheduledOnlyMethod.length}`);
  console.log(`   - toString片段: ${service.scheduledOnlyMethod.toString().substring(0, 50)}...`);
  
  // 检查组合装饰的方法
  console.log(`\n4. combinedDecoratorsMethod:`);
  console.log(`   - 类型: ${typeof service.combinedDecoratorsMethod}`);
  console.log(`   - 是否async: ${service.combinedDecoratorsMethod.constructor.name === 'AsyncFunction'}`);
  console.log(`   - 函数长度: ${service.combinedDecoratorsMethod.length}`);
  console.log(`   - toString片段: ${service.combinedDecoratorsMethod.toString().substring(0, 50)}...`);

  // 通过DecoratorManager检查装饰器信息
  console.log("\n=== 装饰器元数据验证 ===");
  const decoratorManager = DecoratorManager.getInstance();
  
  console.log(`DecoratorManager缓存统计:`, decoratorManager.getCacheStats());
  console.log(`DecoratorManager容器信息:`, decoratorManager.getContainerInfo());
  
  // 检查是否被标记为装饰
  console.log(`\n装饰标记检查:`);
  console.log(`- originalMethod被装饰: ${decoratorManager.isDecorated(service.originalMethod)}`);
  console.log(`- redlockOnlyMethod被装饰: ${decoratorManager.isDecorated(service.redlockOnlyMethod)}`);
  console.log(`- scheduledOnlyMethod被装饰: ${decoratorManager.isDecorated(service.scheduledOnlyMethod)}`);
  console.log(`- combinedDecoratorsMethod被装饰: ${decoratorManager.isDecorated(service.combinedDecoratorsMethod)}`);
}

// 执行验证
verifyMethodWrapping();

// 测试方法调用行为差异
async function testMethodBehavior() {
  const service = new VerificationService();
  
  console.log("\n=== 方法行为测试 ===");
  
  // 测试原始方法（应该直接执行）
  console.log("\n1. 测试原始方法:");
  try {
    const start = Date.now();
    const result = await service.originalMethod();
    const duration = Date.now() - start;
    console.log(`   结果: ${result}, 耗时: ${duration}ms`);
  } catch (error) {
    console.log(`   错误: ${error.message}`);
  }
  
  // 测试RedLock方法（应该尝试获取锁）
  console.log("\n2. 测试RedLock方法:");
  try {
    const start = Date.now();
    const result = await service.redlockOnlyMethod();
    const duration = Date.now() - start;
    console.log(`   结果: ${result}, 耗时: ${duration}ms`);
  } catch (error) {
    console.log(`   错误（预期）: ${error.message}`);
  }
  
  // 测试组合方法（应该尝试获取锁）
  console.log("\n3. 测试组合装饰器方法:");
  try {
    const start = Date.now();
    const result = await service.combinedDecoratorsMethod();
    const duration = Date.now() - start;
    console.log(`   结果: ${result}, 耗时: ${duration}ms`);
  } catch (error) {
    console.log(`   错误（预期）: ${error.message}`);
  }
}

testMethodBehavior(); 