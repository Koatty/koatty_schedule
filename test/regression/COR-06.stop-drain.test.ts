import { EventEmitter } from 'events';
import { runScheduledTask, stopSchedule, resetScheduleState, getRunningTaskCount, initSchedule } from '../../src/process/schedule';
import { runWithBoundedLock } from '../../src/process/locker';

afterEach(resetScheduleState);
test('shutdown drops queued runs, rejects new ticks, and waits on appStop', async () => {
  resetScheduleState();
  const app = new EventEmitter();
  await initSchedule({}, app as any);
  let release!: () => void;
  const work = jest.fn(() => new Promise<void>(resolve => { release = resolve; }));
  runScheduledTask('job', work, 'queue');
  await Promise.resolve();
  runScheduledTask('job', work, 'queue');
  const stopped = app.rawListeners('appStop')[0].call(app);
  expect(stopped).toBeInstanceOf(Promise);
  expect(getRunningTaskCount()).toBe(1);
  runScheduledTask('job', work, 'allow');
  release();
  await stopped;
  await stopSchedule();
  expect(work).toHaveBeenCalledTimes(1);
  expect(getRunningTaskCount()).toBe(0);
});

test('hold limit aborts business and settles the renewal callback once', async () => {
  const released = jest.fn();
  const backend = { using: async (_r: any, _t: any, _s: any, fn: any) => {
    try { return await fn(new AbortController().signal); } finally { released(); }
  } };
  let signal!: AbortSignal;
  const work = jest.fn((s: AbortSignal) => { signal = s; return new Promise(() => {}); });
  await expect(runWithBoundedLock(backend as any, 'key', 1000, 10, 'work', work)).rejects.toThrow('exceeded maxHoldTime');
  expect(signal.aborted).toBe(true);
  expect(work).toHaveBeenCalledTimes(1);
  expect(released).toHaveBeenCalledTimes(1);
});
