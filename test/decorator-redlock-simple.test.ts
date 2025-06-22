import { IOCContainer } from "koatty_container";
import { RedLock } from "../src/decorator/redlock";
import { validateRedLockMethodOptions } from "../src/config/config";
import { redLockerDescriptor, generateLockName } from "../src/process/locker";

// Mock依赖
jest.mock("koatty_container");
jest.mock("../src/config/config", () => ({
  ...jest.requireActual("../src/config/config"),
  validateRedLockMethodOptions: jest.fn()
}));
jest.mock("../src/process/locker", () => ({
  redLockerDescriptor: jest.fn(),
  generateLockName: jest.fn()
}));

const mockIOCContainer = IOCContainer as jest.Mocked<typeof IOCContainer>;
const mockValidateRedLockMethodOptions = validateRedLockMethodOptions as jest.MockedFunction<typeof validateRedLockMethodOptions>;
const mockRedLockerDescriptor = redLockerDescriptor as jest.MockedFunction<typeof redLockerDescriptor>;
const mockGenerateLockName = generateLockName as jest.MockedFunction<typeof generateLockName>;

describe("decorator/redlock.ts 简化测试覆盖", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIOCContainer.getType.mockReturnValue("SERVICE");
    mockValidateRedLockMethodOptions.mockImplementation(() => {});
    mockGenerateLockName.mockImplementation((name, method) => name || `${method}_generated`);
    
    // Mock redLockerDescriptor to return a enhanced descriptor
    mockRedLockerDescriptor.mockImplementation((descriptor, lockName, methodName) => ({
      ...descriptor,
      value: async function(this: any, ...args: any[]) {
        return descriptor.value.apply(this, args);
      },
      writable: true,
      configurable: true,
      enumerable: false
    }));
  });

  describe("RedLock装饰器基本功能", () => {
    it("应该成功应用RedLock装饰器到SERVICE类的方法", () => {
      class TestService {
        @RedLock("test-lock", { lockTimeOut: 5000 })
        async testMethod() {
          return "success";
        }
      }

      expect(mockIOCContainer.getType).toHaveBeenCalledWith(TestService);
      expect(mockIOCContainer.saveClass).toHaveBeenCalledWith(
        "COMPONENT",
        TestService,
        "TestService"
      );
      expect(mockRedLockerDescriptor).toHaveBeenCalledWith(
        expect.any(Object),
        "test-lock",
        "testMethod",
        { lockTimeOut: 5000 }
      );
    });

    it("应该成功应用RedLock装饰器到COMPONENT类的方法", () => {
      mockIOCContainer.getType.mockReturnValue("COMPONENT");

      class TestComponent {
        @RedLock("component-lock")
        async componentMethod() {
          return "success";
        }
      }

      expect(mockIOCContainer.getType).toHaveBeenCalledWith(TestComponent);
      expect(mockIOCContainer.saveClass).toHaveBeenCalledWith(
        "COMPONENT",
        TestComponent,
        "TestComponent"
      );
      expect(mockRedLockerDescriptor).toHaveBeenCalledWith(
        expect.any(Object),
        "component-lock",
        "componentMethod",
        undefined
      );
    });

    it("应该使用生成的锁名称当没有指定名称时", () => {
      mockGenerateLockName.mockReturnValue("autoNameMethod_generated_12345");

      class TestService {
        @RedLock()
        async autoNameMethod() {
          return "success";
        }
      }

      expect(mockGenerateLockName).toHaveBeenCalledWith(
        undefined,
        "autoNameMethod",
        TestService.prototype
      );
      expect(mockRedLockerDescriptor).toHaveBeenCalledWith(
        expect.any(Object),
        "autoNameMethod_generated_12345",
        "autoNameMethod",
        undefined
      );
    });

    it("应该验证RedLock选项当提供时", () => {
      const options = { lockTimeOut: 10000, maxRetries: 5 };

      class TestService {
        @RedLock("validated-lock", options)
        async validatedMethod() {
          return "success";
        }
      }

      expect(mockValidateRedLockMethodOptions).toHaveBeenCalledWith(options);
    });

    it("应该处理多个RedLock方法在同一个类中", () => {
      class TestService {
        @RedLock("lock1")
        async method1() {
          return "success1";
        }

        @RedLock("lock2")
        async method2() {
          return "success2";
        }
      }

      expect(mockRedLockerDescriptor).toHaveBeenCalledTimes(2);
      expect(mockIOCContainer.saveClass).toHaveBeenCalledTimes(2);
      
      const firstCall = mockRedLockerDescriptor.mock.calls[0];
      const secondCall = mockRedLockerDescriptor.mock.calls[1];
      
      expect(firstCall[1]).toBe("lock1"); // lockName
      expect(firstCall[2]).toBe("method1"); // methodName
      expect(secondCall[1]).toBe("lock2"); // lockName  
      expect(secondCall[2]).toBe("method2"); // methodName
    });
  });

  describe("RedLock装饰器错误处理", () => {
    it("应该抛出错误当用于非SERVICE/COMPONENT类时", () => {
      mockIOCContainer.getType.mockReturnValue("CONTROLLER");

      expect(() => {
        class TestController {
          @RedLock("invalid-class-type")
          async testMethod() {
            return "success";
          }
        }
      }).toThrow("@RedLock decorator can only be used on SERVICE or COMPONENT classes.");
    });

    it("应该传播验证选项时的错误", () => {
      const validationError = new Error("Invalid lock timeout");
      mockValidateRedLockMethodOptions.mockImplementation(() => {
        throw validationError;
      });

      expect(() => {
        class TestService {
          @RedLock("test-lock", { lockTimeOut: -1 })
          async invalidOptionsMethod() {
            return "success";
          }
        }
      }).toThrow("Invalid lock timeout");
    });

    it("应该抛出错误当方法名为空时", () => {
      expect(() => {
        const TestService = class TestService {};
        const descriptor = { value: function() { return "test"; }, configurable: true, enumerable: false, writable: true };
        const decorator = RedLock("test-lock");
        decorator(TestService.prototype, "", descriptor);
      }).toThrow("Method name is required for @RedLock decorator");
    });

    it("应该抛出错误当方法描述符无效时", () => {
      expect(() => {
        const TestService = class TestService {};
        const decorator = RedLock("test-lock");
        decorator(TestService.prototype, "testMethod", undefined as any);
      }).toThrow("@RedLock decorator can only be applied to methods");
    });

    it("应该抛出错误当描述符值不是函数时", () => {
      expect(() => {
        const TestService = class TestService {};
        const descriptor = { value: "not a function", configurable: true, enumerable: false, writable: true };
        const decorator = RedLock("test-lock");
        decorator(TestService.prototype, "testMethod", descriptor);
      }).toThrow("@RedLock decorator can only be applied to methods");
    });

    it("应该处理redLockerDescriptor抛出的错误", () => {
      const descriptorError = new Error("Failed to create descriptor");
      mockRedLockerDescriptor.mockImplementation(() => {
        throw descriptorError;
      });

      expect(() => {
        class TestService {
          @RedLock("error-lock")
          async errorMethod() {
            return "success";
          }
        }
      }).toThrow("Failed to apply RedLock to errorMethod: Failed to create descriptor");
    });
  });

  describe("RedLock装饰器边界条件", () => {
    it("应该处理空字符串锁名称", () => {
      mockGenerateLockName.mockReturnValue("emptyNameMethod_generated");

      class TestService {
        @RedLock("")
        async emptyNameMethod() {
          return "success";
        }
      }

      expect(mockGenerateLockName).toHaveBeenCalledWith(
        "",
        "emptyNameMethod", 
        TestService.prototype
      );
    });

    it("应该处理只有空格的锁名称", () => {
      class TestService {
        @RedLock("   ")
        async spaceNameMethod() {
          return "success";
        }
      }

      expect(mockRedLockerDescriptor).toHaveBeenCalledWith(
        expect.any(Object),
        "   ",
        "spaceNameMethod",
        undefined
      );
    });

    it("应该处理复杂的方法选项", () => {
      const complexOptions = {
        lockTimeOut: 15000,
        maxRetries: 10,
        retryDelayMs: 500,
        clockDriftFactor: 0.02
      };

      class TestService {
        @RedLock("complex-lock", complexOptions)
        async complexMethod() {
          return "success";
        }
      }
      
      expect(mockRedLockerDescriptor).toHaveBeenCalledWith(
        expect.any(Object),
        "complex-lock",
        "complexMethod",
        complexOptions
      );
    });

    it("应该为每个装饰器生成不同的锁名称", () => {
      mockGenerateLockName
        .mockReturnValueOnce("method1_generated_123")
        .mockReturnValueOnce("method2_generated_456");

      class TestService {
        @RedLock()
        async method1() {
          return "success1";
        }

        @RedLock()
        async method2() {
          return "success2";
        }
      }

      expect(mockRedLockerDescriptor).toHaveBeenCalledTimes(2);
      
      const firstCall = mockRedLockerDescriptor.mock.calls[0];
      const secondCall = mockRedLockerDescriptor.mock.calls[1];
      
      expect(firstCall[1]).toBe("method1_generated_123");
      expect(secondCall[1]).toBe("method2_generated_456");
    });

    it("应该处理异步和同步方法", () => {
      class TestService {
        @RedLock("async-lock")
        async asyncMethod() {
          return "async success";
        }

        @RedLock("sync-lock")
        syncMethod() {
          return "sync success";
        }
      }

      expect(mockRedLockerDescriptor).toHaveBeenCalledTimes(2);
      
      const firstCall = mockRedLockerDescriptor.mock.calls[0];
      const secondCall = mockRedLockerDescriptor.mock.calls[1];
      
      expect(firstCall[2]).toBe("asyncMethod");
      expect(secondCall[2]).toBe("syncMethod");
    });
  });

  describe("手动调用装饰器函数", () => {
    it("应该能够手动应用装饰器", () => {
      const TestService = class TestService {};
      const descriptor = { value: function() { return "test"; }, configurable: true, enumerable: false, writable: true };
      const decorator = RedLock("manual-lock");
      const result = decorator(TestService.prototype, "manualMethod", descriptor);

      expect(mockRedLockerDescriptor).toHaveBeenCalledWith(
        descriptor,
        "manual-lock",
        "manualMethod",
        undefined
      );
      expect(result).toBeDefined();
    });

    it("应该处理方法名为符号时的toString转换", () => {
      const TestService = class TestService {};
      const descriptor = { value: function() { return "test"; }, configurable: true, enumerable: false, writable: true };
      const decorator = RedLock("symbol-lock");
      const methodSymbol = Symbol("testMethod");
      
      decorator(TestService.prototype, methodSymbol, descriptor);

      expect(mockRedLockerDescriptor).toHaveBeenCalledWith(
        descriptor,
        "symbol-lock",
        "Symbol(testMethod)",
        undefined
      );
    });
  });
}); 