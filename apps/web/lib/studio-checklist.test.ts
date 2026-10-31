import { describe, expect, it } from 'vitest';

import { studioChecklist, studioReadyToStart } from './studio-checklist';

describe('studio checklist', () => {
  it('needs details and a video preview but not the microphone', () => {
    const items = studioChecklist({
      detailsReady: true,
      microphoneEnabled: false,
      previewReady: true,
    });

    expect(items.map((item) => [item.label, item.done])).toEqual([
      ['Title and description', true],
      ['Video preview', true],
      ['Microphone off', false],
    ]);
    expect(studioReadyToStart(items)).toBe(true);
  });

  it('blocks going live until the details and preview are ready', () => {
    expect(
      studioReadyToStart(
        studioChecklist({
          detailsReady: false,
          microphoneEnabled: true,
          previewReady: true,
        }),
      ),
    ).toBe(false);
    expect(
      studioReadyToStart(
        studioChecklist({
          detailsReady: true,
          microphoneEnabled: true,
          previewReady: false,
        }),
      ),
    ).toBe(false);
  });
});
