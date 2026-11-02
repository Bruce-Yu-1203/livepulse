import { describe, expect, it } from 'vitest';

import { estimatePersistenceDelays } from './benchmark-pipeline-persistence-delay.mjs';

function sample(epochMs, rows) {
  return { epoch_ms: epochMs, danmaku_rows: rows };
}

describe('persistence delay estimate', () => {
  it('reports zero delay when rows keep pace with sends', () => {
    // 2 messages/s from t=0; rows include 5 warm-up rows before the window.
    const samples = [0, 1_000, 2_000, 3_000].map((time) =>
      sample(time, 5 + Math.min(4, (time / 1_000) * 2)),
    );
    expect(
      estimatePersistenceDelays({
        samples,
        generators: [
          {
            windowStartedAtEpochMs: 0,
            messagesPerSecond: 2,
            persistedIndexes: [0, 1, 2, 3],
          },
        ],
        warmupRows: [],
      }),
    ).toMatchObject({
      messages: 4,
      estimated: 4,
      p95Seconds: 0,
      maxSeconds: 0,
    });
  });

  it('measures a backlog that is written several seconds late', () => {
    // 1 message/s; nothing is stored until t=6 s, then everything at once.
    const samples = [0, 1, 2, 3, 4, 5, 6, 7].map((second) =>
      sample(second * 1_000, second < 6 ? 0 : 6),
    );
    const result = estimatePersistenceDelays({
      samples,
      generators: [
        {
          windowStartedAtEpochMs: 0,
          messagesPerSecond: 1,
          persistedIndexes: [0, 1, 2, 3, 4, 5],
        },
      ],
      warmupRows: [],
    });
    expect(result.maxSeconds).toBe(5);
    expect(result.p50Seconds).toBe(2);
    expect(result.worstTenSecondFromSecond).toBe(0);
  });

  it('ignores failed messages and a later generator warm-up', () => {
    // Index 1 failed and was never stored. Generator B warmed up with 3 rows
    // before its window started at t=2 s and then sent one stored message.
    const samples = [
      sample(0, 0),
      sample(1_000, 1),
      sample(1_500, 4),
      sample(2_000, 4),
      sample(3_000, 6),
    ];
    const result = estimatePersistenceDelays({
      samples,
      generators: [
        {
          windowStartedAtEpochMs: 0,
          messagesPerSecond: 1,
          persistedIndexes: [0, 2],
        },
        {
          windowStartedAtEpochMs: 2_000,
          messagesPerSecond: 1,
          persistedIndexes: [0],
        },
      ],
      warmupRows: [{ afterEpochMs: 2_000, rows: 3 }],
    });
    expect(result).toMatchObject({ messages: 3, estimated: 3, maxSeconds: 0 });
  });
});
