/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Allow cross-origin requests for development
  allowedDevOrigins: [
    '127.0.0.1',
    'localhost',
    '127.0.0.1:3000',
    'localhost:3000',
    '127.0.0.1:3001',
    'localhost:3001',
    '0.0.0.0:3000',
    '0.0.0.0:3001',
    // Add common development IPs
    '10.0.3.234',
    '10.0.3.234:3000',
    '10.0.3.234:3001',
  ],
}

export default nextConfig