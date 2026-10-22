'use client';

import {
  ApiErrorCode,
  AuthProvidersResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  RegisterRequestSchema,
  RegistrationCompleteResponseSchema,
  RegistrationEmailSchema,
  RegistrationStartResponseSchema,
  SocialSignInResponseSchema,
} from '@livepulse/contracts';
import type { FormEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { ClientApiError, clientApiRequest } from '../../lib/client-api';

export type AuthMode = 'login' | 'register';
type RegistrationStep = 'email' | 'credentials' | 'verification';
type FormStatus =
  { kind: 'idle' | 'pending' } | { kind: 'error'; message: string };
type FieldErrors = Partial<
  Record<'email' | 'username' | 'password' | 'code', string>
>;

export function AuthPanel({
  initialMode = 'login',
  onAuthenticated,
}: {
  initialMode?: AuthMode;
  onAuthenticated?: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [step, setStep] = useState<RegistrationStep>('email');
  const [google, setGoogle] = useState({ enabled: false, loading: true });
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<FormStatus>({ kind: 'idle' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [resendAt, setResendAt] = useState(0);
  const [secondsToResend, setSecondsToResend] = useState(0);
  const [challenge, setChallenge] = useState<{
    credentials: string;
    expiresAt: number;
  }>();
  const emailRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const passwordId = useId();
  const emailErrorId = useId();
  const usernameErrorId = useId();
  const passwordErrorId = useId();
  const codeErrorId = useId();

  useEffect(() => {
    let active = true;
    const oauthError = new URLSearchParams(window.location.search).get('error');
    if (oauthError)
      setStatus({ kind: 'error', message: oauthErrorMessage(oauthError) });

    void clientApiRequest('/api/v1/auth/providers', AuthProvidersResponseSchema)
      .then((response) => {
        if (active)
          setGoogle({
            enabled: response.providers.includes('google'),
            loading: false,
          });
      })
      .catch(() => {
        if (active) setGoogle({ enabled: false, loading: false });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (step !== 'verification') return;
    const refresh = () =>
      setSecondsToResend(
        Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)),
      );
    refresh();
    const interval = window.setInterval(refresh, 1000);
    return () => window.clearInterval(interval);
  }, [resendAt, step]);

  function selectMode(nextMode: AuthMode) {
    setMode(nextMode);
    setStatus({ kind: 'idle' });
    setFieldErrors({});
  }

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

  async function finishAuthentication(role: string) {
    if (onAuthenticated) await onAuthenticated();
    else
      window.location.assign(
        ['ADMIN', 'HOST'].includes(role) ? '/studio' : '/',
      );
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = LoginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      setStatus({ kind: 'error', message: 'Enter your email and password.' });
      return;
    }
    setStatus({ kind: 'pending' });
    setFieldErrors({});
    try {
      const login = await clientApiRequest(
        '/api/v1/auth/sign-in/email',
        LoginResponseSchema,
        {
          body: JSON.stringify(parsed.data),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      );
      await finishAuthentication(login.user.role);
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Sign in failed.',
      });
    }
  }

  function continueEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = RegistrationEmailSchema.safeParse(email);
    if (!parsed.success) {
      setFieldErrors({ email: 'Enter a valid email address.' });
      emailRef.current?.focus();
      return;
    }
    setEmail(parsed.data);
    setFieldErrors({});
    setStatus({ kind: 'idle' });
    setStep('credentials');
  }

  async function sendCode(): Promise<boolean> {
    const parsed = RegisterRequestSchema.safeParse({
      email,
      username,
      password,
    });
    if (!parsed.success) {
      const errors = registrationFieldErrors(email, username, password);
      setFieldErrors(errors);
      if (errors.username) usernameRef.current?.focus();
      else passwordRef.current?.focus();
      return false;
    }

    setStatus({ kind: 'pending' });
    setFieldErrors({});
    try {
      const response = await clientApiRequest(
        '/api/v1/auth/registration/start',
        RegistrationStartResponseSchema,
        {
          body: JSON.stringify(parsed.data),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      );
      setEmail(parsed.data.email);
      setUsername(parsed.data.username);
      setChallenge({
        credentials: JSON.stringify(parsed.data),
        expiresAt: Date.now() + response.expiresInSeconds * 1000,
      });
      setResendAt(Date.now() + response.resendAfterSeconds * 1000);
      setCode('');
      setStep('verification');
      setStatus({ kind: 'idle' });
      return true;
    } catch (error) {
      if (
        error instanceof ClientApiError &&
        error.code === ApiErrorCode.UsernameAlreadyExists
      ) {
        setStatus({ kind: 'idle' });
        setFieldErrors({
          username: 'This username is already taken. Choose another.',
        });
        setStep('credentials');
        usernameRef.current?.focus();
      } else if (
        error instanceof ClientApiError &&
        error.code === ApiErrorCode.EmailAlreadyExists
      ) {
        setStatus({ kind: 'idle' });
        setFieldErrors({
          email: 'This email is already registered. Sign in instead.',
        });
        setStep('email');
      } else {
        setStatus({
          kind: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'The code could not be sent.',
        });
      }
      return false;
    }
  }

  async function continueCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = RegisterRequestSchema.safeParse({
      email,
      username,
      password,
    });
    if (
      parsed.success &&
      challenge?.credentials === JSON.stringify(parsed.data) &&
      challenge.expiresAt > Date.now()
    ) {
      setStep('verification');
      return;
    }
    await sendCode();
  }

  async function completeRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setFieldErrors({ code: 'Enter the six-digit code from your email.' });
      codeRef.current?.focus();
      return;
    }
    setStatus({ kind: 'pending' });
    setFieldErrors({});
    try {
      await clientApiRequest(
        '/api/v1/auth/registration/complete',
        RegistrationCompleteResponseSchema,
        {
          body: JSON.stringify({ email, code }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      );
      const login = await clientApiRequest(
        '/api/v1/auth/sign-in/email',
        LoginResponseSchema,
        {
          body: JSON.stringify({ email, password }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      );
      await finishAuthentication(login.user.role);
    } catch (error) {
      if (
        error instanceof ClientApiError &&
        error.code === ApiErrorCode.RegistrationCodeInvalid
      ) {
        setStatus({ kind: 'idle' });
        setFieldErrors({
          code: 'That code is incorrect or expired. Request a new one if needed.',
        });
        codeRef.current?.focus();
      } else if (
        error instanceof ClientApiError &&
        error.code === ApiErrorCode.UsernameAlreadyExists
      ) {
        setStatus({ kind: 'idle' });
        setStep('credentials');
        setFieldErrors({
          username: 'This username is already taken. Choose another.',
        });
      } else {
        setStatus({
          kind: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Registration could not be completed.',
        });
      }
    }
  }

  async function resendCode() {
    if (secondsToResend > 0 || status.kind === 'pending') return;
    await sendCode();
  }

  const pending = status.kind === 'pending';

  return (
    <section className="auth-panel w-full max-w-md rounded-xl border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
      <div className="auth-tab-list grid grid-cols-2 rounded-full bg-black/30 p-1 text-sm">
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

      <div className="auth-heading mt-7">
        <p className="auth-eyebrow text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
          {mode === 'login'
            ? 'Welcome back'
            : `Join the room · ${stepLabel(step)}`}
        </p>
        <h1 className="auth-title mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
          {mode === 'login'
            ? 'Welcome back to the room.'
            : 'Come join the conversation.'}
        </h1>
        <p className="auth-description mt-3 text-sm leading-6 text-zinc-400">
          {mode === 'login'
            ? 'Sign in to watch, chat, and pick up where you left off.'
            : registrationDescription(step, email)}
        </p>
      </div>

      {mode === 'login' ? (
        <>
          <button
            className="auth-google mt-7 flex w-full items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white px-5 py-3 font-semibold text-zinc-950 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={google.loading || !google.enabled || pending}
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
          <div className="auth-divider my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600">
            <span className="h-px flex-1 bg-white/10" />
            <span>or use email</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>
          <form className="space-y-4" noValidate onSubmit={signIn}>
            <EmailField
              email={email}
              emailErrorId={emailErrorId}
              error={fieldErrors.email}
              inputRef={emailRef}
              onChange={setEmail}
            />
            <PasswordField
              error={fieldErrors.password}
              errorId={passwordErrorId}
              id={passwordId}
              inputRef={passwordRef}
              onChange={setPassword}
              password={password}
              showPassword={showPassword}
              toggle={() => setShowPassword((current) => !current)}
            />
            <SubmitButton
              label="Sign in"
              pending={pending}
              pendingLabel="Signing in…"
            />
          </form>
        </>
      ) : step === 'email' ? (
        <form className="mt-7 space-y-5" noValidate onSubmit={continueEmail}>
          <EmailField
            email={email}
            emailErrorId={emailErrorId}
            error={fieldErrors.email}
            inputRef={emailRef}
            onChange={setEmail}
          />
          <SubmitButton
            label="Continue"
            pending={false}
            pendingLabel="Continuing…"
          />
        </form>
      ) : step === 'credentials' ? (
        <form
          className="mt-6 space-y-4"
          noValidate
          onSubmit={(event) => void continueCredentials(event)}
        >
          <div className="auth-email-summary">
            {email}
            <button
              onClick={() => {
                setStep('email');
                setFieldErrors({});
              }}
              type="button"
            >
              Edit email
            </button>
          </div>
          <label className="auth-label block text-sm font-medium text-zinc-300">
            Username
            <input
              aria-describedby={
                fieldErrors.username ? usernameErrorId : undefined
              }
              aria-invalid={Boolean(fieldErrors.username)}
              autoComplete="username"
              className="auth-input mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-300/10"
              maxLength={30}
              minLength={5}
              name="username"
              onChange={(event) => {
                setUsername(event.currentTarget.value);
                setFieldErrors((current) => ({
                  ...current,
                  username: undefined,
                }));
              }}
              placeholder="At least 5 characters"
              ref={usernameRef}
              value={username}
            />
          </label>
          {fieldErrors.username ? (
            <FieldError id={usernameErrorId} message={fieldErrors.username} />
          ) : null}
          <PasswordField
            error={fieldErrors.password}
            errorId={passwordErrorId}
            id={passwordId}
            inputRef={passwordRef}
            onChange={setPassword}
            password={password}
            registration
            showPassword={showPassword}
            toggle={() => setShowPassword((current) => !current)}
          />
          <SubmitButton
            label="Send verification code"
            pending={pending}
            pendingLabel="Sending code…"
          />
        </form>
      ) : (
        <form
          className="mt-7 space-y-5"
          noValidate
          onSubmit={(event) => void completeRegistration(event)}
        >
          <label className="auth-label block text-sm font-medium text-zinc-300">
            Email verification code
            <input
              aria-describedby={fieldErrors.code ? codeErrorId : undefined}
              aria-invalid={Boolean(fieldErrors.code)}
              autoComplete="one-time-code"
              className="auth-input mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-center text-xl tracking-[0.3em] text-white outline-none transition focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-300/10"
              inputMode="numeric"
              maxLength={6}
              name="code"
              onChange={(event) => {
                setCode(
                  event.currentTarget.value.replace(/\D/g, '').slice(0, 6),
                );
                setFieldErrors({});
              }}
              placeholder="000000"
              ref={codeRef}
              value={code}
            />
          </label>
          {fieldErrors.code ? (
            <FieldError id={codeErrorId} message={fieldErrors.code} />
          ) : null}
          <SubmitButton
            label="Verify and create account"
            pending={pending}
            pendingLabel="Verifying…"
          />
          <div className="auth-verification-actions">
            <button
              disabled={pending || secondsToResend > 0}
              onClick={() => void resendCode()}
              type="button"
            >
              {secondsToResend > 0
                ? `Resend code in ${secondsToResend}s`
                : 'Resend code'}
            </button>
            <button
              disabled={pending}
              onClick={() => setStep('credentials')}
              type="button"
            >
              Edit details
            </button>
          </div>
        </form>
      )}

      {status.kind === 'error' ? (
        <p
          className="auth-error mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200"
          role="alert"
        >
          {status.message}
        </p>
      ) : null}
    </section>
  );
}

function EmailField({
  email,
  emailErrorId,
  error,
  inputRef,
  onChange,
}: {
  email: string;
  emailErrorId: string;
  error?: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange(value: string): void;
}) {
  return (
    <>
      <label className="auth-label block text-sm font-medium text-zinc-300">
        Email
        <input
          aria-describedby={error ? emailErrorId : undefined}
          aria-invalid={Boolean(error)}
          autoComplete="email"
          className="auth-input mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-300/10"
          name="email"
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder="you@example.com"
          ref={inputRef}
          type="email"
          value={email}
        />
      </label>
      {error ? <FieldError id={emailErrorId} message={error} /> : null}
    </>
  );
}

function PasswordField({
  error,
  errorId,
  id,
  inputRef,
  onChange,
  password,
  registration = false,
  showPassword,
  toggle,
}: {
  error?: string;
  errorId: string;
  id: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange(value: string): void;
  password: string;
  registration?: boolean;
  showPassword: boolean;
  toggle(): void;
}) {
  return (
    <div className="auth-label text-sm font-medium text-zinc-300">
      <label htmlFor={id}>Password</label>
      <span className="relative mt-2 block">
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          autoComplete={registration ? 'new-password' : 'current-password'}
          className="auth-input w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 pr-14 text-white outline-none transition focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-300/10"
          id={id}
          name="password"
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder={
            registration
              ? '8+ characters, letters and numbers'
              : 'Your password'
          }
          ref={inputRef}
          type={showPassword ? 'text' : 'password'}
          value={password}
        />
        <button
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          aria-pressed={showPassword}
          className="auth-password-toggle absolute inset-y-0 right-2 my-auto grid size-10 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
          onClick={toggle}
          type="button"
        >
          <EyeIcon visible={showPassword} />
        </button>
      </span>
      {error ? <FieldError id={errorId} message={error} /> : null}
    </div>
  );
}

function EyeIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="20"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
      {visible ? <path d="m3 3 18 18" /> : null}
    </svg>
  );
}

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p
      className="auth-field-error mt-1 text-xs text-rose-300"
      id={id}
      role="alert"
    >
      {message}
    </p>
  );
}

