'use client';
import { useTranslations } from 'next-intl';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Copy, Lock, XCircle } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorBlock,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Switch,
  Textarea,
} from '@/components/ui';
import { PROVIDER_FIELDS, PROVIDER_LABELS, PROVIDER_WEBHOOKS } from '@/components/settings/shared';
import type { Integration, Notify, ProviderField } from '@/components/settings/shared';
import { relativeTime } from '@/lib/utils';
function useAppOrigin() {
  const [origin, setOrigin] = useState(
    (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, ''),
  );

  // Falls back to wherever the dashboard is being served from, which is right
  // often enough to be useful on an install where NEXT_PUBLIC_APP_URL is unset.
  useEffect(() => {
    if (!origin) setOrigin(window.location.origin);
  }, [origin]);

  return origin;
}

export function Integrations({ onNotify }: { onNotify: Notify }) {
  const t = useTranslations('settingsPage');
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [editing, setEditing] = useState<Integration | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const origin = useAppOrigin();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/integrations');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setForbidden(res.status === 403);
        setError(
          res.status === 403
            ? 'Your role cannot manage integrations.'
            : data.error ?? 'Could not load your integrations.',
        );
        return;
      }
      setForbidden(false);
      setIntegrations(data.integrations ?? []);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const test = async (provider: string) => {
    setTesting(provider);
    try {
      const res = await fetch(`/api/settings/integrations?provider=${provider}`, {
        method: 'PUT',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return onNotify(data.error ?? 'Could not run that test.', 'alert');
      }
      onNotify(
        data.ok ? `${PROVIDER_LABELS[provider]} is working.` : data.message ?? 'Test failed.',
        data.ok ? 'success' : 'alert',
      );
      void load();
    } catch {
      onNotify('Could not reach the server. Check your connection and try again.', 'alert');
    } finally {
      setTesting(null);
    }
  };

  if (loading) return <LoadingBlock label={t('loadingIntegrations')} />;

  if (forbidden) {
    return (
      <Card>
        <EmptyState
          icon={<Lock strokeWidth={1.75} />}
          title={t('yourRoleCannotManageIntegrations')}
          description={t('apiKeysAndProviderCredentials')}
        />
      </Card>
    );
  }

  if (error) return <ErrorBlock message={error} onRetry={() => void load()} />;

  return (
    <>
      <Card>
        <CardHeader
          title={t('thirdPartyServices')}
          description={t('yourKeysStoredEncryptedAt')}
        />
        <ul className="divide-y divide-[color:var(--color-border)]">
          {integrations.map((integration) => (
            <li key={integration.provider} className="px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">
                      {PROVIDER_LABELS[integration.provider] ?? integration.provider}
                    </p>
                    {integration.configured ? (
                      <Badge tone="success">{t('configured')}</Badge>
                    ) : (
                      <Badge>{t('notSet')}</Badge>
                    )}
                    {integration.source === 'environment' && integration.configured && (
                      <Badge tone="info">from .env</Badge>
                    )}
                    {integration.lastTestOk === true && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" strokeWidth={1.75} />
                    )}
                    {integration.lastTestOk === false && (
                      <XCircle className="h-3.5 w-3.5 text-alert" strokeWidth={1.75} />
                    )}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-xs muted">
                    {Object.entries(integration.fields)
                      .filter(([, v]) => v)
                      .map(([k, v]) => `${k}=${v}`)
                      .join('  ') || 'no values set'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {integration.configured && (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={testing === integration.provider}
                      onClick={() => void test(integration.provider)}
                    >{t('test')}</Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => setEditing(integration)}>
                    {integration.configured ? 'Edit' : 'Connect'}
                  </Button>
                </div>
              </div>

              {PROVIDER_WEBHOOKS[integration.provider] && (
                <WebhookTargets
                  provider={integration.provider}
                  origin={origin}
                  onCopied={() => onNotify('URL copied.', 'success')}
                  onCopyFailed={() =>
                    onNotify('Could not copy — select the URL and copy it manually.', 'alert')
                  }
                />
              )}
            </li>
          ))}
        </ul>
      </Card>

      {editing && (
        <IntegrationModal
          integration={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onNotify('Credentials saved.', 'success');
            void load();
          }}
          onError={(m) => onNotify(m, 'alert')}
        />
      )}
    </>
  );
}

