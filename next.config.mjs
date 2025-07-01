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
  // API timeout configuration
  serverRuntimeConfig: {
    requestTimeout: 30000, // 30 seconds
  },
  // Fast Refresh optimization
  reactStrictMode: true,
  // Webpack configuration to fix chunk loading issues
  webpack: (config, { dev, isServer }) => {
    // Fix for ChunkLoadError in development
    if (dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          minSize: 20000,
          maxSize: 244000,
        }
      }
    }
    
    // Ensure proper module resolution
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    }
    
    return config
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