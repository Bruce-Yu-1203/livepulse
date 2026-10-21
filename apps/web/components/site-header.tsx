import Link from 'next/link';

import { AuthNavigation } from './auth-navigation';
import { BrandMark } from './brand-mark';

export function SiteHeader() {
  return (
    <header className="site-header sticky top-0 z-50">
      <div className="mx-auto flex max-w-[82rem] items-center justify-between px-5 py-4 sm:px-8">
        <Link
          aria-label="LivePulse home"
          className="flex items-center gap-3"
          href="/"
        >
          <BrandMark className="site-brand-mark" />
          <span className="site-brand-name text-xl text-white">livepulse</span>
        </Link>
        <nav
          aria-label="Primary navigation"
          className="flex items-center gap-2 text-sm"
        >
          <Link
            className="site-nav-link hidden px-3 py-2 font-semibold sm:inline-flex"
            href="/"
          >
            Discover
          </Link>
          <AuthNavigation />
        </nav>
      </div>
    </header>
  );
}
