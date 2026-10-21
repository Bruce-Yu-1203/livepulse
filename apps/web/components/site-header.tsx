import Link from 'next/link';

import { AuthNavigation } from './auth-navigation';
import { BrandMark } from './brand-mark';

export function SiteHeader({ searchQuery = '' }: { searchQuery?: string }) {
  return (
    <header className="site-header sticky top-0 z-50">
      <div className="site-header-inner">
        <div className="flex shrink-0 items-center gap-4">
          <Link
            aria-label="LivePulse home"
            className="flex items-center gap-3"
            href="/"
          >
            <BrandMark className="site-brand-mark" />
            <span className="site-brand-name hidden text-xl text-white md:inline">
              livepulse
            </span>
          </Link>
          <nav aria-label="Primary navigation" className="hidden sm:block">
            <Link
              className="site-nav-link inline-flex px-3 py-2 text-sm font-semibold"
              href="/"
            >
              Discover
            </Link>
          </nav>
        </div>

        <form action="/" className="site-search" method="get" role="search">
          <label className="sr-only" htmlFor="site-search">
            Search rooms
          </label>
          <input
            defaultValue={searchQuery}
            id="site-search"
            maxLength={80}
            name="q"
            placeholder="Search rooms"
            type="search"
          />
          <button aria-label="Search" type="submit">
            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
              <path
                d="m20 20-4.2-4.2M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
              />
            </svg>
          </button>
        </form>

        <div className="flex shrink-0 items-center text-sm">
          <AuthNavigation />
        </div>
      </div>
    </header>
  );
}
