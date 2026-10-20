'use client';

import {
  AuthProvidersResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
  SocialSignInResponseSchema,
} from '@livepulse/contracts';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import { clientApiRequest } from '../../lib/client-api';

type AuthMode = 'login' | 'register';
type FormStatus =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; message: string };

export function AuthPanel() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [google, setGoogle] = useState({ enabled: false, loading: true });
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<FormStatus>({ kind: 'idle' });

  useEffect(() => {
    let active = true;

    const oauthError = new URLSearchParams(window.location.search).get('error');
    if (oauthError) {
      setStatus({ kind: 'error', message: oauthErrorMessage(oauthError) });
    }

    void clientApiRequest('/api/v1/auth/providers', AuthProvidersResponseSchema)
      .then((response) => {
        if (active) {
          setGoogle({
            enabled: response.providers.includes('google'),
            loading: false,
          });
        }
      })
      .catch(() => {
        if (active) {
          setGoogle({ enabled: false, loading: false });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function signInWithGoogle() {
    setStatus({ kind: 'pending' });

    try {
      const origin = window.location.origin;
      const response = await clientApiRequest(
        '/api/v1/auth/sign-in/social',
        SocialSignInResponseSchema,
        {
          body: JSON.stringify({
            callbackURL: origin,
            disableRedirect: true,
            errorCallbackURL: `${origin}/auth`,
            provider: 'google',
          }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      );

      window.location.assign(response.url);
    } catch (error) {
      setStatus({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Google authentication failed.',
      });
    }
  }

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
      const response = await clientApiRequest(
        `/api/v1/auth/${mode === 'login' ? 'sign-in/email' : 'sign-up/email'}`,
        mode === 'login' ? LoginResponseSchema : RegisterResponseSchema,
        {
          body: JSON.stringify({
            ...parsed.data,
            ...(mode === 'register'
              ? { name: parsed.data.email.split('@')[0] }
              : {}),
          }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      );

      if (mode === 'login') {
        const login = LoginResponseSchema.parse(response);
        setStatus({ kind: 'success', message: 'Signed in successfully.' });
        window.location.assign(
          ['ADMIN', 'HOST'].includes(login.user.role) ? '/studio' : '/',
        );
        return;
      }

      RegisterResponseSchema.parse(response);
      setStatus({ kind: 'success', message: 'Account created.' });
      window.location.assign('/');
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

      <button
        className="mt-8 flex w-full items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white px-5 py-3.5 font-semibold text-zinc-950 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={
          google.loading || !google.enabled || status.kind === 'pending'
        }
        onClick={() => void signInWithGoogle()}
        type="button"
      >
        <GoogleMark />
        {google.loading
          ? 'Checking Google sign-in…'
          : google.enabled
            ? 'Continue with Google'
            : 'Google sign-in unavailable'}
      </button>

      <div className="my-7 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600">
        <span className="h-px flex-1 bg-white/10" />
        <span>or use email</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <form className="space-y-5" onSubmit={submit}>
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
        <div className="text-sm font-medium text-zinc-300">
          <label htmlFor="auth-password">Password</label>
          <span className="relative mt-2 block">
            <input
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3.5 pr-20 text-white outline-none transition placeholder:text-zinc-600 focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-300/10"
              id="auth-password"
              minLength={12}
              name="password"
              placeholder="At least 12 characters"
              required
              type={showPassword ? 'text' : 'password'}
            />
            <button
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-3 my-auto h-fit rounded-lg px-2 py-1 text-xs font-semibold text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
              onClick={() => setShowPassword((current) => !current)}
              type="button"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </span>
        </div>

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

export function oauthErrorMessage(error: string): string {
  const normalized = error.trim().toLowerCase().replaceAll('-', '_');

  if (normalized.includes('access_denied')) {
    return 'Google sign-in was cancelled. You can try again when ready.';
  }

  if (normalized.includes('account_not_linked')) {
    return 'This email is already linked to another sign-in method.';
  }

  if (normalized.includes('email') && normalized.includes('verified')) {
    return 'Google could not provide a verified email for this account.';
  }

  return 'Google sign-in could not be completed. Please try again.';
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24">
      <path
        d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.6Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 5-.9 6.8-2.3l-3.3-2.6c-.9.6-2.1 1-3.5 1a6 6 0 0 1-5.6-4.2H3v2.7A10.3 10.3 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.4 13.9a6.2 6.2 0 0 1 0-3.8V7.4H3a10.2 10.2 0 0 0 0 9.2l3.4-2.7Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.8 9.8 0 0 0 12 2a10.3 10.3 0 0 0-9 5.4l3.4 2.7A6 6 0 0 1 12 5.9Z"
        fill="#EA4335"
      />
    </svg>
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
