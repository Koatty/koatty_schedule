import { IOCContainer } from "koatty_container";
import { RedLock } from "../src/decorator/redlock";
import { COMPONENT_REDLOCK, DecoratorType, validateRedLockMethodOptions } from "../src/config/config";

// Mock依赖
jest.mock("koatty_container");
jest.mock("../src/config/config", () => ({
  ...jest.requireActual("../src/config/config"),
  validateRedLockMethodOptions: jest.fn()
}));

const mockIOCContainer = IOCContainer as jest.Mocked<typeof IOCContainer>;
const mockValidateRedLockMethodOptions = validateRedLockMethodOptions as jest.MockedFunction<typeof validateRedLockMethodOptions>;

describe("decorator/redlock.ts 简化测试覆盖", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIOCContainer.getType.mockReturnValue("SERVICE");
    mockValidateRedLockMethodOptions.mockImplementation(() => {});
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
        "SERVICE",
        TestService,
        "TestService"
      );
      expect(mockIOCContainer.attachClassMetadata).toHaveBeenCalledWith(
        COMPONENT_REDLOCK,
        DecoratorType.REDLOCK,
        {
          method: "testMethod",
          name: "test-lock",
          options: { lockTimeOut: 5000 }
        },
        TestService.prototype,
        "testMethod"
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
    });

    it("应该自动生成唯一锁名称当没有指定名称时", () => {
      class TestService {
        @RedLock()
        async autoNameMethod() {
          return "success";
        }
      }

      const attachMetadataCall = mockIOCContainer.attachClassMetadata.mock.calls[0];
      const metadata = attachMetadataCall[2];
      
      expect(metadata.name).toMatch(/^autoNameMethod_[a-z0-9]+_[a-z0-9]+$/);
      expect(metadata.method).toBe("autoNameMethod");
      expect(metadata.options).toBeUndefined();
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

      expect(mockIOCContainer.attachClassMetadata).toHaveBeenCalledTimes(2);
      expect(mockIOCContainer.saveClass).toHaveBeenCalledTimes(2);
      
      const firstCall = mockIOCContainer.attachClassMetadata.mock.calls[0];
      const secondCall = mockIOCContainer.attachClassMetadata.mock.calls[1];
      
      expect(firstCall[2].method).toBe("method1");
      expect(secondCall[2].method).toBe("method2");
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
  });

  describe("RedLock装饰器边界条件", () => {
    it("应该处理空字符串锁名称", () => {
      class TestService {
        @RedLock("")
        async emptyNameMethod() {
          return "success";
        }
      }

      const attachMetadataCall = mockIOCContainer.attachClassMetadata.mock.calls[0];
      const metadata = attachMetadataCall[2];
      
      expect(metadata.name).toMatch(/^emptyNameMethod_[a-z0-9]+_[a-z0-9]+$/);
      expect(metadata.method).toBe("emptyNameMethod");
    });

    it("应该处理只有空格的锁名称", () => {
      class TestService {
        @RedLock("   ")
        async spaceNameMethod() {
          return "success";
        }
      }

      const attachMetadataCall = mockIOCContainer.attachClassMetadata.mock.calls[0];
      const metadata = attachMetadataCall[2];
      
      expect(metadata.name).toMatch(/^spaceNameMethod_[a-z0-9]+_[a-z0-9]+$/);
      expect(metadata.method).toBe("spaceNameMethod");
    });

    it("应该处理复杂的方法选项", () => {
      const complexOptions = {
        lockTimeOut: 15000,
        clockDriftFactor: 0.02,
        maxRetries: 10,
        retryDelayMs: 500
      };

      class TestService {
        @RedLock("complex-options", complexOptions)
        async complexMethod() {
          return "success";
        }
      }

      expect(mockValidateRedLockMethodOptions).toHaveBeenCalledWith(complexOptions);
      
      const attachMetadataCall = mockIOCContainer.attachClassMetadata.mock.calls[0];
      const metadata = attachMetadataCall[2];
      
      expect(metadata.options).toEqual(complexOptions);
    });

    it("应该不验证选项当未提供时", () => {
      class TestService {
        @RedLock("no-options-lock")
        async noOptionsMethod() {
          return "success";
        }
      }

      expect(mockValidateRedLockMethodOptions).not.toHaveBeenCalled();
    });

    it("应该为每个装饰器生成不同的锁名称", () => {
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

      expect(mockIOCContainer.attachClassMetadata).toHaveBeenCalledTimes(2);
      
      const firstCall = mockIOCContainer.attachClassMetadata.mock.calls[0];
      const secondCall = mockIOCContainer.attachClassMetadata.mock.calls[1];
      
      const firstName = firstCall[2].name;
      const secondName = secondCall[2].name;
      
      expect(firstName).toMatch(/^method1_[a-z0-9]+_[a-z0-9]+$/);
      expect(secondName).toMatch(/^method2_[a-z0-9]+_[a-z0-9]+$/);
      expect(firstName).not.toBe(secondName);
    });

    it("应该正确处理继承的类", () => {
      class BaseService {
        baseMethod() {
          return "base";
        }
      }

      class ExtendedService extends BaseService {
        @RedLock("extended-lock")
        async extendedMethod() {
          return "extended";
        }
      }

      expect(mockIOCContainer.getType).toHaveBeenCalledWith(ExtendedService);
      expect(mockIOCContainer.saveClass).toHaveBeenCalledWith(
        "SERVICE",
        ExtendedService,
        "ExtendedService"
      );
    });

    it("应该处理异步和同步方法", () => {
      class TestService {
        @RedLock("async-lock")
        async asyncMethod() {
          return "async";
        }

        @RedLock("sync-lock")
        syncMethod() {
          return "sync";
        }
      }

      expect(mockIOCContainer.attachClassMetadata).toHaveBeenCalledTimes(2);
      
      const firstCall = mockIOCContainer.attachClassMetadata.mock.calls[0];
      const secondCall = mockIOCContainer.attachClassMetadata.mock.calls[1];
      
      expect(firstCall[2].method).toBe("asyncMethod");
      expect(secondCall[2].method).toBe("syncMethod");
    });
  });

  describe("手动调用装饰器函数", () => {
    it("应该能够手动应用装饰器", () => {
      const TestService = class TestService {};
      const descriptor = { 
        value: function() { return "manual test"; }, 
        configurable: true, 
        enumerable: false, 
        writable: true 
      };
      
      const decorator = RedLock("manual-lock");
      decorator(TestService.prototype, "manualMethod", descriptor);
      expect(mockIOCContainer.attachClassMetadata).toHaveBeenCalledWith(
        COMPONENT_REDLOCK,
        DecoratorType.REDLOCK,
        {
          method: "manualMethod",
          name: "manual-lock",
          options: undefined
        },
        TestService.prototype,
        "manualMethod"
      );
    });

    it("应该处理方法名为符号时的toString转换", () => {
      const TestService = class TestService {};
      const symbolKey = Symbol("testMethod");
      const descriptor = { 
        value: function() { return "symbol test"; }, 
        configurable: true, 
        enumerable: false, 
        writable: true 
      };
      
      const decorator = RedLock("symbol-lock");
      decorator(TestService.prototype, symbolKey, descriptor);

      const attachMetadataCall = mockIOCContainer.attachClassMetadata.mock.calls[0];
      const metadata = attachMetadataCall[2];
      
      expect(metadata.method).toBe("Symbol(testMethod)");
      expect(metadata.name).toBe("symbol-lock");
    });
  });
}); 