import createNextIntlPlugin from 'next-intl/plugin';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['bullmq', 'ioredis', 'nodemailer', 'web-push'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  async headers() {
    return [
      {
        // The embeddable chat widget must be loadable from any buyer domain.
        source: '/widget.js',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Cache-Control', value: 'public, max-age=300' },
        ],
      },
      {
        source: '/api/widget/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');

export default withNextIntl(nextConfig);
