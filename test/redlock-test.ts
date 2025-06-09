/**
 * RedLock装饰器测试
 * 验证方法是否被正确包装
 */

import { RedLock, Scheduled } from "../src/index";

class TestService {
  
  @RedLock("test-lock", { lockTimeOut: 5000 })
  async testMethod() {
    console.log("执行测试方法");
    await new Promise(resolve => setTimeout(resolve, 1000));
    return "测试完成";
  }

  @Scheduled("*/5 * * * * *") // 每5秒执行一次
  async scheduledMethod() {
    console.log("定时任务执行");
    return "定时任务完成";
  }

  @RedLock("combined-lock")
  @Scheduled("*/10 * * * * *") // 每10秒执行一次
  async combinedMethod() {
    console.log("组合装饰器方法执行");
    await new Promise(resolve => setTimeout(resolve, 2000));
    return "组合方法完成";
  }
}

// 验证装饰器是否正确应用
const service = new TestService();

// 检查方法是否被包装
console.log("testMethod类型:", typeof service.testMethod);
console.log("scheduledMethod类型:", typeof service.scheduledMethod);
console.log("combinedMethod类型:", typeof service.combinedMethod);

// 检查方法是否是async函数
console.log("testMethod是否为async:", service.testMethod.constructor.name === 'AsyncFunction');
console.log("scheduledMethod是否为async:", service.scheduledMethod.constructor.name === 'AsyncFunction');
console.log("combinedMethod是否为async:", service.combinedMethod.constructor.name === 'AsyncFunction');

// 测试方法调用（注意：这里不会真正获得锁，因为没有初始化Redis）
async function testMethodWrapping() {
  try {
    console.log("开始测试testMethod包装...");
    const result = await service.testMethod();
    console.log("testMethod结果:", result);
  } catch (error) {
    console.log("testMethod错误（预期，因为没有Redis）:", error.message);
  }

  try {
    console.log("开始测试combinedMethod包装...");
    const result = await service.combinedMethod();
    console.log("combinedMethod结果:", result);
  } catch (error) {
    console.log("combinedMethod错误（预期，因为没有Redis）:", error.message);
  }
}

testMethodWrapping(); 