function SubmitButton({
  label,
  pending,
  pendingLabel,
}: {
  label: string;
  pending: boolean;
  pendingLabel: string;
}) {
  return (
    <button
      className="auth-submit w-full rounded-2xl bg-cyan-300 px-5 py-3 font-bold text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : label}
    </button>
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
      className={`auth-tab rounded-full px-3 py-2.5 font-medium transition ${active ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:text-white'}`}
      data-active={active}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function registrationFieldErrors(
  email: string,
  username: string,
  password: string,
): FieldErrors {
  const errors: FieldErrors = {};
  if (!RegistrationEmailSchema.safeParse(email).success)
    errors.email = 'Enter a valid email address.';
  if (!RegisterRequestSchema.shape.username.safeParse(username).success)
    errors.username =
      'Use 5–30 letters, numbers, or underscores; start with a letter.';
  if (!RegisterRequestSchema.shape.password.safeParse(password).success)
    errors.password =
      'Use at least 8 characters with both letters and numbers.';
  return errors;
}

function stepLabel(step: RegistrationStep): string {
  return step === 'email'
    ? '1 of 3'
    : step === 'credentials'
      ? '2 of 3'
      : '3 of 3';
}

function registrationDescription(
  step: RegistrationStep,
  email: string,
): string {
  if (step === 'email') return 'Start with the email address you want to use.';
  if (step === 'credentials')
    return 'Choose a unique username and a secure password.';
  return `Enter the six-digit code sent to ${email}.`;
}

export function oauthErrorMessage(error: string): string {
  const normalized = error.trim().toLowerCase().replaceAll('-', '_');
  if (normalized.includes('access_denied'))
    return 'Google sign-in was cancelled. You can try again when ready.';
  if (normalized.includes('account_not_linked'))
    return 'This email is already linked to another sign-in method.';
  if (normalized.includes('email') && normalized.includes('verified'))
    return 'Google could not provide a verified email for this account.';
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
