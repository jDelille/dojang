'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Database,
  Loader2,
  ServerCog,
  XCircle,
} from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, Field, Input } from '@/components/ui';
import { cn } from '@/lib/utils';

type EnvCheck = {
  key: string;
  label: string;
  present: boolean;
  required: boolean;
  hint: string;
};

type Checks = {
  environment: EnvCheck[];
  database: { ok: boolean; message: string };
  redis: { ok: boolean; message: string };
};

/**
 * Install wizard (spec §9). CodeCanyon reviewers weight this heavily, so it
 * checks the environment first and explains every failure in plain language
 * rather than dumping a stack trace.
 */
export default function InstallPage() {
  const t = useTranslations('install');
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [checks, setChecks] = useState<Checks | null>(null);
  const [alreadyInstalled, setAlreadyInstalled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    workspaceName: '',
    niche: '',
    purchaseCode: '',
    anthropicKey: '',
    openaiKey: '',
  });

  const loadChecks = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/install');
      const data = await res.json();
      setChecks(data.checks);
      setAlreadyInstalled(Boolean(data.state?.completed) || Boolean(data.alreadyHasUsers));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadChecks();
  }, []);

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Installation failed.');
        return;
      }
      setStep(4);
    } finally {
      setBusy(false);
    }
  };

  const requiredOk =
    checks?.database.ok &&
    checks.environment.filter((c) => c.required).every((c) => c.present);

  if (loading) {
    return (
      <Screen>
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin muted" strokeWidth={1.75} />
        </div>
      </Screen>
    );
  }

  if (alreadyInstalled && step < 4) {
    return (
      <Screen>
        <Card>
          <CardBody className="text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-success" strokeWidth={1.75} />
            <h1 className="mt-4 font-display text-lg font-semibold">{t('rosterIsAlreadyInstalled')}</h1>
            <p className="mt-1 text-sm muted">
              This installer is disabled once an account exists — it would otherwise be a permanent
              way in.
            </p>
            <Button
              variant="primary"
              className="mt-6"
              onClick={() => router.push('/login')}
            >
              Go to sign in
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          </CardBody>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <ol className="mb-6 flex items-center gap-2">
        {['System check', 'Your account', 'AI provider', 'Done'].map((label, index) => {
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
              <span
                className={cn(
                  'hidden text-xs sm:block',
                  state === 'todo' ? 'muted' : 'font-medium',
                )}
              >
                {label}
              </span>
              {number < 4 && <span className="h-px flex-1 bg-[color:var(--color-border)]" />}
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

      {step === 1 && checks && (
        <Card>
          <CardHeader
            title={t('systemCheck')}
            description={t('rosterNeedsTheseBeforeIt')}
          />
          <CardBody className="space-y-4">
            <div className="space-y-2">
              <ServiceRow
                icon={Database}
                label={t('postgresql')}
                ok={checks.database.ok}
                message={
                  checks.database.ok
                    ? 'Connected.'
                    : `${checks.database.message} — check DATABASE_URL, then run "npm run db:deploy".`
                }
                required
              />
              <ServiceRow
                icon={ServerCog}
                label={t('redis')}
                ok={checks.redis.ok}
                message={
                  checks.redis.ok
                    ? 'Connected.'
                    : `${checks.redis.message} — background jobs (lead gen, retention, reminders) will not run until this is fixed.`
                }
                required={false}
              />
            </div>

            <div className="rounded-control border border-[color:var(--color-border)]">
              <p className="label-caps border-b border-[color:var(--color-border)] px-4 py-2.5">{t('environmentVariables')}</p>
              <ul className="divide-y divide-[color:var(--color-border)]">
                {checks.environment.map((check) => (
                  <li key={check.key} className="flex items-start gap-3 px-4 py-2.5">
                    {check.present ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" strokeWidth={1.75} />
                    ) : check.required ? (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-alert" strokeWidth={1.75} />
                    ) : (
                      <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 muted" strokeWidth={1.75} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{check.key}</span>
                        {!check.required && <Badge>optional</Badge>}
                      </div>
                      {!check.present && <p className="mt-0.5 text-xs muted">{check.hint}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" size="sm" onClick={() => void loadChecks()}>{t('reRunChecks')}</Button>
              <Button
                variant="primary"
                disabled={!requiredOk}
                onClick={() => setStep(2)}
              >
                Continue
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
              </Button>
            </div>

            {!requiredOk && (
              <p className="text-xs muted">
                Fix everything marked in red above, then re-run the checks. Redis is not required to
                finish installing, but background jobs stay queued until it is reachable.
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader
            title={t('yourAccount')}
            description={t('thisFirstAccountBecomesThe')}
          />
          <CardBody className="space-y-4">
            <Field label={t('yourName')} required>
              <Input
                value={form.adminName}
                onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                autoFocus
              />
            </Field>
            <Field label={t('email')} required>
              <Input
                type="email"
                value={form.adminEmail}
                onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
              />
            </Field>
            <Field label={t('password')} required hint="min 8 characters">
              <Input
                type="password"
                value={form.adminPassword}
                onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('businessWorkspaceName')} required>
                <Input
                  value={form.workspaceName}
                  onChange={(e) => setForm({ ...form, workspaceName: e.target.value })}
                />
              </Field>
              <Field label={t('industry')}>
                <Input
                  value={form.niche}
                  onChange={(e) => setForm({ ...form, niche: e.target.value })}
                  placeholder={t('plumbingDentalAgency')}
                />
              </Field>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>{t('back')}</Button>
              <Button
                variant="primary"
                disabled={
                  !form.adminName ||
                  !form.adminEmail ||
                  form.adminPassword.length < 8 ||
                  !form.workspaceName
                }
                onClick={() => setStep(3)}
              >
                Continue
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader
            title={t('aiProviderAndLicense')}
            description={t('bothAreOptionalHereYou')}
          />
          <CardBody className="space-y-4">
            <Field label={t('anthropicApiKey')} hint="for Claude agents">
              <Input
                type="password"
                value={form.anthropicKey}
                onChange={(e) => setForm({ ...form, anthropicKey: e.target.value })}
                placeholder="sk-ant-…"
                className="font-mono text-xs"
              />
            </Field>
            <Field label={t('openaiApiKey')} hint="for GPT agents">
              <Input
                type="password"
                value={form.openaiKey}
                onChange={(e) => setForm({ ...form, openaiKey: e.target.value })}
                placeholder="sk-…"
                className="font-mono text-xs"
              />
            </Field>
            <Field label={t('envatoPurchaseCode')} hint="unlocks support and updates">
              <Input
                value={form.purchaseCode}
                onChange={(e) => setForm({ ...form, purchaseCode: e.target.value })}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="font-mono text-xs"
              />
            </Field>

            <p className="text-xs muted">
              Keys are encrypted with AES-256-GCM before they touch the database, using your
              ENCRYPTION_KEY. Changing that key later makes stored keys unreadable, so keep a
              backup of it.
            </p>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}>{t('back')}</Button>
              <Button variant="primary" loading={busy} onClick={() => void submit()}>{t('installRoster')}</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardBody className="text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-success" strokeWidth={1.75} />
            <h1 className="mt-4 font-display text-lg font-semibold">{t('rosterIsInstalled')}</h1>
            <p className="mt-1 text-sm muted">
              Sign in and your workspace is ready — default pipeline, a starter AI agent, and
              everything wired up.
            </p>

            <div className="mt-6 rounded-control border border-[color:var(--color-border)] p-4 text-start">
              <p className="label-caps mb-2">{t('oneLastThing')}</p>
              <p className="text-xs muted">
                Start the background worker alongside your web process, or lead generation,
                retention sends and reminders will queue up and never run:
              </p>
              <pre className="mt-2 overflow-x-auto rounded-control bg-[color:var(--color-bg)] p-3 font-mono text-xs">
                npm run workers
              </pre>
            </div>

            <Button variant="primary" className="mt-6" onClick={() => router.push('/login')}>
              Sign in
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          </CardBody>
        </Card>
      )}
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  const t = useTranslations('install');
  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--color-paper)] px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-control bg-accent text-sm font-bold text-[color:var(--color-accent-fg)]">
            R
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">{t('roster')}</span>
          <Badge>{t('installer')}</Badge>
        </div>
        {children}
      </div>
    </div>
  );
}

function ServiceRow({
  icon: Icon,
  label,
  ok,
  message,
  required,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  ok: boolean;
  message: string;
  required: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-control border p-3',
        ok
          ? 'border-[color:var(--color-border)]'
          : required
            ? 'border-alert/40'
            : 'border-warning/40',
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 muted" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{label}</p>
          <Badge tone={ok ? 'success' : required ? 'alert' : 'warning'}>
            {ok ? 'Connected' : required ? 'Required' : 'Recommended'}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs muted">{message}</p>
      </div>
    </div>
  );
}
