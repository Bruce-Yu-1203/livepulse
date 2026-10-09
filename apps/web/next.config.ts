import type { NextConfig } from 'next';

const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        destination: `${apiOrigin}/api/:path*`,
        source: '/api/:path*',
      },
    ];
  },
};

export default nextConfig;
