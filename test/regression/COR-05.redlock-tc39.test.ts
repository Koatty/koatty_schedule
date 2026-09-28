/**
 * COR-05 regression test (C-3) — TC39 decorator path.
 *
 * The `@RedLock` TC39 branch (used when the container passes a TC39 decorator
 * context) must follow the same contract as the legacy branch:
 *   - the business method runs exactly once (no timeout-triggered re-run);
 *   - the lock is kept alive by the redlock library's `using()` auto-extension;
 *   - exceeding `maxHoldTime` fails the call instead of re-running the method.
 *
 * This test also guards the TC39 branch against missing imports on its error
 * paths (e.g. a logger that is used but not imported).
 *
 * @license: BSD (3-Clause)
 */

import { RedLock } from "../../src/decorator/redlock";
import { RedLocker } from "../../src/locker/redlock";

jest.mock("koatty_container", () => ({
  IOCContainer: {
    // Return the handler itself so the test can drive both branches directly.
    createDecorator: (handler: any) => handler,
    getType: jest.fn(() => "SERVICE"),
    saveClass: jest.fn(),
    getIdentifier: jest.fn(() => "TestService"),
  },
}));

jest.mock("koatty_logger", () => ({
  DefaultLogger: {
    Error: jest.fn(),
    Warn: jest.fn(),
    Info: jest.fn(),
    Debug: jest.fn(),
  },
}));

jest.mock("../../src/locker/redlock", () => ({
  RedLocker: { getInstance: jest.fn() },
}));

const mockRedLocker = RedLocker as unknown as { getInstance: jest.Mock };

describe("COR-05: @RedLock TC39 branch", () => {
  let usingMock: jest.Mock;

  beforeEach(() => {
    usingMock = jest.fn(async (_resources: string[], _ttl: number, _settings: any, handler: any) =>
      handler(new AbortController().signal)
    );
    mockRedLocker.getInstance.mockReturnValue({ using: usingMock, initialize: jest.fn() });
  });

  function applyTc39Decorator(originalMethod: (...args: any[]) => any, options: any) {
    // createDecorator is mocked to return the handler as-is, so calling the
    // factory with the handler payload drives the TC39 branch.
    const handler: any = RedLock("cor05-lock", options);
    return handler({
      target: { constructor: { name: "TestService" } },
      methodName: "testMethod",
      descriptor: {
        value: originalMethod,
        writable: true,
        enumerable: false,
        configurable: true,
      },
      method: originalMethod,
      context: { kind: "method", name: "testMethod", addInitializer: jest.fn() },
    }) as (...args: any[]) => Promise<unknown>;
  }

  it("runs the business method exactly once under an auto-renewed lock", async () => {
    let callCount = 0;
    const method = jest.fn(async () => {
      callCount++;
      if (callCount > 1) {
        throw new Error("business method must not be re-run");
      }
      return "ok";
    });

    const wrapped = applyTc39Decorator(method, { lockTimeOut: 1000 });

    await expect(wrapped.call({})).resolves.toBe("ok");
    expect(method).toHaveBeenCalledTimes(1);
    expect(usingMock).toHaveBeenCalledWith(
      ["cor05-lock"],
      1000,
      500,
      expect.any(Function)
    );
    // the AbortSignal is handed to the business method
    expect(method).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
  });

  it("fails on maxHoldTime instead of re-running the method", async () => {
    const method = jest.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return "late";
    });

    const wrapped = applyTc39Decorator(method, { lockTimeOut: 1000, maxHoldTime: 5 });

    await expect(wrapped.call({})).rejects.toThrow(/exceeded maxHoldTime/);
    expect(method).toHaveBeenCalledTimes(1);
  });

  it("propagates a lost lock (aborted signal) without re-running", async () => {
    const controller = new AbortController();
    controller.abort(new Error("renewal failed"));
    usingMock.mockImplementation(async (_resources: string[], _ttl: number, _settings: any, handler: any) =>
      handler(controller.signal)
    );

    const method = jest.fn(async () => "completed-anyway");
    const wrapped = applyTc39Decorator(method, { lockTimeOut: 1000 });

    await expect(wrapped.call({})).rejects.toThrow("renewal failed");
    expect(method).toHaveBeenCalledTimes(1);
  });
});