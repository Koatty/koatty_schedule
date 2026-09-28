/**
 * COR-06 regression tests (C-4): @Scheduled overlap policy + bounded drain.
 *
 * Plan contract:
 *   @Scheduled(expr, { overlap: 'skip' })   // default: a tick during a run is dropped
 *   @Scheduled(expr, { overlap: 'queue' })  // at most one follow-up run
 *   @Scheduled(expr, { overlap: 'allow' })  // legacy: overlapping runs
 *   shutdown                                // stop jobs, wait for the running one
 *
 * @license: MIT
 */
import {
  runScheduledTask,
  stopSchedule,
  getRunningTaskCount,
  resetScheduleState,
} from '../../src/process/schedule';
import { Scheduled } from '../../src/decorator/scheduled';
import { IOCContainer } from 'koatty_container';
import { COMPONENT_SCHEDULED, DecoratorType } from '../../src/config/config';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('COR-06: @Scheduled overlap policy', () => {
  afterEach(() => {
    resetScheduleState();
  });

  it("'skip' (default) drops a tick that fires while the task is running", async () => {
    let calls = 0;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => (release = resolve));

    const body = () => {
      calls++;
      return blocked;
    };

    runScheduledTask('skip-job', body, 'skip');
    await sleep(0);
    runScheduledTask('skip-job', body, 'skip'); // must be dropped
    runScheduledTask('skip-job', body, 'skip'); // must be dropped

    expect(calls).toBe(1);
    release();
    await sleep(5);
    expect(calls).toBe(1);
    expect(getRunningTaskCount()).toBe(0);
  });

  it("'queue' remembers exactly one follow-up run", async () => {
    let calls = 0;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => (release = resolve));

    const body = async () => {
      calls++;
      if (calls === 1) await blocked;
    };

    runScheduledTask('queue-job', body, 'queue');
    await sleep(0);
    runScheduledTask('queue-job', body, 'queue'); // queued
    runScheduledTask('queue-job', body, 'queue'); // dropped: one is already queued
    runScheduledTask('queue-job', body, 'queue'); // dropped

    expect(calls).toBe(1);

    release();
    await sleep(10);
    expect(calls).toBe(2);
  });

  it("'allow' keeps the legacy overlapping behaviour", async () => {
    let calls = 0;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => (release = resolve));

    const body = () => {
      calls++;
      return blocked;
    };

    runScheduledTask('allow-job', body, 'allow');
    runScheduledTask('allow-job', body, 'allow');
    await sleep(0);

    expect(calls).toBe(2);
    release();
    await sleep(5);
  });

  it('a failing run releases the guard so the next tick still executes', async () => {
    let calls = 0;
    runScheduledTask('failing-job', () => {
      calls++;
      throw new Error('boom');
    }, 'skip');
    await sleep(5);
    runScheduledTask('failing-job', () => {
      calls++;
    }, 'skip');
    await sleep(5);

    expect(calls).toBe(2);
    expect(getRunningTaskCount()).toBe(0);
  });

  it('stopSchedule waits for the in-flight task, bounded by the drain timeout', async () => {
    let finished = false;
    runScheduledTask('drain-job', async () => {
      await sleep(60);
      finished = true;
    }, 'skip');
    await sleep(0);

    await stopSchedule(2000);
    expect(finished).toBe(true);
    expect(getRunningTaskCount()).toBe(0);

    // a task that never finishes must not block shutdown forever
    runScheduledTask('stuck-job', () => new Promise<void>(() => undefined), 'skip');
    await sleep(0);
    const started = Date.now();
    await stopSchedule(50);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('the decorator accepts both the legacy timezone and the options object', () => {
    const legacy: any = (Scheduled as any)('*/5 * * * * *', 'Asia/Shanghai');
    expect(legacy).toBeDefined();
    const withOptions: any = (Scheduled as any)('*/5 * * * * *', { overlap: 'queue', timezone: 'UTC' });
    expect(withOptions).toBeDefined();
    expect(() => (Scheduled as any)('*/5 * * * * *', { overlap: 'nope' })).toThrow(/Invalid overlap policy/);
  });

  it('stores the overlap policy in the IOC metadata', () => {
    const getTypeSpy = jest.spyOn(IOCContainer, 'getType').mockReturnValue('COMPONENT' as any);
    const attachSpy = jest
      .spyOn(IOCContainer, 'attachClassMetadata')
      .mockImplementation(() => undefined as any);
    const saveSpy = jest.spyOn(IOCContainer, 'saveClass').mockImplementation(() => undefined as any);

    class OverlapComponent {
      run() { /* noop */ }
    }
    const descriptor = Object.getOwnPropertyDescriptor(OverlapComponent.prototype, 'run')!;
    const decorator = (Scheduled as any)('*/5 * * * * *', { overlap: 'queue' });
    decorator(OverlapComponent.prototype, 'run', descriptor);

    expect(attachSpy).toHaveBeenCalledWith(
      COMPONENT_SCHEDULED,
      DecoratorType.SCHEDULED,
      expect.objectContaining({ method: 'run', overlap: 'queue' }),
      OverlapComponent.prototype,
      'run'
    );

    getTypeSpy.mockRestore();
    attachSpy.mockRestore();
    saveSpy.mockRestore();
  });
});
