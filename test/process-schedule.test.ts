/**
 * Test suite for process/schedule.ts
 * Tests the injectSchedule function with correct Array-based metadata structure.
 */

// Mock依赖 - MUST be before imports (Jest hoists these)
jest.mock("koatty_container", () => ({
  IOCContainer: {
    listClass: jest.fn(),
    getClassMetadata: jest.fn(),
    get: jest.fn(),
    saveClass: jest.fn(),
    attachClassMetadata: jest.fn(),
    setExistingInstance: jest.fn(),
    getType: jest.fn(),
    reg: jest.fn(),
  },
}));
jest.mock("koatty_lib", () => ({
  __esModule: true,
  Helper: {
    isFunction: jest.fn().mockReturnValue(true),
    isEmpty: jest.fn().mockReturnValue(false),
  },
}));
jest.mock("koatty_logger", () => ({
  DefaultLogger: {
    Debug: jest.fn(),
    Info: jest.fn(),
    Warn: jest.fn(),
    Error: jest.fn(),
  },
}));
jest.mock("cron", () => ({
  CronJob: jest.fn().mockImplementation(() => ({})),
}));
jest.mock("../src/config/config", () => ({
  ...jest.requireActual("../src/config/config"),
  getEffectiveTimezone: jest.fn(),
  COMPONENT_SCHEDULED: "COMPONENT_SCHEDULED",
  DecoratorType: { SCHEDULED: "SCHEDULED" },
}));

import { IOCContainer } from "koatty_container";
import { Helper } from "koatty_lib";
import { DefaultLogger } from "koatty_logger";
import { CronJob } from "cron";
import { injectSchedule } from "../src/process/schedule";
import { COMPONENT_SCHEDULED, DecoratorType, getEffectiveTimezone } from "../src/config/config";

const mockIOCContainer = IOCContainer as jest.Mocked<typeof IOCContainer>;
const mockHelper = Helper as jest.Mocked<typeof Helper>;
const mockLogger = DefaultLogger as jest.Mocked<typeof DefaultLogger>;
const mockCronJob = CronJob as jest.MockedClass<typeof CronJob>;
const mockGetEffectiveTimezone = getEffectiveTimezone as jest.MockedFunction<typeof getEffectiveTimezone>;

