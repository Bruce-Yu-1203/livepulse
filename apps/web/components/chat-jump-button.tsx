export function ChatJumpButton({
  count,
  onClick,
}: {
  count: number;
  onClick(): void;
}) {
  if (count === 0) return null;

  const countLabel = count > 99 ? '99+' : String(count);

  return (
    <button
      aria-label={`Jump to latest messages, ${countLabel} new`}
      className="absolute bottom-3 left-1/2 z-10 min-h-11 -translate-x-1/2 whitespace-nowrap rounded-full border border-accent/25 bg-surface px-4 py-2 text-xs font-bold text-accent shadow-lg transition hover:border-accent hover:bg-accent-soft"
      onClick={onClick}
      type="button"
    >
      {countLabel} new {count === 1 ? 'message' : 'messages'} · Latest
    </button>
  );
}
