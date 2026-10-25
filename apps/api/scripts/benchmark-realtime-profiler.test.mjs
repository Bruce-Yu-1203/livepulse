import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';

import {
  createStageProfiler,
  summarize,
  waitForExclusiveSignal,
} from './benchmark-realtime-profiler.mjs';

describe('realtime benchmark profiler', () => {
  it('summarizes empty and populated latency samples', () => {
    expect(summarize([])).toEqual({
      count: 0,
      p50: null,
      p95: null,
      p99: null,
      max: null,
    });
    expect(summarize([1, 2, 3, 4, 5])).toEqual({
      count: 5,
      p50: 3,
      p95: 5,
      p99: 5,
      max: 5,
    });
  });

  it('records only the active window, including failed operations', async () => {
    const profiler = createStageProfiler();
    const target = {
      async create(value) {
        if (value === 'fail') throw new Error('insertion failed');
        return value;
      },
    };
    profiler.wrap(
      target,
      'create',
      'postgresInsertMs',
      (value) => value !== 'skip',
    );

    await target.create('before');
    profiler.start();
    expect(await target.create('saved')).toBe('saved');
    await target.create('skip');
    await expect(target.create('fail')).rejects.toThrow('insertion failed');
    profiler.stop();
    await target.create('after');

    expect(profiler.snapshot().postgresInsertMs.count).toBe(2);
    profiler.start();
    expect(profiler.snapshot().postgresInsertMs.count).toBe(0);
  });

  it('preserves a synchronous broadcast method and records its calls', () => {
    const profiler = createStageProfiler();
    const target = {
      broadcastLocal(event) {
        return event.type;
      },
    };
    profiler.wrapSync(
      target,
      'broadcastLocal',
      'localBroadcastMs',
      (event) => event.type === 'message.created',
    );

    profiler.start();
    expect(target.broadcastLocal({ type: 'message.created' })).toBe(
      'message.created',
    );
    target.broadcastLocal({ type: 'room.ended' });
    expect(profiler.snapshot().localBroadcastMs.count).toBe(1);
  });

  it('records Redis rate limit calls separately from publication', async () => {
    const profiler = createStageProfiler();
    const limiter = { consumeMessageToken: async () => undefined };
    profiler.wrap(limiter, 'consumeMessageToken', 'redisRateLimitMs');

    profiler.start();
    await limiter.consumeMessageToken();

    expect(profiler.snapshot().redisRateLimitMs.count).toBe(1);
    expect(profiler.snapshot().redisMessagePublishMs.count).toBe(0);
  });

  it('reserves the benchmark completion signal for report generation', async () => {
    const emitter = new EventEmitter();
    let priorListenerCalled = false;
    emitter.on('SIGUSR2', () => {
      priorListenerCalled = true;
    });

    const completed = waitForExclusiveSignal(emitter, 'SIGUSR2');
    emitter.emit('SIGUSR2');
    await completed;

    expect(priorListenerCalled).toBe(false);
  });
});