describe("process/schedule.ts 测试覆盖", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockHelper.isFunction as jest.Mock).mockReturnValue(true);
    mockGetEffectiveTimezone.mockReturnValue("Asia/Shanghai");
  });

  describe("injectSchedule函数", () => {
    it("应该成功注入调度任务", async () => {
      const mockComponentList = [
        { id: "COMPONENT:TaskService", target: class TaskService {} }
      ];

      const mockMetadata = [
        {
          method: "dailyTask",
          cron: "0 0 2 * * *",
          timezone: "UTC"
        }
      ];

      const mockInstance = {
        dailyTask: jest.fn().mockResolvedValue("completed")
      };

      mockIOCContainer.listClass.mockReturnValue(mockComponentList);
      mockIOCContainer.getClassMetadata.mockReturnValue(mockMetadata);
      mockIOCContainer.get.mockReturnValue(mockInstance);

      await injectSchedule({} as any);

      expect(mockIOCContainer.listClass).toHaveBeenCalledWith("COMPONENT");
      expect(mockIOCContainer.getClassMetadata).toHaveBeenCalledWith(
        "COMPONENT_SCHEDULED",
        DecoratorType.SCHEDULED,
        expect.any(Function)
      );
      expect(mockLogger.Debug).toHaveBeenCalledWith(
        "Starting batch schedule injection..."
      );
      expect(mockCronJob).toHaveBeenCalledWith(
        "0 0 2 * * *",
        expect.any(Function),
        null,
        true,
        "Asia/Shanghai"
      );
    });

    it("应该跳过没有元数据的组件", async () => {
      const mockComponentList = [
        { id: "COMPONENT:TaskService", target: class TaskService {} }
      ];

      mockIOCContainer.listClass.mockReturnValue(mockComponentList);
      mockIOCContainer.getClassMetadata.mockReturnValue(null);

      await injectSchedule({} as any);

      expect(mockLogger.Debug).toHaveBeenCalledWith(
        "Starting batch schedule injection..."
      );
      expect(mockCronJob).not.toHaveBeenCalled();
    });

    it("应该跳过没有实例的类", async () => {
      const mockComponentList = [
        { id: "COMPONENT:TaskService", target: class TaskService {} }
      ];

      const mockMetadata = [
        {
          method: "dailyTask",
          cron: "0 0 2 * * *"
        }
      ];

      mockIOCContainer.listClass.mockReturnValue(mockComponentList);
      mockIOCContainer.getClassMetadata.mockReturnValue(mockMetadata);
      mockIOCContainer.get.mockReturnValue(null);

      await injectSchedule({} as any);

      expect(mockCronJob).not.toHaveBeenCalled();
    });

    it("应该跳过非函数方法", async () => {
      const mockComponentList = [
        { id: "COMPONENT:TaskService", target: class TaskService {} }
      ];

      const mockMetadata = [
        {
          method: "dailyTask",
          cron: "0 0 2 * * *"
        }
      ];

      const mockInstance = {
        dailyTask: "not a function"
      };

      mockIOCContainer.listClass.mockReturnValue(mockComponentList);
      mockIOCContainer.getClassMetadata.mockReturnValue(mockMetadata);
      mockIOCContainer.get.mockReturnValue(mockInstance);
      (mockHelper.isFunction as jest.Mock).mockReturnValue(false);

      await injectSchedule({} as any);

      expect(mockLogger.Warn).toHaveBeenCalledWith(
        expect.stringContaining("Schedule injection skipped: method dailyTask is not a function in COMPONENT:TaskService")
      );
      expect(mockCronJob).not.toHaveBeenCalled();
    });

    it("应该跳过无效的scheduleData（缺少method字段）", async () => {
      const mockComponentList = [
        { id: "COMPONENT:TaskService", target: class TaskService {} }
      ];

      const mockMetadata = [
        {
          cron: "0 0 * * * *"
          // missing method field
        }
      ];

      const mockInstance = {
        otherMethod: jest.fn()
      };

      mockIOCContainer.listClass.mockReturnValue(mockComponentList);
      mockIOCContainer.getClassMetadata.mockReturnValue(mockMetadata);
      mockIOCContainer.get.mockReturnValue(mockInstance);

      await injectSchedule({} as any);

      expect(mockCronJob).not.toHaveBeenCalled();
    });

    it("应该处理多个调度方法", async () => {
      const mockComponentList = [
        { id: "COMPONENT:TaskService", target: class TaskService {} }
      ];

      const mockMetadata = [
        {
          method: "dailyTask",
          cron: "0 0 2 * * *",
          timezone: "UTC"
        },
        {
          method: "hourlyTask",
          cron: "0 0 * * * *",
          timezone: "Asia/Shanghai"
        }
      ];

      const mockInstance = {
        dailyTask: jest.fn().mockResolvedValue("daily completed"),
        hourlyTask: jest.fn().mockResolvedValue("hourly completed")
      };

      mockIOCContainer.listClass.mockReturnValue(mockComponentList);
      mockIOCContainer.getClassMetadata.mockReturnValue(mockMetadata);
      mockIOCContainer.get.mockReturnValue(mockInstance);

      await injectSchedule({} as any);

      expect(mockCronJob).toHaveBeenCalledTimes(2);
      expect(mockLogger.Debug).toHaveBeenCalledWith(
        expect.stringContaining("Schedule job COMPONENT:TaskService_dailyTask registered with cron: 0 0 2 * * *")
      );
      expect(mockLogger.Debug).toHaveBeenCalledWith(
        expect.stringContaining("Schedule job COMPONENT:TaskService_hourlyTask registered with cron: 0 0 * * * *")
      );
    });

    it("应该使用getEffectiveTimezone获取时区", async () => {
      const mockComponentList = [
        { id: "COMPONENT:TaskService", target: class TaskService {} }
      ];

      const mockMetadata = [
        {
          method: "taskWithTimezone",
          cron: "0 0 12 * * *",
          timezone: "Europe/London"
        },
        {
          method: "taskWithoutTimezone",
          cron: "0 0 18 * * *"
        }
      ];

      const mockInstance = {
        taskWithTimezone: jest.fn(),
        taskWithoutTimezone: jest.fn()
      };

      mockIOCContainer.listClass.mockReturnValue(mockComponentList);
      mockIOCContainer.getClassMetadata.mockReturnValue(mockMetadata);
      mockIOCContainer.get.mockReturnValue(mockInstance);
      
      mockGetEffectiveTimezone.mockReturnValueOnce("Europe/London");
      mockGetEffectiveTimezone.mockReturnValueOnce("Asia/Beijing");

      await injectSchedule({} as any);

      expect(mockGetEffectiveTimezone).toHaveBeenCalledWith({}, "Europe/London");
      expect(mockGetEffectiveTimezone).toHaveBeenCalledWith({}, undefined);
      expect(mockCronJob).toHaveBeenCalledWith(
        "0 0 12 * * *",
        expect.any(Function),
        null,
        true,
        "Europe/London"
      );
      expect(mockCronJob).toHaveBeenCalledWith(
        "0 0 18 * * *",
        expect.any(Function),
        null,
        true,
        "Asia/Beijing"
      );
    });

    it("应该处理类处理失败的情况", async () => {
      const mockComponentList = [
        { id: "COMPONENT:TaskService", target: class TaskService {} }
      ];

      const mockMetadata = [
        {
          method: "dailyTask",
          cron: "0 0 2 * * *"
        }
      ];

      mockIOCContainer.listClass.mockReturnValue(mockComponentList);
      mockIOCContainer.getClassMetadata.mockReturnValue(mockMetadata);
      mockIOCContainer.get.mockImplementation(() => {
        throw new Error("Get instance failed");
      });

      await injectSchedule({} as any);

      // get() throws outside the inner scheduleData loop, caught by outer catch
      expect(mockLogger.Error).toHaveBeenCalledWith(
        "Failed to inject schedules:",
        expect.any(Error)
      );
    });

    it("应该处理整体注入失败的情况", async () => {
      mockIOCContainer.listClass.mockImplementation(() => {
        throw new Error("List class failed");
      });

      await injectSchedule({} as any);

      expect(mockLogger.Error).toHaveBeenCalledWith(
        "Failed to inject schedules:",
        expect.any(Error)
      );
    });

    it("应该测试CronJob回调函数的执行", async () => {
      const mockComponentList = [
        { id: "COMPONENT:TaskService", target: class TaskService {} }
      ];

      const mockMetadata = [
        {
          method: "testTask",
          cron: "0 0 * * * *"
        }
      ];

      const mockTaskMethod = jest.fn().mockResolvedValue("task completed");
      const mockInstance = {
        testTask: mockTaskMethod
      };

      mockIOCContainer.listClass.mockReturnValue(mockComponentList);
      mockIOCContainer.getClassMetadata.mockReturnValue(mockMetadata);
      mockIOCContainer.get.mockReturnValue(mockInstance);

      await injectSchedule({} as any);

      // 获取CronJob的回调函数
      const cronJobCall = mockCronJob.mock.calls[0];
      const cronCallback = cronJobCall[1] as (...args: any) => any;

      // 执行回调函数
      await cronCallback();

      expect(mockTaskMethod).toHaveBeenCalled();
      expect(mockLogger.Debug).toHaveBeenCalledWith(
        "The schedule job COMPONENT:TaskService_testTask started."
      );
      expect(mockLogger.Debug).toHaveBeenCalledWith(
        "The schedule job COMPONENT:TaskService_testTask completed."
      );
    });

    it("应该处理CronJob回调函数执行失败", async () => {
      const mockComponentList = [
        { id: "COMPONENT:TaskService", target: class TaskService {} }
      ];

      const mockMetadata = [
        {
          method: "failingTask",
          cron: "0 0 * * * *"
        }
      ];

      const mockTaskMethod = jest.fn().mockRejectedValue(new Error("Task execution failed"));
      const mockInstance = {
        failingTask: mockTaskMethod
      };

      mockIOCContainer.listClass.mockReturnValue(mockComponentList);
      mockIOCContainer.getClassMetadata.mockReturnValue(mockMetadata);
      mockIOCContainer.get.mockReturnValue(mockInstance);

      await injectSchedule({} as any);

      // 获取CronJob的回调函数
      const cronJobCall = mockCronJob.mock.calls[0];
      const cronCallback = cronJobCall[1] as (...args: any) => any;

      // 执行回调函数
      await cronCallback();

      expect(mockTaskMethod).toHaveBeenCalled();
      expect(mockLogger.Debug).toHaveBeenCalledWith(
        "The schedule job COMPONENT:TaskService_failingTask started."
      );
      // 等待Promise.resolve().catch()完成
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockLogger.Error).toHaveBeenCalledWith(
        "The schedule job COMPONENT:TaskService_failingTask failed:",
        expect.any(Error)
      );
    });

    it("应该记录调度任务统计信息", async () => {
      const mockComponentList = [
        { id: "COMPONENT:TaskService", target: class TaskService {} }
      ];

      const mockMetadata = [
        {
          method: "task1",
          cron: "0 0 1 * * *"
        },
        {
          method: "task2",
          cron: "0 0 2 * * *"
        }
      ];

      const mockInstance = {
        task1: jest.fn(),
        task2: jest.fn()
      };

      mockIOCContainer.listClass.mockReturnValue(mockComponentList);
      mockIOCContainer.getClassMetadata.mockReturnValue(mockMetadata);
      mockIOCContainer.get.mockReturnValue(mockInstance);

      await injectSchedule({} as any);

      expect(mockLogger.Info).toHaveBeenCalledWith(
        "Batch schedule injection completed. 2 jobs registered."
      );
    });
  });
});
