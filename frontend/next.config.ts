/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Enable WebSocket connections
  async rewrites() {
    return [
      {
        source: '/ws',
        destination: process.env.API_BASE_URL || 'http://localhost:3000/ws',
      },
    ];
  },
};

export default nextConfig;
