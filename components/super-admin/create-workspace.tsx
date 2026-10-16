'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button, Field, Input, Modal, useToast } from '@/components/ui';

/**
 * Provisions a sub-account. /api/workspaces POST already supported this;
 * nothing in the UI called it, so agency mode could not actually be used.
 */
export function CreateWorkspace() {
  const t = useTranslations('superAdminPage');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '',
    niche: '',
    adminEmail: '',
    adminPassword: '',
  });
  const toast = useToast();

  const submit = async () => {
    if (!form.name.trim()) return toast.show('Give the workspace a name.', 'alert');
    if (form.adminEmail && form.adminPassword.length < 8) {
      return toast.show('The admin password needs at least 8 characters.', 'alert');
    }

    setBusy(true);
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          niche: form.niche || null,
          ...(form.adminEmail
            ? { adminEmail: form.adminEmail.trim(), adminPassword: form.adminPassword }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.show(data.error ?? 'Could not create that workspace.', 'alert');
        return;
      }

      setOpen(false);
      setForm({ name: '', niche: '', adminEmail: '', adminPassword: '' });
      toast.show(`${data.workspace.name} created.`, 'success');
      router.refresh();
    } catch {
      toast.show('Could not reach the server.', 'alert');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" strokeWidth={1.75} />{t('newWorkspace')}</Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('newWorkspace')}
        width="sm"
        description={t('provisionsATenantWithIts')}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>{t('cancel')}</Button>
            <Button variant="primary" size="sm" loading={busy} onClick={() => void submit()}>{t('createWorkspace')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('businessName')} required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('acmePlumbing')}
            />
          </Field>

          <Field label={t('industry')}>
            <Input
              value={form.niche}
              onChange={(e) => setForm({ ...form, niche: e.target.value })}
              placeholder={t('plumbingDentalRealEstate')}
            />
          </Field>

          <div className="rounded-control border border-[color:var(--color-border)] p-3">
            <p className="label-caps mb-3">{t('optionalCreateTheirAdminLogin')}</p>
            <div className="space-y-4">
              <Field label={t('adminEmail')}>
                <Input
                  type="email"
                  inputMode="email"
                  value={form.adminEmail}
                  onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                  placeholder="owner@acmeplumbing.com"
                />
              </Field>
              <Field label={t('temporaryPassword')} hint="min 8 characters">
                <Input
                  type="password"
                  value={form.adminPassword}
                  onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                />
              </Field>
            </div>
            <p className="mt-3 text-xs muted">
              Leave blank to create the workspace now and invite their team later from the
              workspace&apos;s own settings.
            </p>
          </div>
        </div>
      </Modal>

      {toast.node}
    </>
  );
}
