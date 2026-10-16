import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Providers } from '@/components/providers';
import { resolveLocale } from '@/lib/i18n/request';
import { directionOf } from '@/lib/i18n/config';
import './globals.css';

// Front Desk design: Geist for UI and headings, Geist Mono for eyebrows,
// keyboard hints, API keys, logs and transcripts.
const geist = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

/**
 * One serif, used only for the accent word in marketing headlines.
 * The dashboard never touches it — it exists to give the storefront a voice
 * the geometric sans cannot, without changing the product's typography.
 */
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['italic', 'normal'],
  variable: '--font-serif',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Roster — AI-Powered Business Assistant',
    template: '%s · Roster',
  },
  description:
    'An AI staff member that talks to your leads, finds new ones, and keeps your customers coming back.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#E9E9EC' },
    { media: '(prefers-color-scheme: dark)', color: '#050506' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Locale and direction are resolved server-side so the very first paint is
  // already mirrored — flipping to RTL after hydration would visibly reflow
  // the whole page.
  const locale = await resolveLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      dir={directionOf(locale)}
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
    >
      <head>
        {/* Applied before paint so a reload never flashes the wrong theme.
            Dark is the default; light applies only when chosen explicitly. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('roster-theme');if(t!=='light')document.documentElement.classList.add('dark');}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