function WebhookTargets({
  provider,
  origin,
  onCopied,
  onCopyFailed,
}: {
  provider: string;
  origin: string;
  onCopied: () => void;
  onCopyFailed: () => void;
}) {
  const t = useTranslations('settingsPage');
  const hooks = PROVIDER_WEBHOOKS[provider] ?? [];

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      onCopied();
    } catch {
      onCopyFailed();
    }
  };

  return (
    <div className="mt-3 rounded-control border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3">
      <p className="label-caps mb-2">Register these URLs with {PROVIDER_LABELS[provider]}</p>
      <ul className="space-y-1.5">
        {hooks.map((hook) => {
          const url = `${origin}${hook.path}`;
          return (
            <li key={hook.path} className="flex flex-wrap items-center gap-2">
              <span className="w-64 shrink-0 text-xs muted">{hook.label}</span>
              <code className="scrollbar-thin min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs">
                {url}
              </code>
              <button
                type="button"
                aria-label={`Copy URL for ${hook.label}`}
                onClick={() => void copy(url)}
                className="rounded-control p-1.5 muted transition-colors hover:text-[color:var(--color-fg)]"
              >
                <Copy className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs muted">{t('nothingReachesRosterUntilThese')}</p>
    </div>
  );
}

function IntegrationModal({
  integration,
  onClose,
  onSaved,
  onError,
}: {
  integration: Integration;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations('settingsPage');
  const provider = integration.provider;
  const fields = PROVIDER_FIELDS[provider] ?? [];

  // Secrets come back masked, so they start blank and blank means "unchanged".
  // Everything else is seeded with the value in force, so saving is a no-op for
  // the fields the buyer did not touch.
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seeded: Record<string, string> = {};
    for (const field of fields) {
      if (field.type === 'password') continue;
      const current = integration.fields[field.key];
      if (field.type === 'boolean') {
        seeded[field.key] = String(current).toLowerCase() === 'true' ? 'true' : 'false';
      } else if (current) {
        seeded[field.key] = current;
      }
    }
    return seeded;
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/settings/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, credentials: values }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return onError(data.error ?? 'Could not save those credentials.');
      onSaved();
    } catch {
      onError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={PROVIDER_LABELS[provider] ?? provider}
      description={t('leaveASecretBlankTo')}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" size="sm" loading={busy} onClick={() => void submit()}>{t('save')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {fields.map((field) =>
          field.type === 'boolean' ? (
            <div key={field.key} className="rounded-control border border-[color:var(--color-border)] p-3">
              <Switch
                checked={values[field.key] === 'true'}
                onChange={(checked) =>
                  setValues({ ...values, [field.key]: checked ? 'true' : 'false' })
                }
                label={field.label}
                description={field.hint}
              />
            </div>
          ) : field.type === 'json' ? (
            // A service-account key is ~2kB of multi-line JSON. A masked
            // single-line input makes it impossible to see what was pasted or
            // spot a truncated copy, which is the usual way this goes wrong.
            <Field key={field.key} label={field.label} hint={field.hint}>
              <Textarea
                value={values[field.key] ?? ''}
                onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                className="min-h-[160px] font-mono text-[11px] leading-relaxed"
                spellCheck={false}
                autoComplete="off"
                placeholder={'{\n  "type": "service_account",\n  "project_id": "…",\n  "private_key": "-----BEGIN PRIVATE KEY-----…"\n}'}
              />
            </Field>
          ) : (
            <Field key={field.key} label={field.label} hint={field.hint}>
              <Input
                type={field.type ?? 'text'}
                value={values[field.key] ?? ''}
                onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                className="font-mono text-xs"
                autoComplete="off"
              />
            </Field>
          ),
        )}
        <p className="text-xs muted">
          Stored with AES-256-GCM encryption. They are never shown again in full — only the first
          and last four characters.
        </p>
      </div>
    </Modal>
  );
}

// ── Team ─────────────────────────────────────────────────────────────────────