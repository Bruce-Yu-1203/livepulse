'use client';

import { useEffect } from 'react';

export const LEAVE_STUDIO_MESSAGE =
  'Leaving the studio stops your broadcast. Viewers will see a waiting screen until you come back. Leave anyway?';

export interface LeaveClick {
  altKey: boolean;
  button: number;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface LeaveAnchor {
  download: boolean;
  href: string;
  target: string;
}

/**
 * Whether a click on this anchor would navigate the current tab to another
 * page of the app, which unmounts the studio and stops the broadcast. New
 * tabs, downloads, other sites and in-page hash links are left alone.
 */
export function isInAppNavigation(
  click: LeaveClick,
  anchor: LeaveAnchor,
  current: Pick<URL, 'href' | 'origin'>,
): boolean {
  if (
    click.defaultPrevented ||
    click.button !== 0 ||
    click.metaKey ||
    click.ctrlKey ||
    click.shiftKey ||
    click.altKey ||
    anchor.download ||
    (anchor.target !== '' && anchor.target !== '_self') ||
    !anchor.href
  ) {
    return false;
  }

  let destination: URL;
  try {
    destination = new URL(anchor.href, current.href);
  } catch {
    return false;
  }

  if (destination.origin !== current.origin) {
    return false;
  }

  const here = new URL(current.href);
  return (
    destination.pathname !== here.pathname || destination.search !== here.search
  );
}

/**
 * While a broadcast is on air, ask before a reload, tab close or in-app link
 * takes the host away from the studio.
 */
export function useLeaveStudioGuard(active: boolean) {
  useEffect(() => {
    if (!active) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers still need a return value to show the prompt.
      event.returnValue = '';
    };

    // Capture phase runs before Next.js handles the link click.
    const handleClick = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>('a[href]')
          : null;

      if (
        !anchor ||
        !isInAppNavigation(
          event,
          {
            download: anchor.hasAttribute('download'),
            href: anchor.href,
            target: anchor.target,
          },
          new URL(window.location.href),
        )
      ) {
        return;
      }

      if (!window.confirm(LEAVE_STUDIO_MESSAGE)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleClick, true);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleClick, true);
    };
  }, [active]);
}
