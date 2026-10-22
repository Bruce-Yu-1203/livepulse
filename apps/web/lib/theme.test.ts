import { describe, expect, it } from 'vitest';

import {
  isTheme,
  nextTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  themeInitScript,
} from './theme';

describe('theme helpers', () => {
  it('accepts only known themes', () => {
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('light')).toBe(true);
    expect(isTheme('system')).toBe(false);
    expect(isTheme(null)).toBe(false);
  });

  it('prefers a saved choice over the system preference', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('falls back to the system preference', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme('bogus', false)).toBe('light');
  });

  it('toggles between light and dark', () => {
    expect(nextTheme('dark')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
  });

  it('applies the saved theme before paint', () => {
    expect(themeInitScript).toContain(THEME_STORAGE_KEY);
    expect(themeInitScript).toContain('prefers-color-scheme: dark');
    expect(themeInitScript).toContain('dataset.theme');
    expect(() => new Function(themeInitScript)).not.toThrow();
  });
});
