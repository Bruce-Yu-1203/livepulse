import { describe, expect, it } from 'vitest';

import { maximumAvatarBytes, validateAvatarFile } from './avatar-upload';

describe('validateAvatarFile', () => {
  it('accepts supported images within the size limit', () => {
    expect(
      validateAvatarFile({ type: 'image/png', size: 300_000 } as File),
    ).toBeUndefined();
  });

  it('rejects unsupported, empty, and oversized files', () => {
    expect(
      validateAvatarFile({ type: 'image/svg+xml', size: 500 } as File),
    ).toContain('JPEG');
    expect(
      validateAvatarFile({ type: 'image/jpeg', size: 0 } as File),
    ).toContain('2 MB');
    expect(
      validateAvatarFile({
        type: 'image/webp',
        size: maximumAvatarBytes + 1,
      } as File),
    ).toContain('2 MB');
  });
});
