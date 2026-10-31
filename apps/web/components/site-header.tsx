import Link from 'next/link';

import { AuthNavigation } from './auth-navigation';
import { BrandMark } from './brand-mark';
import { SiteSearch } from './site-search';
import { ThemeToggle } from './theme-toggle';

export function SiteHeader({ searchQuery = '' }: { searchQuery?: string }) {
  return (
    <header className="site-header sticky top-0 z-50">
      <div className="site-header-inner">
        <div className="flex shrink-0 items-center gap-4">
          <Link
            aria-label="LivePulse home"
            className="site-brand flex items-center gap-3"
            href="/"
          >
            <BrandMark className="site-brand-mark" />
            <span className="site-brand-name hidden text-xl text-fg md:inline">
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
            <Link
              className="site-nav-link inline-flex px-3 py-2 text-sm font-semibold"
              href="/browse"
            >
              Browse
            </Link>
          </nav>
        </div>

        <SiteSearch searchQuery={searchQuery} />

        <div className="flex shrink-0 items-center gap-2 text-sm">
          <ThemeToggle />
          <AuthNavigation />
        </div>
      </div>
    </header>
  );
}
