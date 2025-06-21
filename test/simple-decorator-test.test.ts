/**
 * 简单的装饰器target验证测试
 */

describe('Simple Decorator Target Test', () => {
  test('should verify target.constructor vs target.prototype behavior', () => {
    const results: any[] = [];

    // 方法装饰器
    function TestMethodDecorator(target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
      results.push({
        type: 'method',
        propertyKey: propertyKey.toString(),
        originalTarget: target, // 保存原始target引用
        target: {
          type: typeof target,
          isFunction: typeof target === 'function',
          constructor: target.constructor,
          constructorName: target.constructor?.name,
          prototype: target.prototype,
          hasPrototype: 'prototype' in target
        }
      });
    }

    // 类装饰器
    function TestClassDecorator(target: any) {
      results.push({
        type: 'class',
        originalTarget: target, // 保存原始target引用
        target: {
          type: typeof target,
          isFunction: typeof target === 'function',
          constructor: target.constructor,
          constructorName: target.constructor?.name,
          prototype: target.prototype,
          hasPrototype: 'prototype' in target,
          name: target.name
        }
      });
    }

    // 测试类
    @TestClassDecorator
    class TestClass {
      @TestMethodDecorator
      instanceMethod() {
        return 'instance';
      }

      @TestMethodDecorator
      static staticMethod() {
        return 'static';
      }
    }

    // 验证结果
    expect(results.length).toBe(3); // 1个类装饰器 + 2个方法装饰器

    const classResult = results.find(r => r.type === 'class');
    const instanceResult = results.find(r => r.type === 'method' && r.propertyKey === 'instanceMethod');
    const staticResult = results.find(r => r.type === 'method' && r.propertyKey === 'staticMethod');

    // 类装饰器验证
    expect(classResult.target.type).toBe('function');
    expect(classResult.target.isFunction).toBe(true);
    expect(classResult.target.name).toBe('TestClass');
    expect(classResult.target.hasPrototype).toBe(true);
    expect(classResult.target.constructorName).toBe('Function');

    // 实例方法装饰器验证
    expect(instanceResult.target.type).toBe('object');
    expect(instanceResult.target.isFunction).toBe(false);
    expect(instanceResult.target.constructorName).toBe('TestClass');
    expect(instanceResult.target.hasPrototype).toBe(false); // 原型对象没有prototype属性
    expect(instanceResult.target.prototype).toBeUndefined();

    // 静态方法装饰器验证
    expect(staticResult.target.type).toBe('function');
    expect(staticResult.target.isFunction).toBe(true);
    expect(staticResult.target.constructorName).toBe('Function');
    expect(staticResult.target.hasPrototype).toBe(true); // 构造函数有prototype属性

    // 关键验证：原型链关系
    // 注意：这里需要比较实际的target对象，而不是包装后的分析结果
    // 我们需要在装饰器中保存原始的target引用
    const originalInstanceTarget = results.find(r => r.type === 'method' && r.propertyKey === 'instanceMethod').originalTarget;
    const originalClassTarget = results.find(r => r.type === 'class').originalTarget;
    const originalStaticTarget = results.find(r => r.type === 'method' && r.propertyKey === 'staticMethod').originalTarget;
    
    expect(originalInstanceTarget.constructor).toBe(originalClassTarget); // 原型对象的constructor指向类
    expect(originalClassTarget.prototype).toBe(originalInstanceTarget); // 类的prototype指向原型对象
    expect(originalStaticTarget).toBe(originalClassTarget); // 静态方法的target就是类本身

    console.log('=== 装饰器Target分析结果 ===');
    console.log('类装饰器 target:', classResult.target);
    console.log('实例方法装饰器 target:', instanceResult.target);
    console.log('静态方法装饰器 target:', staticResult.target);

    // IOC Container使用模式验证
    const getConstructorForIOC = (decoratorResult: any) => {
      if (decoratorResult.type === 'class') {
        return decoratorResult.originalTarget; // 类装饰器直接返回target
      } else {
        if (decoratorResult.target.isFunction) {
          return decoratorResult.originalTarget; // 静态方法，target就是构造函数
        } else {
          return decoratorResult.originalTarget.constructor; // 实例方法，需要获取constructor
        }
      }
    };

    const classConstructor = getConstructorForIOC(classResult);
    const instanceConstructor = getConstructorForIOC(instanceResult);
    const staticConstructor = getConstructorForIOC(staticResult);

    // 所有情况下都应该得到同一个构造函数
    expect(classConstructor).toBe(instanceConstructor);
    expect(instanceConstructor).toBe(staticConstructor);
    expect(typeof classConstructor).toBe('function');
    expect(classConstructor.name).toBe('TestClass');

    console.log('=== IOC Container 使用模式验证 ===');
    console.log('所有装饰器最终都指向同一个构造函数:', classConstructor.name);
    console.log('构造函数相等性验证通过:', classConstructor === instanceConstructor && instanceConstructor === staticConstructor);
  });

  test('should demonstrate the difference between target and target.constructor', () => {
    let methodTarget: any;
    let classTarget: any;

    function MethodDecorator(target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
      methodTarget = target;
    }

    function ClassDecorator(target: any) {
      classTarget = target;
    }

    @ClassDecorator
    class DemoClass {
      @MethodDecorator
      demoMethod() {}
    }

    // 验证基本关系
    expect(typeof classTarget).toBe('function'); // 类装饰器的target是构造函数
    expect(typeof methodTarget).toBe('object'); // 方法装饰器的target是原型对象
    expect(methodTarget.constructor).toBe(classTarget); // 原型对象的constructor指向构造函数
    expect(classTarget.prototype).toBe(methodTarget); // 构造函数的prototype指向原型对象

    // 对于IOC容器的使用
    console.log('=== 装饰器Target类型对比 ===');
    console.log('类装饰器 target 类型:', typeof classTarget, '名称:', classTarget.name);
    console.log('方法装饰器 target 类型:', typeof methodTarget, '名称:', methodTarget.constructor.name);
    console.log('方法装饰器 target.constructor 类型:', typeof methodTarget.constructor, '名称:', methodTarget.constructor.name);

    // 结论：
    // 1. 类装饰器：直接使用 target
    // 2. 方法装饰器：使用 target.constructor 获取类构造函数
    // 3. IOCContainer.saveClass 需要构造函数，所以方法装饰器必须使用 target.constructor
  });
}); 