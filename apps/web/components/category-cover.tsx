import type { RoomCategory } from '@livepulse/contracts';

type Palette = { bg: string; hi: string; ink: string };
type Artwork = Palette & { svg(palette: Palette): string };

/*
 * Flat illustrated covers for each category on a 400x300 canvas. The art uses
 * its own muted palette so one cover works in both light and dark themes.
 * The markup is static and built here, never from user input.
 */
const artwork: Record<RoomCategory, Artwork> = {
  'just-chatting': {
    bg: '#DCE6E0',
    ink: '#2F5D50',
    hi: '#F3F1EA',
    svg: (c: Palette) => `
<rect x="60" y="70" width="200" height="110" rx="22" fill="${c.ink}"/><path d="M100 180l-10 40 50-40z" fill="${c.ink}"/>
<rect x="160" y="130" width="190" height="100" rx="22" fill="${c.hi}"/><path d="M310 230l14 34-48-34z" fill="${c.hi}"/>
<circle cx="120" cy="125" r="9" fill="${c.hi}"/><circle cx="155" cy="125" r="9" fill="${c.hi}"/><circle cx="190" cy="125" r="9" fill="${c.hi}"/>
<rect x="190" y="165" width="120" height="10" rx="5" fill="${c.ink}" opacity=".5"/><rect x="190" y="187" width="80" height="10" rx="5" fill="${c.ink}" opacity=".3"/>`,
  },
  irl: {
    bg: '#23343F',
    ink: '#0F1C24',
    hi: '#E9C46A',
    svg: (c: Palette) => `
<circle cx="300" cy="80" r="34" fill="${c.hi}"/><circle cx="314" cy="70" r="30" fill="${c.bg}"/>
<path d="M0 300V190h40v-40h30v60h25v-90h45v70h20v-30h40v80h30v-110h50v60h30v-30h40v50h55v90z" fill="${c.ink}"/>
${[
  [60, 170],
  [118, 140],
  [118, 165],
  [205, 200],
  [262, 130],
  [262, 155],
  [285, 155],
  [350, 230],
]
  .map(
    ([x, y]) =>
      `<rect x="${x}" y="${y}" width="9" height="12" fill="${c.hi}" opacity=".85"/>`,
  )
  .join('')}
<path d="M150 300c20-40 60-55 100-60" stroke="${c.hi}" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round" fill="none" opacity=".7"/>`,
  },
  gaming: {
    bg: '#3B2F4A',
    ink: '#1D1626',
    hi: '#F28F6B',
    svg: (c: Palette) => `
${Array.from({ length: 7 }, (_, i) => `<path d="M${-20 + i * 70} 300L200 175" stroke="${c.hi}" stroke-opacity=".18" stroke-width="2"/>`).join('')}
<path d="M0 230h400M0 265h400" stroke="${c.hi}" stroke-opacity=".18" stroke-width="2"/>
<path d="M115 110h170a55 55 0 0 1 55 55v8a42 42 0 0 1-74 27l-18-20h-76l-18 20a42 42 0 0 1-74-27v-8a55 55 0 0 1 55-55z" fill="${c.ink}"/>
<rect x="128" y="140" width="12" height="40" rx="3" fill="${c.hi}"/><rect x="114" y="154" width="40" height="12" rx="3" fill="${c.hi}"/>
<circle cx="262" cy="148" r="9" fill="${c.hi}"/><circle cx="286" cy="170" r="9" fill="#E9C46A"/>`,
  },
  music: {
    bg: '#E8DCCB',
    ink: '#2A2420',
    hi: '#C0563A',
    svg: (c: Palette) => `
<circle cx="170" cy="160" r="105" fill="${c.ink}"/>${[85, 70, 55].map((r) => `<circle cx="170" cy="160" r="${r}" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="2"/>`).join('')}
<circle cx="170" cy="160" r="34" fill="${c.hi}"/><circle cx="170" cy="160" r="5" fill="${c.ink}"/>
<path d="M330 40v150" stroke="${c.ink}" stroke-width="8" stroke-linecap="round"/><path d="M330 190l-55 25" stroke="${c.ink}" stroke-width="8" stroke-linecap="round"/><circle cx="330" cy="40" r="14" fill="${c.ink}"/>`,
  },
  art: {
    bg: '#F1E9DD',
    ink: '#2B2B2B',
    hi: '#D98E3F',
    svg: (c: Palette) => `
<path d="M50 220c40-90 120-130 190-95s90 110 30 125-70-30-120-15-80 25-100-15z" fill="#7FA37F"/>
<path d="M120 90c60-40 150-30 200 20" stroke="${c.hi}" stroke-width="26" stroke-linecap="round" fill="none"/>
<path d="M90 255c80 10 170 0 260-30" stroke="#4E6E8E" stroke-width="16" stroke-linecap="round" fill="none"/>
<g transform="rotate(35 290 150)"><rect x="280" y="60" width="18" height="120" rx="4" fill="${c.ink}"/><path d="M280 180h18l-9 30z" fill="${c.hi}"/></g>`,
  },
  tech: {
    bg: '#1F2A30',
    ink: '#2E3E46',
    hi: '#7FD1AE',
    svg: (c: Palette) => `
<rect x="55" y="45" width="290" height="210" rx="14" fill="${c.ink}"/><rect x="55" y="45" width="290" height="30" rx="14" fill="#38505B"/>
${['#E5484D', '#E9C46A', '#7FD1AE'].map((f, i) => `<circle cx="${78 + i * 18}" cy="60" r="5" fill="${f}"/>`).join('')}
${[
  [80, 100, 90, c.hi],
  [180, 100, 60, '#E9C46A'],
  [100, 125, 140, '#9DB4C0'],
  [100, 150, 100, '#9DB4C0'],
  [210, 150, 70, c.hi],
  [80, 175, 50, '#E9C46A'],
  [100, 200, 160, '#9DB4C0'],
  [80, 225, 40, c.hi],
]
  .map(
    ([x, y, w, f]) =>
      `<rect x="${x}" y="${y}" width="${w}" height="9" rx="4.5" fill="${f}" opacity=".9"/>`,
  )
  .join('')}
<rect x="270" y="222" width="4" height="16" fill="#fff"/>`,
  },
  study: {
    bg: '#E4E2D3',
    ink: '#3D4A3A',
    hi: '#E9C46A',
    svg: (c: Palette) => `
<path d="M250 70l50-30 18 14-40 40z" fill="${c.ink}"/><path d="M275 90l-25 120" stroke="${c.ink}" stroke-width="6"/><path d="M215 92l100 0-20 30h-60z" fill="${c.ink}"/>
<path d="M225 122l-45 100h170l-45-100z" fill="${c.hi}" opacity=".35"/>
<rect x="60" y="200" width="200" height="26" rx="3" fill="#9C5B3F"/><rect x="75" y="174" width="170" height="26" rx="3" fill="${c.ink}"/><rect x="65" y="148" width="150" height="26" rx="3" fill="#6E8B9E"/>
<rect x="0" y="226" width="400" height="74" fill="#C9C4AE"/><rect x="230" y="210" width="90" height="16" rx="3" fill="#F7F5EC"/>`,
  },
  food: {
    bg: '#F3E3D3',
    ink: '#3A2A22',
    hi: '#D2603A',
    svg: (c: Palette) => `
${[150, 200, 250].map((x) => `<path d="M${x} 110c-15-20 15-35 0-55" stroke="${c.ink}" stroke-opacity=".35" stroke-width="5" stroke-linecap="round" fill="none"/>`).join('')}
<path d="M80 150h240a120 100 0 0 1-240 0z" fill="${c.hi}"/><rect x="70" y="140" width="260" height="16" rx="8" fill="${c.ink}"/>
<path d="M120 145c20-14 40-14 60 0s40 14 60 0 40-14 40 0" stroke="#F7E4A8" stroke-width="10" fill="none" stroke-linecap="round"/>
<path d="M280 40l-40 110M305 45l-45 105" stroke="${c.ink}" stroke-width="7" stroke-linecap="round"/>`,
  },
  sports: {
    bg: '#2F4A3A',
    ink: '#1E3327',
    hi: '#F3F1EA',
    svg: (c: Palette) => `
<rect x="30" y="40" width="340" height="220" fill="none" stroke="${c.hi}" stroke-opacity=".35" stroke-width="3"/><path d="M200 40v220" stroke="${c.hi}" stroke-opacity=".35" stroke-width="3"/><circle cx="200" cy="150" r="45" fill="none" stroke="${c.hi}" stroke-opacity=".35" stroke-width="3"/>
<circle cx="270" cy="185" r="48" fill="${c.hi}"/><path d="M270 160l22 16-8 26h-28l-8-26z" fill="${c.ink}"/>
<path d="M120 230c40-60 80-80 120-70" stroke="${c.hi}" stroke-width="3" stroke-dasharray="3 10" stroke-linecap="round" fill="none"/>`,
  },
};

const markup = Object.fromEntries(
  Object.entries(artwork).map(([slug, art]) => [
    slug,
    `<rect width="400" height="300" fill="${art.bg}"/>${art.svg(art)}`,
  ]),
) as Record<RoomCategory, string>;

export function categoryCoverMarkup(category: RoomCategory): string {
  return markup[category];
}

export function CategoryCover({
  category,
  className = 'category-cover',
}: {
  category: RoomCategory;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      dangerouslySetInnerHTML={{ __html: markup[category] }}
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 400 300"
    />
  );
}
