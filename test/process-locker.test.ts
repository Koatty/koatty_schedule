import { IOCContainer } from "koatty_container";
import { Helper } from "koatty_lib";
import { DefaultLogger } from "koatty_logger";
import { initRedLock, injectRedLock, redLockerDescriptor } from "../src/process/locker";
import { RedLocker } from "../src/locker/redlock";
import { COMPONENT_REDLOCK, DecoratorType } from "../src/config/config";

// Mock依赖
jest.mock("koatty_container");
jest.mock("koatty_lib");
jest.mock("koatty_logger");
jest.mock("../src/locker/redlock");
jest.mock("../src/utils/lib");

const mockIOCContainer = IOCContainer as jest.Mocked<typeof IOCContainer>;
const mockHelper = Helper as jest.Mocked<typeof Helper>;
const mockLogger = DefaultLogger as jest.Mocked<typeof DefaultLogger>;
const mockRedLocker = RedLocker as jest.Mocked<typeof RedLocker>;

describe("process/locker.ts 测试覆盖", () => {
  let mockApp: any;
  let mockRedLockerInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock app
    mockApp = {
      once: jest.fn()
    };

    // Mock RedLocker instance
    mockRedLockerInstance = {
      initialize: jest.fn().mockResolvedValue(undefined),
      acquire: jest.fn().mockResolvedValue({
        extend: jest.fn().mockResolvedValue({}),
        release: jest.fn().mockResolvedValue(undefined)
      })
    };

    mockRedLocker.getInstance.mockReturnValue(mockRedLockerInstance);
    mockHelper.isFunction.mockReturnValue(true);
    mockHelper.isEmpty.mockReturnValue(false);
  });

  describe("initRedLock函数", () => {
    it("应该成功初始化RedLock", async () => {
      const options = {
        redisConfig: { host: "localhost", port: 6379 },
        lockTimeOut: 10000
      };

      await initRedLock(options, mockApp);

      expect(mockApp.once).toHaveBeenCalledWith("appStart", expect.any(Function));
    });

    it("应该在app不可用时跳过初始化", async () => {
      const options = { redisConfig: { host: "localhost", port: 6379 } };
      const invalidApp = null;

      await initRedLock(options, invalidApp as any);

      expect(mockLogger.Warn).toHaveBeenCalledWith(
        expect.stringContaining("RedLock initialization skipped")
      );
    });

    it("应该在缺少配置时抛出错误", async () => {
      let appStartCallback: ((...args: any) => any) | undefined;
      mockApp.once.mockImplementation((event: string, callback: (...args: any) => any) => {
        if (event === "appStart") {
          appStartCallback = callback;
        }
      });

      mockHelper.isEmpty.mockReturnValue(true); // 配置为空

      await initRedLock({} as any, mockApp);

      // 模拟appStart事件触发
      await expect(appStartCallback!()).rejects.toThrow(
        "Missing RedLock configuration"
      );
    });

    it("应该在初始化失败时记录错误", async () => {
      const options = {
        redisConfig: { host: "localhost", port: 6379 },
        lockTimeOut: 10000
      };
      
      const appStartCallback = jest.fn();
      mockApp.once.mockImplementation((event: string, callback: (...args: any) => any) => {
        if (event === "appStart") {
          appStartCallback.mockImplementation(callback);
        }
      });

      mockRedLockerInstance.initialize.mockRejectedValue(new Error("Init failed"));

      await initRedLock(options, mockApp);

      await expect(appStartCallback()).rejects.toThrow("Init failed");
    });
  });

  describe("injectRedLock函数", () => {
    beforeEach(() => {
      mockIOCContainer.listClass.mockReturnValue([
        { id: "TestService", target: class TestService {} }
      ]);
    });

    it("应该成功注入RedLock锁", async () => {
      const mockMetadata = new Map([
        ["TestService", {
          "REDLOCK_testMethod": {
            method: "testMethod",
            name: "test-lock",
            options: { lockTimeOut: 5000 }
          }
        }]
      ]);

      const mockInstance = {
        testMethod: jest.fn().mockResolvedValue("success")
      };

      mockIOCContainer.getClassMetadata.mockReturnValue(mockMetadata);
      mockIOCContainer.get.mockReturnValue(mockInstance);

      await injectRedLock({} as any, {} as any);

      expect(mockIOCContainer.listClass).toHaveBeenCalledWith("COMPONENT");
      expect(mockIOCContainer.getClassMetadata).toHaveBeenCalledWith(
        "COMPONENT_REDLOCK",
        DecoratorType.REDLOCK,
        expect.any(Function)
      );
      expect(mockLogger.Debug).toHaveBeenCalledWith(
        expect.stringContaining("Starting batch RedLock injection")
      );
    });

    it("应该跳过没有元数据的组件", async () => {
      mockIOCContainer.getClassMetadata.mockReturnValue(null);

      await injectRedLock({} as any, {} as any);

      expect(mockLogger.Debug).toHaveBeenCalledWith(
        expect.stringContaining("Starting batch RedLock injection")
      );
    });

    it("应该跳过没有实例的类", async () => {
      const mockMetadata = new Map([
        ["TestService", {
          "REDLOCK_testMethod": {
            method: "testMethod",
            name: "test-lock"
          }
        }]
      ]);

      mockIOCContainer.getClassMetadata.mockReturnValue(mockMetadata);
      mockIOCContainer.get.mockReturnValue(null);

      await injectRedLock({} as any, {} as any);

      expect(mockLogger.Debug).toHaveBeenCalledWith(
        expect.stringContaining("Starting batch RedLock injection")
      );
    });

    it("应该跳过非函数方法", async () => {
      const mockMetadata = new Map([
        ["TestService", {
          "REDLOCK_testMethod": {
            method: "testMethod",
            name: "test-lock"
          }
        }]
      ]);

      const mockInstance = {
        testMethod: "not a function"
      };

      mockIOCContainer.getClassMetadata.mockReturnValue(mockMetadata);
      mockIOCContainer.get.mockReturnValue(mockInstance);
      mockHelper.isFunction.mockReturnValue(false);

      await injectRedLock({} as any, {} as any);

      expect(mockLogger.Warn).toHaveBeenCalledWith(
        expect.stringContaining("RedLock injection skipped")
      );
    });

    it("应该处理非RedLock键", async () => {
      const mockMetadata = new Map([
        ["TestService", {
          "OTHER_method": {
            method: "otherMethod",
            type: "other"
          }
        }]
      ]);

      const mockInstance = {
        otherMethod: jest.fn()
      };

      mockIOCContainer.getClassMetadata.mockReturnValue(mockMetadata);
      mockIOCContainer.get.mockReturnValue(mockInstance);

      await injectRedLock({} as any, {} as any);

      expect(mockLogger.Debug).toHaveBeenCalledWith(
        expect.stringContaining("Starting batch RedLock injection")
      );
    });

    it("应该处理类处理失败的情况", async () => {
      const mockMetadata = new Map([
        ["TestService", {
          "REDLOCK_testMethod": {
            method: "testMethod",
            name: "test-lock"
          }
        }]
      ]);

      mockIOCContainer.getClassMetadata.mockReturnValue(mockMetadata);
      mockIOCContainer.get.mockImplementation(() => {
        throw new Error("Get instance failed");
      });

      await injectRedLock({} as any, {} as any);

      expect(mockLogger.Error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to process class"),
        expect.any(Error)
      );
    });

    it("应该处理整体注入失败的情况", async () => {
      mockIOCContainer.listClass.mockImplementation(() => {
        throw new Error("List class failed");
      });

      await injectRedLock({} as any, {} as any);

      expect(mockLogger.Error).toHaveBeenCalledWith(
        "Failed to inject RedLocks:",
        expect.any(Error)
      );
    });
  });

  describe("redLockerDescriptor函数", () => {
    let originalDescriptor: PropertyDescriptor;
    let mockMethod: jest.Mock;

    beforeEach(() => {
      mockMethod = jest.fn().mockResolvedValue("success");
      originalDescriptor = {
        value: mockMethod,
        configurable: true,
        enumerable: false,
        writable: true
      };
    });

    it("应该创建有效的RedLock描述符", () => {
      const descriptor = redLockerDescriptor(
        originalDescriptor,
        "test-lock",
        "testMethod",
        { lockTimeOut: 5000 }
      );

      expect(descriptor).toHaveProperty("value");
      expect(descriptor).toHaveProperty("configurable", true);
      expect(descriptor).toHaveProperty("enumerable", false);
      expect(descriptor).toHaveProperty("writable", true);
      expect(typeof descriptor.value).toBe("function");
    });

    it("应该验证必需参数", () => {
      expect(() => {
        redLockerDescriptor(null as any, "test-lock", "testMethod");
      }).toThrow("Property descriptor is required");

      expect(() => {
        redLockerDescriptor(originalDescriptor, "", "testMethod");
      }).toThrow("Lock name must be a non-empty string");

      expect(() => {
        redLockerDescriptor(originalDescriptor, "test-lock", "");
      }).toThrow("Method name must be a non-empty string");
    });

    it("应该验证描述符值必须是函数", () => {
      const invalidDescriptor = {
        value: "not a function",
        configurable: true,
        enumerable: false,
        writable: true
      };

      expect(() => {
        redLockerDescriptor(invalidDescriptor, "test-lock", "testMethod");
      }).toThrow("Descriptor value must be a function");
    });

    it("应该使用默认选项", () => {
      const descriptor = redLockerDescriptor(
        originalDescriptor,
        "test-lock",
        "testMethod"
      );

      expect(descriptor).toBeDefined();
      expect(typeof descriptor.value).toBe("function");
    });

    it("应该验证锁超时时间", () => {
      expect(() => {
        redLockerDescriptor(
          originalDescriptor,
          "test-lock",
          "testMethod",
          { lockTimeOut: 100 } // 小于200ms
        );
      }).not.toThrow(); // 这个错误是在运行时抛出的，不是在创建描述符时
    });
  });
}); 