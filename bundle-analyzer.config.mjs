// Bundle analyzer config for Next.js
import withBundleAnalyzer from '@next/bundle-analyzer';

const nextConfig = require('./next.config.mjs');

export default withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})(nextConfig);
