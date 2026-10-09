'use client';

import {
  ApiErrorResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
} from '@livepulse/contracts';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { readBrowserCookie } from '../../lib/browser-cookies';

type AuthMode = 'login' | 'register';
type FormStatus =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; message: string };

export function AuthPanel() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [status, setStatus] = useState<FormStatus>({ kind: 'idle' });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ kind: 'pending' });

    const form = new FormData(event.currentTarget);
    const input = {
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    };
    const requestSchema =
      mode === 'login' ? LoginRequestSchema : RegisterRequestSchema;
    const parsed = requestSchema.safeParse(input);

    if (!parsed.success) {
      setStatus({
        kind: 'error',
        message:
          'Enter a valid email and a password of at least 12 characters.',
      });
      return;
    }

    try {
      const csrfResponse = await fetch('/api/v1/auth/csrf', {
        credentials: 'include',
      });

      if (!csrfResponse.ok) {
        throw new Error('Could not start a secure authentication request.');
      }

      const csrfToken = readBrowserCookie(document.cookie, 'lp_csrf');

      if (!csrfToken) {
        throw new Error('The secure request cookie is missing.');
      }

      const response = await fetch(`/api/v1/auth/${mode}`, {
        body: JSON.stringify(parsed.data),
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        method: 'POST',
      });
      const body: unknown = await response.json();

      if (!response.ok) {
        const apiError = ApiErrorResponseSchema.safeParse(body);
        throw new Error(
          apiError.success ? apiError.data.message : 'Authentication failed.',
        );
      }

      if (mode === 'login') {
        LoginResponseSchema.parse(body);
        setStatus({ kind: 'success', message: 'Signed in successfully.' });
        window.location.assign('/');
        return;
      }

      RegisterResponseSchema.parse(body);
      setMode('login');
      setStatus({
        kind: 'success',
        message: 'Account created. You can sign in now.',
      });
    } catch (error) {
      setStatus({
        kind: 'error',
        message:
          error instanceof Error ? error.message : 'Authentication failed.',
      });
    }
  }

  function selectMode(nextMode: AuthMode) {
    setMode(nextMode);
    setStatus({ kind: 'idle' });
  }

  return (
    <section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
      <div className="grid grid-cols-2 rounded-full bg-black/30 p-1 text-sm">
        <ModeButton
          active={mode === 'login'}
          label="Sign in"
          onClick={() => selectMode('login')}
        />
        <ModeButton
          active={mode === 'register'}
          label="Create account"
          onClick={() => selectMode('register')}
        />
      </div>

      <div className="mt-8">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
          {mode === 'login' ? 'Welcome back' : 'Join the room'}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
          {mode === 'login'
            ? 'Continue your live experience.'
            : 'Create your LivePulse identity.'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          {mode === 'login'
            ? 'Your session stays in secure, HTTP-only cookies.'
            : 'New accounts begin as viewers. Host onboarding comes next.'}
        </p>
      </div>

      <form className="mt-8 space-y-5" onSubmit={submit}>
        <label className="block text-sm font-medium text-zinc-300">
          Email
          <input
            autoComplete="email"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3.5 text-white outline-none transition placeholder:text-zinc-600 focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-300/10"
            name="email"
            placeholder="you@example.com"
            required
            type="email"
          />
        </label>
        <label className="block text-sm font-medium text-zinc-300">
          Password
          <input
            autoComplete={
              mode === 'login' ? 'current-password' : 'new-password'
            }
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3.5 text-white outline-none transition placeholder:text-zinc-600 focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-300/10"
            minLength={12}
            name="password"
            placeholder="At least 12 characters"
            required
            type="password"
          />
        </label>

        {status.kind === 'error' || status.kind === 'success' ? (
          <p
            className={`rounded-2xl border px-4 py-3 text-sm ${
              status.kind === 'error'
                ? 'border-rose-400/20 bg-rose-400/10 text-rose-200'
                : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200'
            }`}
            role="status"
          >
            {status.message}
          </p>
        ) : null}

        <button
          className="w-full rounded-2xl bg-cyan-300 px-5 py-3.5 font-bold text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-60"
          disabled={status.kind === 'pending'}
          type="submit"
        >
          {status.kind === 'pending'
            ? 'Securing request…'
            : mode === 'login'
              ? 'Sign in'
              : 'Create account'}
        </button>
      </form>
    </section>
  );
}

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick(): void;
}) {
  return (
    <button
      className={`rounded-full px-3 py-2.5 font-medium transition ${
        active ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:text-white'
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
