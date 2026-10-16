'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { Button, Field, Input, useToast } from '@/components/ui';

export function LicenseForm({ allowSkip = false }: { allowSkip?: boolean }) {
  const t = useTranslations('license');
  const router = useRouter();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/license/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseCode: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.show(data.error ?? 'Could not verify that code.', 'alert');
        return;
      }
      if (data.status === 'active') {
        toast.show('License verified. Thank you.', 'success');
        router.push('/dashboard');
        router.refresh();
        return;
      }
      toast.show(data.message ?? `Status: ${data.status}`, 'alert');
      router.refresh();
    } catch {
      toast.show('Could not reach the server.', 'alert');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={t('purchaseCode')} required>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="8f2c1a4b-90de-4c77-9b3e-1a2b3c4d5e6f"
          className="font-mono text-xs"
          spellCheck={false}
          autoFocus
        />
      </Field>
      <Button type="submit" variant="primary" loading={busy} disabled={!code.trim()} className="w-full">
        <KeyRound className="h-4 w-4" strokeWidth={1.75} />{t('verifyAndUnlock')}</Button>
      {allowSkip && (
        <Button type="button" variant="ghost" className="w-full" onClick={() => router.push('/dashboard')}>{t('continueTrial')}</Button>
      )}
      {toast.node}
    </form>
  );
}
