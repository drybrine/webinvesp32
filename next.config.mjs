/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Performance optimizations for Netlify
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
  images: {
    unoptimized: false, // Enable optimization for better performance
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 31536000, // 1 year
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  // Enable compression
  compress: true,
  // Static optimization
  trailingSlash: false,
  // Production optimizations
  poweredByHeader: false,
  // API timeout configuration
  serverRuntimeConfig: {
    requestTimeout: 30000, // 30 seconds
  },
  // Performance and optimization
  reactStrictMode: true,
  // Webpack configuration optimized for production
  webpack: (config, { dev, isServer, webpack }) => {
    // Performance optimizations
    if (!dev) {
      config.optimization = {
        ...config.optimization,
        sideEffects: false,
        usedExports: true,
        splitChunks: {
          chunks: 'all',
          minSize: 20000,
          maxSize: 244000,
          cacheGroups: {
            default: {
              minChunks: 2,
              priority: -20,
              reuseExistingChunk: true,
            },
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              priority: -10,
              chunks: 'all',
            },
            react: {
              test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
              name: 'react',
              priority: 20,
              chunks: 'all',
            },
            ui: {
              test: /[\\/]components[\\/]ui[\\/]/,
              name: 'ui',
              priority: 30,
              chunks: 'all',
            },
          },
        },
      }
    } else {
      // Development optimizations
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