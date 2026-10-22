import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { THEME_STORAGE_KEY } from '../lib/theme';
import { ThemeToggle } from './theme-toggle';

type ClickHandler = () => void;

function findClickHandler(): ClickHandler {
  const element = ThemeToggle() as { props: { onClick: ClickHandler } };
  return element.props.onClick;
}

describe('ThemeToggle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders an accessible button with both icons', () => {
    const html = renderToStaticMarkup(<ThemeToggle />);

    expect(html).toContain('aria-label="Switch between light and dark mode"');
    expect(html).toContain('theme-toggle-sun');
    expect(html).toContain('theme-toggle-moon');
  });

  it('flips the document theme and remembers the choice', () => {
    const root = { dataset: { theme: 'dark' }, style: { colorScheme: '' } };
    const setItem = vi.fn();
    vi.stubGlobal('document', { documentElement: root });
    vi.stubGlobal('localStorage', { setItem });

    findClickHandler()();
    expect(root.dataset.theme).toBe('light');
    expect(root.style.colorScheme).toBe('light');
    expect(setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'light');

    findClickHandler()();
    expect(root.dataset.theme).toBe('dark');
  });

  it('still switches when storage is blocked', () => {
    const root = { dataset: { theme: 'light' }, style: { colorScheme: '' } };
    vi.stubGlobal('document', { documentElement: root });
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('blocked');
      },
    });

    findClickHandler()();
    expect(root.dataset.theme).toBe('dark');
  });
});
