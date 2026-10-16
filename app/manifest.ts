import type { MetadataRoute } from 'next';

/**
 * Web app manifest.
 *
 * The service worker in public/sw.js already handles push notifications, but
 * without a manifest the browser will not offer "Add to home screen", so a
 * subscription could never be created on iOS at all — installed PWAs are the
 * only place Safari permits the Push API.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Roster — AI-Powered Business Assistant',
    short_name: 'Roster',
    description:
      'An AI staff member that talks to your leads, finds new ones, and keeps your customers coming back.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#FAFAF7',
    theme_color: '#0F1115',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        // Full-bleed with the glyph inside the 80% safe circle — the OS
        // crops this to its own shape, so a rounded tile would lose corners.
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: 'Inbox', url: '/dashboard/inbox' },
      { name: 'Pipeline', url: '/dashboard/pipeline' },
      { name: 'Leads', url: '/dashboard/leads' },
    ],
  };
}
