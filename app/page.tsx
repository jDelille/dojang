import Link from 'next/link';
import Script from 'next/script';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';
import { prisma } from '@/lib/db';
import { getInstallState } from '@/lib/install';
import { getCurrentUser } from '@/lib/session';
import { buttonStyles } from '@/components/ui/button-styles';
import {
  Band,
  ChartTile,
  Container,
  Faq,
  FeatureCard,
  Headline,
  Marker,
  PreviewTile,
  StatTile,
} from '@/components/marketing/sections';
import { LocaleSwitch } from '@/components/marketing/locale-switch';
import { listPublishedPages } from '@/lib/pages';

export const dynamic = 'force-dynamic';

/**
 * Marketing page. A fresh copy of the script sends the buyer straight to the
 * installer instead of showing a landing page with nothing behind it.
 */
export default async function LandingPage() {
  const t = await getTranslations('marketing');
  const [install, userCount, legalPages, currentUser] = await Promise.all([
    getInstallState(),
    prisma.user.count().catch(() => -1),
    listPublishedPages().catch(() => []),
    // Someone already signed in does not need to be sold the product or asked
    // to sign in again — send them straight back to where they were working.
    getCurrentUser().catch(() => null),
  ]);

  if (userCount === 0 && !install.completed) redirect('/install');

  // Set this to a workspace slug to put that workspace's chat agent on the
  // landing page. Blank by default, so a fresh install shows no widget.
  const widgetWorkspace = process.env.NEXT_PUBLIC_WIDGET_WORKSPACE?.trim();

  const FEATURES = [
    ['aiChatAndVoice', 'aiChatAndVoiceBody'],
    ['leadGeneration', 'leadGenerationBody'],
    ['retentionEngine', 'retentionEngineBody'],
    ['crmAndPipeline', 'crmAndPipelineBody'],
    ['missedCallTextBack', 'missedCallTextBackBody'],
    ['bookingAndReminders', 'bookingAndRemindersBody'],
    ['reputation', 'reputationBody'],
    ['invoicingAndPayments', 'invoicingAndPaymentsBody'],
    ['unifiedInbox', 'unifiedInboxBody'],
  ] as const;

  return (
    <div className="min-h-screen bg-[color:var(--color-paper)]">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-[color:var(--color-border)] bg-[color:var(--color-paper)]/90 backdrop-blur">
        <Container className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-control bg-accent text-xs font-bold text-[color:var(--color-accent-fg)]">
              R
            </span>
            <span className="font-display text-base font-semibold tracking-tight">Roster</span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            <a href="#features" className="text-sm muted transition-colors duration-150 ease-out hover:text-[color:var(--color-fg)]">
              {t('features')}
            </a>
            <a href="#how" className="text-sm muted transition-colors duration-150 ease-out hover:text-[color:var(--color-fg)]">
              {t('howItWorks')}
            </a>
            <a href="#faq" className="text-sm muted transition-colors duration-150 ease-out hover:text-[color:var(--color-fg)]">
              {t('questions')}
            </a>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <LocaleSwitch />
            {currentUser ? (
              <Link href="/dashboard" className={buttonStyles({ variant: 'primary', size: 'sm' })}>
                {t('goToDashboard')}
              </Link>
            ) : (
              <>
                <Link href="/login" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
                  {t('signIn')}
                </Link>
                <Link href="/register" className={buttonStyles({ variant: 'primary', size: 'sm' })}>
                  {t('getStarted')}
                </Link>
              </>
            )}
          </div>
        </Container>
      </header>

      {/* ── Hero: asymmetric, text left, bento right ────────────────────── */}
      <Container className="grid grid-cols-1 gap-10 py-14 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:py-20">
        <div>
          <Marker n="01" label={t('theProduct')} />
          <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight text-[color:inherit] sm:text-5xl">
            {t('anAiStaffMember')}{' '}
            <span className="font-serif text-[1.1em] font-normal italic tracking-normal text-[color:var(--color-accent-dark)] dark:text-accent">
              {t('whileYouWorkTheJob')}
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-sm leading-relaxed muted sm:text-base">
            {t('heroBody')}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href={currentUser ? '/dashboard' : '/register'}
              className={buttonStyles({ variant: 'primary', size: 'lg' })}
            >
              {currentUser ? t('goToDashboard') : t('startYourWorkspace')}
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </Link>
            <Link href="#features" className={buttonStyles({ variant: 'secondary', size: 'lg' })}>
              {t('seeWhatItDoes')}
            </Link>
          </div>

          <p className="mt-6 font-mono text-2xs muted">{t('runsOnYourServer')}</p>
        </div>

        {/* Bento: mixed tiles rather than one screenshot. */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <PreviewTile />
          </div>
          <StatTile value="9" label={t('modulesOneDatabase')} tone="ink" />
          <StatTile value="0" label={t('perSeatFees')} tone="accent" />
          <div className="col-span-2">
            <ChartTile label={t('leadsThisMonth')} bars={[28, 44, 36, 60, 52, 78, 96]} />
          </div>
        </div>
      </Container>

      {/* ── Providers ───────────────────────────────────────────────────── */}
      <Band tone="surface">
        <Container className="py-8">
          <p className="mb-5 text-center font-mono text-2xs uppercase tracking-[0.18em] muted">
            {t('bringYourOwnKeysFor')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
            {['Anthropic', 'OpenAI', 'Twilio', 'Stripe', 'Paystack', 'Google Maps'].map((n) => (
              <span key={n} className="font-display text-sm font-semibold tracking-tight muted">
                {n}
              </span>
            ))}
          </div>
        </Container>
      </Band>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <Container id="features" className="py-16 sm:py-24">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <Marker n="02" label={t('features')} />
            <Headline className="mt-5" accent={t('toDoBadly')}>
              {t('nineJobsASmallBusiness')}
            </Headline>
          </div>
          <p className="text-sm leading-relaxed muted">{t('featuresBody')}</p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([key, body], i) => (
            <FeatureCard key={key} title={t(key)} body={t(body)} tone={i === 2 ? 'accent' : 'paper'} />
          ))}
        </div>
      </Container>

      {/* ── Stats band ──────────────────────────────────────────────────── */}
      <Band tone="ink">
        <Container className="grid grid-cols-1 gap-10 py-16 lg:grid-cols-[1fr_1.2fr] lg:items-center sm:py-20">
          <div>
            <Marker n="03" label={t('whyItIsDifferent')} onInk />
            <Headline className="mt-5" accent={t('notRented')}>
              {t('youOwnTheWholeThing')}
            </Headline>
          </div>
          <div className="grid grid-cols-2 gap-x-10 gap-y-8 sm:grid-cols-3">
            {[
              ['100%', t('yourDataYourServer')],
              ['$0', t('recurringPlatformFee')],
              ['10 min', t('typicalInstallTime')],
            ].map(([v, l]) => (
              <div key={v}>
                <p className="font-display text-3xl font-bold leading-none tracking-tight tabular-nums sm:text-4xl">
                  {v}
                </p>
                <p className="mt-2 text-2xs leading-snug text-[#98A1B0]">{l}</p>
              </div>
            ))}
          </div>
        </Container>
      </Band>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <Container id="how" className="py-16 sm:py-24">
        <Marker n="04" label={t('howItWorks')} />
        <Headline className="mt-5 max-w-2xl" accent={t('withinTheHour')}>
          {t('installedConfiguredAndAnswering')}
        </Headline>

        <ol className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-border)] md:grid-cols-3">
          {[
            ['installOnYourServer', 'installOnYourServerBody'],
            ['addYourOwnKeys', 'addYourOwnKeysBody'],
            ['tellItAboutTheBusiness', 'tellItAboutTheBusinessBody'],
          ].map(([title, body], i) => (
            <li key={title} className="bg-[color:var(--color-elevated)] p-6">
              <span className="font-mono text-2xs text-accent">{`0${i + 1}`}</span>
              <h3 className="mt-3 font-display text-sm font-semibold">{t(title)}</h3>
              <p className="mt-2 text-xs leading-relaxed muted">{t(body)}</p>
            </li>
          ))}
        </ol>
      </Container>

      {/* ── FAQ: heading left, items right ──────────────────────────────── */}
      <Band tone="surface">
        <Container id="faq" className="grid grid-cols-1 gap-10 py-16 lg:grid-cols-[0.8fr_1.2fr] sm:py-24">
          <div>
            <Marker n="05" label={t('questions')} />
            <Headline className="mt-5" accent={t('askFirst')}>
              {t('theThingsBuyers')}
            </Headline>
          </div>
          <div>
            {[
              ['faqDataQ', 'faqDataA'],
              ['faqFeeQ', 'faqFeeA'],
              ['faqVoiceQ', 'faqVoiceA'],
              ['faqWhiteLabelQ', 'faqWhiteLabelA'],
              ['faqRequirementsQ', 'faqRequirementsA'],
            ].map(([q, a]) => (
              <Faq key={q} q={t(q)} a={t(a)} />
            ))}
          </div>
        </Container>
      </Band>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <Band tone="ink">
        <Container className="py-16 sm:py-20">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.2fr_auto] lg:items-end">
            <Headline accent={t('inUnderTenMinutes')}>{t('installItOnYourOwn')}</Headline>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={currentUser ? '/dashboard' : '/register'}
                className={buttonStyles({ variant: 'primary', size: 'lg' })}
              >
                {currentUser ? t('goToDashboard') : t('startYourWorkspace')}
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
              </Link>
              {!currentUser && (
                <Link
                  href="/login"
                  className="rounded-control border border-white/20 px-6 py-3 text-sm transition-colors duration-150 ease-out hover:bg-white/10"
                >
                  {t('signIn')}
                </Link>
              )}
            </div>
          </div>
        </Container>
      </Band>

      {/* ── Footer with oversized wordmark ──────────────────────────────── */}
      <footer className="pt-14">
        <Container>
          <div className="flex flex-wrap items-start justify-between gap-8 border-b border-[color:var(--color-border)] pb-10">
            <nav className="flex flex-wrap gap-x-8 gap-y-2 text-xs">
              {legalPages.map((page) => (
                <Link
                  key={page.slug}
                  href={`/p/${page.slug}`}
                  className="muted transition-colors duration-150 ease-out hover:text-[color:var(--color-fg)]"
                >
                  {page.title}
                </Link>
              ))}
              <Link
                href={currentUser ? '/dashboard' : '/login'}
                className="muted transition-colors duration-150 ease-out hover:text-[color:var(--color-fg)]"
              >
                {currentUser ? t('goToDashboard') : t('signIn')}
              </Link>
            </nav>
            <p className="font-mono text-2xs muted">v{install.version}</p>
          </div>

          {/* The wordmark is the footer, as in the references. */}
          <p
            aria-hidden
            className="select-none py-6 text-center font-display text-[18vw] font-bold leading-[0.85] tracking-tighter text-[color:var(--color-fg)] opacity-[0.07] sm:text-[15vw]"
          >
            ROSTER
          </p>
        </Container>
      </footer>

      {/*
        The product's own chat widget, running on the landing page — the
        quickest way to show a visitor what it does is to let them talk to it.

        Driven entirely by an environment variable, and absent when that is
        unset. A workspace slug hardcoded here would ship inside every copy
        sold, pointing a buyer's landing page at someone else's install.

        No data-roster-host: the script src is same-origin, so the widget
        derives the host from it and this stays correct on any domain.
      */}
      {widgetWorkspace && (
        <Script
          src="/widget.js"
          data-roster-workspace={widgetWorkspace}
          strategy="afterInteractive"
        />
      )}
    </div>
  );
}
