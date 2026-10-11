import { describe, expect, it } from 'vitest';

import { danmakuDensities, danmakuLayout } from './danmaku';

describe('danmaku display preferences', () => {
  it('offers bounded low, medium, and high density layouts', () => {
    expect(danmakuDensities).toEqual(['low', 'medium', 'high']);
    expect(danmakuLayout('low')).toEqual({ lanes: 4, limit: 4 });
    expect(danmakuLayout('medium')).toEqual({ lanes: 6, limit: 8 });
    expect(danmakuLayout('high')).toEqual({ lanes: 8, limit: 14 });
  });

  it('increases both visible messages and lanes with density', () => {
    const low = danmakuLayout('low');
    const medium = danmakuLayout('medium');
    const high = danmakuLayout('high');

    expect(low.limit).toBeLessThan(medium.limit);
    expect(medium.limit).toBeLessThan(high.limit);
    expect(low.lanes).toBeLessThan(high.lanes);
  });
});
