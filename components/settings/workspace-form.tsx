'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Select,
} from '@/components/ui';
import { useTranslations } from 'next-intl';
import { can } from '@/lib/rbac';
import type { Notify, Workspace } from '@/components/settings/shared';
import type { Role } from '@prisma/client';
export function WorkspaceForm({
  workspace,
  mode,
  canEdit,
  onSaved,
  onError,
}: {
  workspace: Workspace;
  mode: string;
  canEdit: boolean;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations('settingsPage');
  const [form, setForm] = useState(workspace);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          niche: form.niche,
          timezone: form.timezone,
          currency: form.currency,
          businessName: form.businessName,
          businessPhone: form.businessPhone,
          businessEmail: form.businessEmail || null,
          businessAddress: form.businessAddress,
          logoUrl: form.logoUrl || null,
          accentColor: form.accentColor || null,
          customDomain: form.customDomain || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return onError(data.error ?? 'Could not save.');
      onSaved();
    } catch {
      onError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'branding') {
    return (
      <Card>
        <CardHeader
          title={t('whiteLabel')}
          description="Your logo and accent color replace Roster's throughout this workspace."
        />
        <CardBody className="space-y-4">
          {!canEdit && <ReadOnlyNote />}

          <Field label={t('logoUrl')} hint="displayed in the sidebar and on emails">
            <Input
              value={form.logoUrl ?? ''}
              onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              placeholder="https://example.com/logo.svg"
              disabled={!canEdit}
            />
          </Field>

          <Field label={t('accentColor')} hint="6-digit hex">
            <div className="flex gap-2">
              <Input
                value={form.accentColor ?? ''}
                onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                placeholder="#E8A33D"
                className="font-mono"
                disabled={!canEdit}
              />
              <input
                type="color"
                aria-label={t('pickAccentColor')}
                value={form.accentColor || '#E8A33D'}
                onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                disabled={!canEdit}
                className="h-9 w-12 shrink-0 cursor-pointer rounded-control border border-[color:var(--color-border)] bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </Field>

          <Field label={t('customDomain')} hint="point a CNAME at this install first">
            <Input
              value={form.customDomain ?? ''}
              onChange={(e) => setForm({ ...form, customDomain: e.target.value })}
              placeholder="app.yourclient.com"
              disabled={!canEdit}
            />
          </Field>

          <div className="rounded-control border border-[color:var(--color-border)] p-3">
            <p className="label-caps mb-2">{t('preview')}</p>
            <div className="flex items-center gap-3">
              <span
                className="flex h-8 items-center rounded-control px-4 text-xs font-medium"
                style={{
                  background: form.accentColor || '#E8A33D',
                  color: '#1C1403',
                }}
              >{t('primaryButton')}</span>
              <span className="text-xs muted">Workspace slug: {workspace.slug}</span>
            </div>
          </div>

          {canEdit && (
            <div className="flex justify-end">
              <Button variant="primary" loading={busy} onClick={() => void save()}>{t('saveBranding')}</Button>
            </div>
          )}
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={t('businessDetails')}
        description={t('yourAiAgentsAnswerFrom')}
      />
      <CardBody className="space-y-4">
        {!canEdit && <ReadOnlyNote />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('workspaceName')} required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('tradingName')} hint="what customers call you">
            <Input
              value={form.businessName ?? ''}
              onChange={(e) => setForm({ ...form, businessName: e.target.value })}
              disabled={!canEdit}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('industryNiche')}>
            <Input
              value={form.niche ?? ''}
              onChange={(e) => setForm({ ...form, niche: e.target.value })}
              placeholder={t('plumbingDentalRealEstate')}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('address')}>
            <Input
              value={form.businessAddress ?? ''}
              onChange={(e) => setForm({ ...form, businessAddress: e.target.value })}
              disabled={!canEdit}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('businessPhone')}>
            <Input
              value={form.businessPhone ?? ''}
              onChange={(e) => setForm({ ...form, businessPhone: e.target.value })}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('businessEmail')}>
            <Input
              type="email"
              value={form.businessEmail ?? ''}
              onChange={(e) => setForm({ ...form, businessEmail: e.target.value })}
              disabled={!canEdit}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('timezone')} hint="used for reminders and business hours">
            <Input
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              placeholder={t('americaNewYork')}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('currency')}>
            <Select
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              disabled={!canEdit}
            >
              {['USD', 'EUR', 'GBP', 'NGN', 'CAD', 'AUD', 'ZAR', 'GHS', 'KES'].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <Button variant="primary" loading={busy} onClick={() => void save()}>{t('saveDetails')}</Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function ReadOnlyNote() {
  const t = useTranslations('settingsPage');
  return (
    <p className="flex items-start gap-2 rounded-control border border-[color:var(--color-border)] p-3 text-xs muted">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />{t('yourRoleCanReadThese')}</p>
  );
}

// ── Opening hours and services ───────────────────────────────────────────────