import RemoveDocumentWritePlugin from './lib/webpack-document-write-plugin.js'

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Environment variables removed for security - Firebase config now hardcoded in lib/firebase.ts
  // Performance optimizations for Vercel
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
    optimizeCss: true, // Enable CSS optimization
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
  // Optimize CSS loading
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  // Headers for better performance
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
        ],
      },
      {
        source: '/_next/static/css/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          {
            key: 'Link',
            value: '</fonts/inter-var.woff2>; rel=preload; as=font; type=font/woff2; crossorigin=anonymous',
          },
        ],
      },
    ]
  },
  // Webpack configuration optimized for production
  webpack: (config, { dev, isServer, webpack }) => {
    // Exclude polyfills for modern JavaScript features
    config.resolve.alias = {
      ...config.resolve.alias,
      'core-js': false,
      '@babel/runtime': false,
    }
    
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
            styles: {
              test: /\.css$/,
              name: 'styles',
              priority: 40,
              chunks: 'all',
              enforce: true,
            },
          },
        },
        minimize: true,
        minimizer: [
          ...config.optimization.minimizer,
        ],
      }
      
      // Add CSS optimization plugin
      config.plugins.push(
        new webpack.optimize.MinChunkSizePlugin({
          minChunkSize: 10000, // Minimum chunk size in bytes
        })
      )
      
      // Remove document.write() calls
      config.plugins.push(new RemoveDocumentWritePlugin())
      
      // Split large vendor chunks to avoid long tasks
      config.optimization.splitChunks.cacheGroups.vendorSplit = {
        test: /[\\/]node_modules[\\/]/,
        name(module) {
          // Get the name of the package
          const packageName = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)[1]
          // Group by package name to avoid too many chunks
          return `vendor-${packageName.replace('@', '').replace('/', '-')}`
        },
        priority: 10,
        reuseExistingChunk: true,
        enforce: true,
        chunks: 'all',
        maxSize: 50000, // Split chunks larger than 50KB
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
    
    // Disable unnecessary polyfills for modern browsers
    config.resolve.alias = {
      ...config.resolve.alias,
      // Skip core-js polyfills for modern browsers
      'core-js/modules/es.array.flat': false,
      'core-js/modules/es.array.flat-map': false,
      'core-js/modules/es.array.at': false,
      'core-js/modules/es.object.from-entries': false,
      'core-js/modules/es.object.has-own': false,
      'core-js/modules/es.string.trim-end': false,
      'core-js/modules/es.string.trim-start': false,
    }
    
    // Configure to skip polyfills for modern features
    if (!isServer && !dev) {
      config.optimization.minimizer = config.optimization.minimizer.map(minimizer => {
        if (minimizer.constructor.name === 'TerserPlugin') {
          minimizer.options.terserOptions = {
            ...minimizer.options.terserOptions,
            ecma: 2020, // Target ES2020 which all modern browsers support
            safari10: false, // Don't support old Safari
          }
        }
        return minimizer
      })
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
    // Add the specific IP from error
    '192.168.0.104',
    '192.168.0.104:3000',
    '192.168.0.104:3001',
  ],
}

export default nextConfig