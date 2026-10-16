'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Workspace setup wizard (spec §7). Everything here feeds the AI agent's
 * system prompt, so the copy explains *why* each field matters.
 */
export default function OnboardingPage() {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const [step, setStep] = useState(1);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    businessName: '',
    niche: '',
    businessPhone: '',
    businessEmail: '',
    businessAddress: '',
    timezone: 'UTC',
    currency: 'USD',
    services: '',
  });

  const [keys, setKeys] = useState({ anthropicKey: '', openaiKey: '' });

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (session?.user?.workspaceId) setWorkspaceId(session.user.workspaceId);

    // Best-effort timezone default so reminders land at sensible local times.
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) setForm((f) => (f.timezone === 'UTC' ? { ...f, timezone: tz } : f));
    } catch {
      // Older browser — UTC is a fine fallback.
    }
  }, [session, status, router]);

  const saveBusiness = async () => {
    if (!workspaceId) return setError('No workspace found. Try signing in again.');

    setBusy(true);
    setError('');
    try {
      const services = form.services
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, price] = line.split('—').map((p) => p.trim());
          return price ? { name, price } : { name };
        });

      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.businessName || undefined,
          businessName: form.businessName || null,
          niche: form.niche || null,
          businessPhone: form.businessPhone || null,
          businessEmail: form.businessEmail || null,
          businessAddress: form.businessAddress || null,
          timezone: form.timezone,
          currency: form.currency,
          services,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not save those details.');
        return;
      }
      setStep(2);
    } finally {
      setBusy(false);
    }
  };

  const saveKeys = async () => {
    setBusy(true);
    setError('');
    try {
      const save = async (provider: 'anthropic' | 'openai', apiKey: string) => {
        const res = await fetch('/api/settings/integrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, credentials: { apiKey } }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Could not save the ${provider} key.`);
        }
      };

      if (keys.anthropicKey.trim()) await save('anthropic', keys.anthropicKey.trim());
      if (keys.openaiKey.trim()) await save('openai', keys.openaiKey.trim());

      setStep(3);
    } catch (error) {
      setError((error as Error).message || 'Could not save those keys.');
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    await update();
    router.push('/dashboard');
    router.refresh();
  };

  if (status === 'loading') {
    return (
      <Screen>
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin muted" strokeWidth={1.75} />
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <ol className="mb-6 flex items-center gap-2">
        {['Your business', 'AI provider', 'Ready'].map((label, index) => {
          const number = index + 1;
          const state = step === number ? 'current' : step > number ? 'done' : 'todo';
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-pill text-[11px] font-medium',
                  state === 'done' && 'bg-success text-white',
                  state === 'current' && 'bg-accent text-[color:var(--color-accent-fg)]',
                  state === 'todo' && 'border border-[color:var(--color-border)] muted',
                )}
              >
                {state === 'done' ? '✓' : number}
              </span>
              <span className={cn('hidden text-xs sm:block', state === 'todo' ? 'muted' : 'font-medium')}>
                {label}
              </span>
              {number < 3 && <span className="h-px flex-1 bg-[color:var(--color-border)]" />}
            </li>
          );
        })}
      </ol>

      {error && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-control border border-alert/40 bg-alert/5 px-3 py-2.5 text-xs text-alert">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          {error}
        </p>
      )}

      {step === 1 && (
        <Card>
          <CardHeader
            title={t('tellUsAboutTheBusiness')}
            description={t('yourAiAgentAnswersCustomers')}
          />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('businessName')} required>
                <Input
                  value={form.businessName}
                  onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                  autoFocus
                />
              </Field>
              <Field label={t('industry')}>
                <Input
                  value={form.niche}
                  onChange={(e) => setForm({ ...form, niche: e.target.value })}
                  placeholder={t('plumbingDentalRealEstate')}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('phone')}>
                <Input
                  value={form.businessPhone}
                  onChange={(e) => setForm({ ...form, businessPhone: e.target.value })}
                />
              </Field>
              <Field label={t('email')}>
                <Input
                  type="email"
                  value={form.businessEmail}
                  onChange={(e) => setForm({ ...form, businessEmail: e.target.value })}
                />
              </Field>
            </div>

            <Field label={t('address')}>
              <Input
                value={form.businessAddress}
                onChange={(e) => setForm({ ...form, businessAddress: e.target.value })}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('timezone')} hint="reminders use this">
                <Input
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                />
              </Field>
              <Field label={t('currency')}>
                <Select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                >
                  {['USD', 'EUR', 'GBP', 'NGN', 'CAD', 'AUD', 'ZAR', 'GHS', 'KES'].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field
              label={t('servicesAndPricing')}
              hint="one per line — use an em dash for the price"
            >
              <Textarea
                value={form.services}
                onChange={(e) => setForm({ ...form, services: e.target.value })}
                placeholder={'Emergency callout — $95\nBoiler service — from $180\nBathroom install — quoted on site'}
                className="min-h-[110px]"
              />
            </Field>

            <div className="flex justify-end">
              <Button
                variant="primary"
                loading={busy}
                disabled={!form.businessName}
                onClick={() => void saveBusiness()}
              >
                Continue
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader
            title={t('connectAnAiProvider')}
            description={t('bringYourOwnKeyRoster')}
          />
          <CardBody className="space-y-4">
            <Field label={t('anthropicApiKey')} hint="recommended">
              <Input
                type="password"
                value={keys.anthropicKey}
                onChange={(e) => setKeys({ ...keys, anthropicKey: e.target.value })}
                placeholder="sk-ant-…"
                className="font-mono text-xs"
              />
            </Field>
            <Field label={t('openaiApiKey')}>
              <Input
                type="password"
                value={keys.openaiKey}
                onChange={(e) => setKeys({ ...keys, openaiKey: e.target.value })}
                placeholder="sk-…"
                className="font-mono text-xs"
              />
            </Field>
            <p className="text-xs muted">
              You can set either, both, or neither — but your agent cannot reply until at least one
              is configured. Add them any time in Settings → Integrations.
            </p>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>{t('back')}</Button>
              <Button variant="primary" loading={busy} onClick={() => void saveKeys()}>
                Continue
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardBody className="text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-success" strokeWidth={1.75} />
            <h1 className="mt-4 font-display text-lg font-semibold">{t('youAposReSetUp')}</h1>
            <p className="mt-1 text-sm muted">
              A starter agent called &ldquo;Front Desk&rdquo; is waiting, along with your default
              pipeline.
            </p>

            <ul className="mt-6 space-y-2 text-start text-sm">
              {[
                'Test your agent in AI Agents → Test chat',
                'Add your FAQs and pricing to its knowledge base',
                'Gather your first batch of leads from Google Maps',
                'Switch on a retention rule to follow up automatically',
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 rounded-control border border-[color:var(--color-border)] px-3 py-2"
                >
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 muted" strokeWidth={1.75} />
                  {item}
                </li>
              ))}
            </ul>

            <Button variant="primary" className="mt-6" onClick={() => void finish()}>{t('openTheDashboard')}</Button>
          </CardBody>
        </Card>
      )}
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  const t = useTranslations('onboarding');
  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--color-paper)] px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-control bg-accent text-sm font-bold text-[color:var(--color-accent-fg)]">
            R
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">{t('roster')}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
