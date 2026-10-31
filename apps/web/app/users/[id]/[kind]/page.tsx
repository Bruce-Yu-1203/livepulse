import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AppShell } from '../../../../components/app-shell';
import { SearchUserCard } from '../../../../components/search-user-card';
import {
  ApiRequestError,
  getPublicUser,
  listLiveChannels,
  listUserFollows,
} from '../../../../lib/api';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; kind: string }>;
}): Promise<Metadata> {
  const { kind } = await params;
  return { title: kind === 'followers' ? 'Followers' : 'Following' };
}

export default async function FollowListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; kind: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id, kind } = await params;
  if (kind !== 'followers' && kind !== 'following') notFound();
  const { page: rawPage } = await searchParams;
  const page = Number(rawPage ?? '1');
  if (!Number.isInteger(page) || page < 1 || page > 10_000) notFound();

  try {
    const [{ user }, list, channels] = await Promise.all([
      getPublicUser(id),
      listUserFollows(id, kind, page),
      listLiveChannels(),
    ]);
    const title = kind === 'followers' ? 'Followers' : 'Following';
    return (
      <AppShell channels={channels}>
        <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
          <Link
            className="text-sm text-muted transition hover:text-fg"
            href={`/users/${id}`}
          >
            ← {user.name}
          </Link>
          <header className="mt-10">
            <p className="text-sm font-bold text-accent">{user.name}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-fg">
              {title}
            </h1>
            <nav
              aria-label="Follow lists"
              className="mt-6 flex gap-5 border-b border-fg/10 pb-4 text-sm font-semibold"
            >
              <Link
                aria-current={kind === 'following' ? 'page' : undefined}
                className={
                  kind === 'following'
                    ? 'text-accent'
                    : 'text-muted hover:text-fg'
                }
                href={`/users/${id}/following`}
              >
                Following {user.followingCount}
              </Link>
              <Link
                aria-current={kind === 'followers' ? 'page' : undefined}
                className={
                  kind === 'followers'
                    ? 'text-accent'
                    : 'text-muted hover:text-fg'
                }
                href={`/users/${id}/followers`}
              >
                Followers {user.followerCount}
              </Link>
            </nav>
          </header>
          {list.items.length ? (
            <div className="home-user-grid mt-6">
              {list.items.map((person) => (
                <SearchUserCard key={person.id} user={person} />
              ))}
            </div>
          ) : (
            <p className="mt-6 rounded-lg border border-dashed border-fg/10 bg-surface px-6 py-8 text-sm text-muted">
              {kind === 'followers'
                ? 'No followers yet.'
                : 'Not following anyone yet.'}
            </p>
          )}
          <nav
            aria-label={`${title} pages`}
            className="mt-8 flex gap-4 text-sm font-semibold text-accent"
          >
            {page > 1 ? (
              <Link href={`/users/${id}/${kind}?page=${page - 1}`}>
                ← Previous
              </Link>
            ) : null}
            {list.nextPage ? (
              <Link href={`/users/${id}/${kind}?page=${list.nextPage}`}>
                Next →
              </Link>
            ) : null}
          </nav>
        </div>
      </AppShell>
    );
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }
}
