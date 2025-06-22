import { IOCContainer } from "koatty_container";
import { Helper } from "koatty_lib";
import { Scheduled } from "../src/decorator/scheduled";
import { COMPONENT_SCHEDULED, DecoratorType, validateCronExpression } from "../src/config/config";

// Mock依赖
jest.mock("koatty_container");
jest.mock("koatty_lib");
jest.mock("../src/config/config", () => ({
  ...jest.requireActual("../src/config/config"),
  validateCronExpression: jest.fn()
}));

const mockIOCContainer = IOCContainer as jest.Mocked<typeof IOCContainer>;
const mockHelper = Helper as jest.Mocked<typeof Helper>;
const mockValidateCronExpression = validateCronExpression as jest.MockedFunction<typeof validateCronExpression>;

describe("decorator/scheduled.ts 测试覆盖", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIOCContainer.getType.mockReturnValue("SERVICE");
    mockHelper.isEmpty.mockReturnValue(false);
    mockValidateCronExpression.mockImplementation(() => {});
  });

  describe("Scheduled装饰器基本功能", () => {
    it("应该成功应用Scheduled装饰器到SERVICE类的方法", () => {
      class TestService {
        @Scheduled("0 */5 * * * *", "Asia/Shanghai")
        async scheduledMethod() {
          return "scheduled";
        }
      }

      expect(mockHelper.isEmpty).toHaveBeenCalledWith("0 */5 * * * *");
      expect(mockValidateCronExpression).toHaveBeenCalledWith("0 */5 * * * *");
      expect(mockIOCContainer.getType).toHaveBeenCalledWith(TestService);
      expect(mockIOCContainer.saveClass).toHaveBeenCalledWith(
        "SERVICE",
        TestService,
        "TestService"
      );
      expect(mockIOCContainer.attachClassMetadata).toHaveBeenCalledWith(
        COMPONENT_SCHEDULED,
        DecoratorType.SCHEDULED,
        {
          method: "scheduledMethod",
          cron: "0 */5 * * * *",
          timezone: "Asia/Shanghai"
        },
        TestService.prototype,
        "scheduledMethod"
      );
    });

    it("应该成功应用Scheduled装饰器到COMPONENT类的方法", () => {
      mockIOCContainer.getType.mockReturnValue("COMPONENT");

      class TestComponent {
        @Scheduled("0 0 12 * * *")
        async dailyTask() {
          return "daily";
        }
      }

      expect(mockIOCContainer.getType).toHaveBeenCalledWith(TestComponent);
      expect(mockIOCContainer.saveClass).toHaveBeenCalledWith(
        "COMPONENT",
        TestComponent,
        "TestComponent"
      );
    });

    it("应该正确处理没有时区参数的情况", () => {
      class TestService {
        @Scheduled("0 0 * * * *")
        async hourlyTask() {
          return "hourly";
        }
      }

      const attachMetadataCall = mockIOCContainer.attachClassMetadata.mock.calls[0];
      const metadata = attachMetadataCall[2];
      
      expect(metadata.method).toBe("hourlyTask");
      expect(metadata.cron).toBe("0 0 * * * *");
      expect(metadata.timezone).toBeUndefined();
    });

    it("应该验证cron表达式格式", () => {
      class TestService {
        @Scheduled("0 */10 * * * *")
        async validCronTask() {
          return "valid";
        }
      }

      expect(mockValidateCronExpression).toHaveBeenCalledWith("0 */10 * * * *");
    });

    it("应该处理复杂的cron表达式", () => {
      const complexCron = "0 30 2 * * MON-FRI";

      class TestService {
        @Scheduled(complexCron, "Europe/London")
        async complexTask() {
          return "complex";
        }
      }

      expect(mockValidateCronExpression).toHaveBeenCalledWith(complexCron);
      
      const attachMetadataCall = mockIOCContainer.attachClassMetadata.mock.calls[0];
      const metadata = attachMetadataCall[2];
      
      expect(metadata.cron).toBe(complexCron);
      expect(metadata.timezone).toBe("Europe/London");
    });

    it("应该处理多个调度方法在同一个类中", () => {
      class TestService {
        @Scheduled("0 0 6 * * *", "UTC")
        async morningTask() {
          return "morning";
        }

        @Scheduled("0 0 18 * * *", "UTC")
        async eveningTask() {
          return "evening";
        }
      }

      expect(mockIOCContainer.attachClassMetadata).toHaveBeenCalledTimes(2);
      expect(mockIOCContainer.saveClass).toHaveBeenCalledTimes(2);
      
      const firstCall = mockIOCContainer.attachClassMetadata.mock.calls[0];
      const secondCall = mockIOCContainer.attachClassMetadata.mock.calls[1];
      
      expect(firstCall[2].method).toBe("morningTask");
      expect(secondCall[2].method).toBe("eveningTask");
    });
  });

  describe("Scheduled装饰器错误处理", () => {
    it("应该抛出错误当cron表达式为空时", () => {
      mockHelper.isEmpty.mockReturnValue(true);

      expect(() => {
        class TestService {
          @Scheduled("")
          async emptyTask() {
            return "empty";
          }
        }
      }).toThrow("Cron expression is required and cannot be empty");
    });

    it("应该抛出错误当cron表达式无效时", () => {
      const cronError = new Error("Invalid cron format");
      mockValidateCronExpression.mockImplementation(() => {
        throw cronError;
      });

      expect(() => {
        class TestService {
          @Scheduled("invalid-cron")
          async invalidTask() {
            return "invalid";
          }
        }
      }).toThrow("Invalid cron expression: Invalid cron format");
    });

    it("应该抛出错误当用于非SERVICE/COMPONENT类时", () => {
      mockIOCContainer.getType.mockReturnValue("CONTROLLER");

      expect(() => {
        class TestController {
          @Scheduled("0 0 12 * * *")
          async testMethod() {
            return "test";
          }
        }
      }).toThrow("@Scheduled decorator can only be used on SERVICE or COMPONENT classes.");
    });

    it("应该抛出错误当时区参数不是字符串时", () => {
      expect(() => {
        class TestService {
          @Scheduled("0 0 12 * * *", 123 as any)
          async invalidTimezoneTask() {
            return "invalid timezone";
          }
        }
      }).toThrow("Timezone must be a string");
    });

    it("应该抛出错误当方法名无效时", () => {
      expect(() => {
        const TestService = class TestService {};
        const descriptor = { value: function() { return "test"; }, configurable: true, enumerable: false, writable: true };
        const decorator = Scheduled("0 0 12 * * *");
        decorator(TestService.prototype, "", descriptor);
      }).toThrow("Method name is required for @Scheduled decorator");
    });

    it("应该抛出错误当方法描述符无效时", () => {
      expect(() => {
        const TestService = class TestService {};
        const descriptor = undefined as any;
        const decorator = Scheduled("0 0 12 * * *");
        decorator(TestService.prototype, "testMethod", descriptor);
      }).toThrow("@Scheduled decorator can only be applied to methods");
    });

    it("应该抛出错误当描述符值不是函数时", () => {
      expect(() => {
        const TestService = class TestService {};
        const descriptor = { value: "not a function", configurable: true, enumerable: false, writable: true };
        const decorator = Scheduled("0 0 12 * * *");
        decorator(TestService.prototype, "testMethod", descriptor);
      }).toThrow("@Scheduled decorator can only be applied to methods");
    });
  });

  describe("Scheduled装饰器边界条件", () => {
    it("应该处理最小有效的cron表达式", () => {
      const minimalCron = "* * * * *";

      class TestService {
        @Scheduled(minimalCron)
        async minimalTask() {
          return "minimal";
        }
      }

      expect(mockValidateCronExpression).toHaveBeenCalledWith(minimalCron);
      
      const attachMetadataCall = mockIOCContainer.attachClassMetadata.mock.calls[0];
      const metadata = attachMetadataCall[2];
      
      expect(metadata.cron).toBe(minimalCron);
    });

    it("应该处理6段式cron表达式（包含秒）", () => {
      const sixPartCron = "30 */5 * * * *";

      class TestService {
        @Scheduled(sixPartCron)
        async sixPartTask() {
          return "six part";
        }
      }

      expect(mockValidateCronExpression).toHaveBeenCalledWith(sixPartCron);
      
      const attachMetadataCall = mockIOCContainer.attachClassMetadata.mock.calls[0];
      const metadata = attachMetadataCall[2];
      
      expect(metadata.cron).toBe(sixPartCron);
    });

    it("应该处理空字符串时区", () => {
      class TestService {
        @Scheduled("0 0 12 * * *", "")
        async emptyTimezoneTask() {
          return "empty timezone";
        }
      }

      const attachMetadataCall = mockIOCContainer.attachClassMetadata.mock.calls[0];
      const metadata = attachMetadataCall[2];
      
      expect(metadata.timezone).toBe("");
    });

    it("应该处理各种标准时区", () => {
      const timezones = ["UTC", "GMT", "Asia/Tokyo", "America/New_York", "Europe/Berlin"];

      timezones.forEach((tz, index) => {
        class TestService {
          @Scheduled("0 0 12 * * *", tz)
          async timezoneTask() {
            return `timezone ${tz}`;
          }
        }

        const attachMetadataCall = mockIOCContainer.attachClassMetadata.mock.calls[index];
        const metadata = attachMetadataCall[2];
        
        expect(metadata.timezone).toBe(tz);
      });
    });

    it("应该正确处理继承的类", () => {
      class BaseService {
        baseMethod() {
          return "base";
        }
      }

      class ExtendedService extends BaseService {
        @Scheduled("0 0 12 * * *")
        async extendedTask() {
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
        @Scheduled("0 0 12 * * *")
        async asyncTask() {
          return "async";
        }

        @Scheduled("0 0 18 * * *")
        syncTask() {
          return "sync";
        }
      }

      expect(mockIOCContainer.attachClassMetadata).toHaveBeenCalledTimes(2);
      
      const firstCall = mockIOCContainer.attachClassMetadata.mock.calls[0];
      const secondCall = mockIOCContainer.attachClassMetadata.mock.calls[1];
      
      expect(firstCall[2].method).toBe("asyncTask");
      expect(secondCall[2].method).toBe("syncTask");
    });
  });
}); 