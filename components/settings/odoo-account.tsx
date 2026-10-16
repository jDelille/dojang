'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card, CardBody, CardHeader, Field, Input } from '@/components/ui';
import { explainHubError } from '@/lib/hub-actions';
import type { Notify } from '@/components/settings/shared';

type Principal = { name?: string; role?: string };
type HubStatus =
  | { status: 'loading' | 'notConfigured' | 'disconnected' | 'offline' }
  | { status: 'connected'; context: { principal?: Principal } };

/**
 * Connects this staff member's own Odoo account to the companion hub. Odoo
 * checks their hub role on every action; the password is sent once and never
 * stored.
 */
export function OdooAccount({ onNotify }: { onNotify: Notify }) {
  const t = useTranslations('odooHub');
  const [hub, setHub] = useState<HubStatus>({ status: 'loading' });
  const [form, setForm] = useState({ login: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/hub')
      .then((r) => r.json())
      .then(setHub)
      .catch(() => setHub({ status: 'offline' }));
  }, []);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/hub', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.code ?? 'BACKEND_UNAVAILABLE');
    return data;
  };

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await post({ operation: 'connect', login: form.login, password: form.password });
      setForm({ login: '', password: '' });
      setHub(data);
      onNotify(t('connected'), 'success');
    } catch (e) {
      setForm((f) => ({ ...f, password: '' }));
      setError(explainHubError(e instanceof Error ? e.message : ''));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const data = await post({ operation: 'disconnect' });
      setHub({ status: 'disconnected' });
      onNotify(data.backendRevoked === false ? t('disconnectedLocally') : t('disconnected'), 'success');
    } catch {
      onNotify(t('offline'), 'alert');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title={t('title')} description={t('description')} />
      <CardBody className="space-y-4">
        {hub.status === 'loading' && <p className="text-sm text-muted">{t('checking')}</p>}
        {hub.status === 'notConfigured' && <p className="text-sm text-muted">{t('notConfigured')}</p>}
        {hub.status === 'offline' && <p className="text-sm text-muted">{t('offline')}</p>}

        {hub.status === 'connected' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="label-caps">{t('odooUser')}</dt>
                <dd className="mt-1 text-sm">{hub.context.principal?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="label-caps">{t('hubRole')}</dt>
                <dd className="mt-1 text-sm">{hub.context.principal?.role ?? '—'}</dd>
              </div>
            </dl>
            <Button variant="secondary" onClick={() => void disconnect()} loading={busy}>
              {t('disconnect')}
            </Button>
          </div>
        )}

        {hub.status === 'disconnected' && (
          <form onSubmit={(e) => void connect(e)} className="max-w-md space-y-4">
            <Field label={t('login')} required>
              <Input
                value={form.login}
                onChange={(e) => setForm({ ...form, login: e.target.value })}
                autoComplete="username"
                required
              />
            </Field>
            <Field label={t('password')} required hint={t('passwordHint')} error={error ?? undefined}>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="current-password"
                required
              />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={busy}>
                {t('connect')}
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
