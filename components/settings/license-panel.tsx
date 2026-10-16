'use client';
import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { BadgeCheck, ShieldCheck } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
} from '@/components/ui';
import type { Notify } from '@/components/settings/shared';
export function License({
  initial,
  onNotify,
}: {
  initial: { status: string; message: string; domain: string; exempt: boolean };
  onNotify: Notify;
}) {
  const t = useTranslations('settingsPage');
  const [state, setState] = useState(initial);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    if (!code.trim()) return onNotify('Enter your Envato purchase code.', 'alert');

    setBusy(true);
    try {
      const res = await fetch('/api/license/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseCode: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return onNotify(data.error ?? 'Verification failed.', 'alert');

      setState({ ...state, status: data.status, message: data.message });
      onNotify(data.message, data.status === 'active' ? 'success' : 'alert');
    } catch {
      onNotify('Could not reach the server. Check your connection and try again.', 'alert');
    } finally {
      setBusy(false);
    }
  };

  const tone =
    state.status === 'active' ? 'success' : state.status === 'unverified' ? 'warning' : 'alert';

  return (
    <Card>
      <CardHeader
        title={t('license')}
        description={t('verifyYourEnvatoPurchaseCode')}
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-control border border-[color:var(--color-border)] p-4">
          {state.status === 'active' ? (
            <BadgeCheck className="h-5 w-5 text-success" strokeWidth={1.75} />
          ) : (
            <ShieldCheck className="h-5 w-5 muted" strokeWidth={1.75} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{t('licenseStatus')}</p>
              <Badge tone={tone as never}>{state.status.replace('_', ' ')}</Badge>
            </div>
            <p className="mt-0.5 text-xs muted">{state.message}</p>
            <p className="mt-1 font-mono text-xs muted">
              Locked to: {state.domain}
              {state.exempt && ' (local development — not locked)'}
            </p>
          </div>
        </div>

        <Field label={t('envatoPurchaseCode')} hint="8-4-4-4-12 format">
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="font-mono text-xs"
            />
            <Button variant="primary" loading={busy} onClick={() => void verify()}>{t('verify')}</Button>
          </div>
        </Field>

        <p className="text-xs muted">
          Find your purchase code in your Envato downloads page — click the download button next to
          Roster and choose &ldquo;License certificate &amp; purchase code&rdquo;.
        </p>
      </CardBody>
    </Card>
  );
}