import type { RoomCategory } from '@livepulse/contracts';

/** Line icons for each category, drawn on a 24px grid with currentColor. */
const iconPaths: Record<RoomCategory, string[]> = {
  art: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  food: ['M5 3v8a2 2 0 0 0 2 2v8M9 3v8M5 7h4M17 21V3c-2 1-3 4-3 7s1 4 3 4'],
  gaming: [
    'M6 8h12a4 4 0 0 1 4 4v1a4 4 0 0 1-7 2.6L14 14h-4l-1 1.6A4 4 0 0 1 2 13v-1a4 4 0 0 1 4-4z',
    'M7 11v3M5.5 12.5h3M16 12h.01M18 13.5h.01',
  ],
  irl: [
    'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z',
    'M14.5 9.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  ],
  'just-chatting': ['M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z'],
  music: [
    'M9 18V5l11-2v13',
    'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  ],
  sports: [
    'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
    'M12 3a14 14 0 0 0 0 18M3 12h18',
  ],
  study: [
    'M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2zM22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z',
  ],
  tech: ['m8 7-5 5 5 5M16 7l5 5-5 5'],
};

export function CategoryIcon({
  category,
  className = 'category-icon',
}: {
  category: RoomCategory;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
    >
      {iconPaths[category].map((path) => (
        <path
          d={path}
          key={path}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      ))}
    </svg>
  );
}
