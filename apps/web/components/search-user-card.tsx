import type { SearchUser } from '@livepulse/contracts';
import Link from 'next/link';

export function SearchUserAvatar({
  user,
  className = '',
}: {
  user: SearchUser;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={`search-user-avatar ${className}`}>
      {user.avatarUrl ? (
        <img alt="" src={user.avatarUrl} />
      ) : (
        user.name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

export function SearchUserCard({ user }: { user: SearchUser }) {
  return (
    <Link
      aria-label={`Open ${user.username ? `@${user.username}` : user.name}'s profile`}
      className="home-user-card"
      href={`/users/${user.id}`}
    >
      <SearchUserAvatar user={user} />
      <span className="home-user-copy">
        <strong>{user.name}</strong>
        <span>{user.username ? `@${user.username}` : 'LivePulse member'}</span>
      </span>
      <span aria-hidden="true" className="home-user-arrow">
        →
      </span>
    </Link>
  );
}
