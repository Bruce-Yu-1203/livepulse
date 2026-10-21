import Link from 'next/link';

import { BrandMark } from '../../components/brand-mark';
import { AuthPanel } from './auth-panel';

export default function AuthPage() {
  return (
    <main className="auth-page min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Link
          className="text-sm text-zinc-400 transition hover:text-cyan-300"
          href="/"
        >
          ← Back to rooms
        </Link>
        <span className="auth-brand text-sm font-extrabold tracking-tight text-white">
          <BrandMark />
          livepulse
        </span>
      </div>
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-16 py-16 lg:grid-cols-[1fr_28rem]">
        <section className="auth-intro hidden lg:block">
          <p className="text-sm font-bold text-cyan-300">Come on in</p>
          <h2 className="mt-6 max-w-2xl text-6xl font-extrabold leading-[0.98] tracking-[-0.07em] text-white">
            Every good room starts with people showing up.
          </h2>
          <p className="mt-7 max-w-xl text-lg leading-8 text-zinc-400">
            Create an account to join the conversation, share a reaction, and
            make the moment yours.
          </p>
          <div aria-hidden="true" className="auth-signal mt-14">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </section>
        <AuthPanel />
      </div>
    </main>
  );
}
