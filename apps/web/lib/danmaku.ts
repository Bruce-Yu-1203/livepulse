export const danmakuDensities = ['low', 'medium', 'high'] as const;

export type DanmakuDensity = (typeof danmakuDensities)[number];

const layouts: Record<DanmakuDensity, { lanes: number; limit: number }> = {
  high: { lanes: 8, limit: 14 },
  low: { lanes: 4, limit: 4 },
  medium: { lanes: 6, limit: 8 },
};

export function danmakuLayout(density: DanmakuDensity): {
  lanes: number;
  limit: number;
} {
  return layouts[density];
}
