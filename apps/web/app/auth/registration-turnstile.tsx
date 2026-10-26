'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef } from 'react';

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      action: string;
      callback(token: string): void;
      'error-callback'(): boolean;
      'expired-callback'(): void;
      sitekey: string;
    },
  ): string;
  remove(widgetId: string): void;
  reset(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const registrationTurnstileSiteKey =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
  (process.env.NODE_ENV === 'production' ? '' : '1x00000000000000000000AA');

export function RegistrationTurnstile({
  action = 'registration',
  onToken,
  resetKey,
}: {
  action?: 'login' | 'registration';
  onToken(token: string | undefined): void;
  resetKey: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string>(undefined);
  const onTokenRef = useRef(onToken);
  const lastResetKeyRef = useRef(resetKey);
  onTokenRef.current = onToken;

  const render = useCallback(() => {
    if (
      !registrationTurnstileSiteKey ||
      !containerRef.current ||
      !window.turnstile ||
      widgetIdRef.current
    ) {
      return;
    }

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      action,
      callback: (token) => onTokenRef.current(token),
      'error-callback': () => {
        onTokenRef.current(undefined);
        return true;
      },
      'expired-callback': () => onTokenRef.current(undefined),
      sitekey: registrationTurnstileSiteKey,
    });
  }, [action]);

  useEffect(() => {
    render();
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = undefined;
    };
  }, [render]);

  useEffect(() => {
    if (resetKey === lastResetKeyRef.current) return;
    lastResetKeyRef.current = resetKey;
    if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
  }, [resetKey]);

  if (!registrationTurnstileSiteKey) {
    return (
      <p className="text-sm text-danger" role="status">
        Human verification is unavailable.
      </p>
    );
  }

  return (
    <div aria-label="Human verification" role="group">
      <Script
        onReady={render}
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
      />
      <div ref={containerRef} />
    </div>
  );
}
