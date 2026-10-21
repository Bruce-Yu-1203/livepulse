// Sample rooms for filling a staging or demo deployment with browsable content.
// Ids are fixed so re-running the seed updates rooms instead of duplicating them.
const cover = (photo) =>
  `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=1280&q=70`;

export const demoRooms = [
  {
    id: '55555555-5555-4555-8555-000000000001',
    title: 'Late night lo-fi coding',
    description: 'Building a realtime feature from scratch. Questions welcome.',
    coverImageUrl: cover('photo-1515879218367-8466d910aaa4'),
    status: 'LIVE',
  },
  {
    id: '55555555-5555-4555-8555-000000000002',
    title: 'Design critique hour',
    description: 'Weekly review of community UI submissions, live.',
    coverImageUrl: cover('photo-1561070791-2526d30994b5'),
    status: 'LIVE',
  },
  {
    id: '55555555-5555-4555-8555-000000000003',
    title: 'Speedrun practice',
    description: 'Grinding any% routes and talking strategy with chat.',
    coverImageUrl: cover('photo-1542751371-adc38448a05e'),
    status: 'LIVE',
  },
  {
    id: '55555555-5555-4555-8555-000000000004',
    title: 'Watercolor basics',
    description: 'Painting a coastline step by step. Bring your own brush.',
    coverImageUrl: cover('photo-1513364776144-60967b0f800f'),
    status: 'LIVE',
  },
  {
    id: '55555555-5555-4555-8555-000000000005',
    title: 'Morning jazz piano',
    description: 'Slow standards and requests from the chat.',
    coverImageUrl: cover('photo-1520523839897-bd0b52f945a0'),
    status: 'LIVE',
  },
  {
    id: '55555555-5555-4555-8555-000000000006',
    title: 'Street food tour: Taipei',
    description: 'Walking the night market and trying everything.',
    coverImageUrl: cover('photo-1555396273-367ea4eb4db5'),
    status: 'LIVE',
  },
  {
    id: '55555555-5555-4555-8555-000000000007',
    title: 'Morning news roundup',
    description: 'Tech headlines discussed with the chat.',
    coverImageUrl: cover('photo-1504711434969-e33886168f5c'),
    status: 'ENDED',
  },
  {
    id: '55555555-5555-4555-8555-000000000008',
    title: 'Rust office hours',
    description: 'Ownership, lifetimes and your questions.',
    coverImageUrl: null,
    status: 'ENDED',
  },
  {
    id: '55555555-5555-4555-8555-000000000009',
    title: 'Home workout together',
    description: 'Thirty minutes, no equipment, everyone welcome.',
    coverImageUrl: cover('photo-1517836357463-d25dfeac3438'),
    status: 'ENDED',
  },
];
