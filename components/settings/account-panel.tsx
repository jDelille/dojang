'use client';
import { useTranslations } from 'next-intl';
import { ROLE_LABELS } from '@/lib/rbac';
import type { Role } from '@prisma/client';

import { useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
} from '@/components/ui';
import { PushToggle } from '@/components/push/push-toggle';
import { LanguagePicker } from '@/components/settings/language-picker';
import type { Notify } from '@/components/settings/shared';
export function Account({
  name,
  email,
  role,
  onNotify,
}: {
  name: string | null;
  email: string;
  role: Role;
  onNotify: Notify;
}) {
  const t = useTranslations('settingsPage');
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (form.next.length < 8) {
      return setError('Use a password of at least 8 characters.');
    }
    if (form.next !== form.confirm) {
      return setError('Those two passwords do not match.');
    }

    setBusy(true);
    try {
      const res = await fetch('/api/settings/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Could not change your password.');
        return;
      }
      setForm({ current: '', next: '', confirm: '' });
      onNotify('Password changed. It applies the next time you sign in.', 'success');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title={t('yourAccount')} description={t('whoYouAreSignedIn')} />
      <CardBody className="space-y-6">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <dt className="label-caps">{t('name')}</dt>
            <dd className="mt-1 text-sm">{name ?? '—'}</dd>
          </div>
          <div>
            <dt className="label-caps">{t('email')}</dt>
            <dd className="mt-1 font-mono text-xs">{email}</dd>
          </div>
          <div>
            <dt className="label-caps">{t('role')}</dt>
            <dd className="mt-1 text-sm">{ROLE_LABELS[role]}</dd>
          </div>
        </dl>

        <form onSubmit={(e) => void submit(e)} className="max-w-md space-y-4">
          <Field label={t('currentPassword')} required>
            <Input
              type="password"
              value={form.current}
              onChange={(e) => setForm({ ...form, current: e.target.value })}
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label={t('newPassword')} required hint="min 8 characters">
            <Input
              type="password"
              value={form.next}
              onChange={(e) => setForm({ ...form, next: e.target.value })}
              autoComplete="new-password"
              required
            />
          </Field>
          <Field
            label={t('confirmNewPassword')}
            required
            error={error ?? undefined}
          >
            <Input
              type="password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              autoComplete="new-password"
              required
            />
          </Field>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={busy}>{t('changePassword')}</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

// ── License ──────────────────────────────────────────────────────────────────