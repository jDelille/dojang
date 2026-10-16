'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorBlock,
  Field, Input, LoadingBlock, Modal, PageHeader, Select, Spinner, StatusDot, Switch,
  Table, Tabs, Td, Textarea, Th, Tr, useToast,
} from '@/components/ui';
import { STATUSES } from '@/components/leads/types';
import type { Owner } from '@/components/leads/types';

export function GatherModal({
  open,
  onClose,
  onQueued,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onQueued: () => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations('leads');
  const [niche, setNiche] = useState('');
  const [regions, setRegions] = useState('');
  const [count, setCount] = useState(50);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const countries = regions
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    if (!niche.trim()) return onError('Describe the kind of business to find.');
    if (!countries.length) return onError('Add at least one city, region or country.');

    setBusy(true);
    try {
      const res = await fetch('/api/leads/gather', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: niche.trim(),
          countries,
          targetCount: Math.min(Math.max(Math.round(count) || 50, 1), 500),
        }),
      });
      const data = await res.json();
      if (!res.ok) return onError(data.error ?? 'Could not start the search.');
      onQueued();
    } catch {
      onError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('gatherLeadsFromGoogleMaps')}
      description={t('rosterSearchesMapsForBusinesses')}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" size="sm" loading={busy} onClick={() => void submit()}>{t('startSearch')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('businessType')} required hint="what you'd type into Maps">
          <Input
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="dental clinics"
          />
        </Field>
        <Field label={t('citiesRegionsOrCountries')} required hint="comma separated">
          <Input
            value={regions}
            onChange={(e) => setRegions(e.target.value)}
            placeholder={t('austinTxDallasTxHouston')}
          />
        </Field>
        <Field label={t('howManyLeads')} hint="max 500">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </Field>
        <p className="text-xs muted">
          Duplicates are skipped automatically — a business already in your list won&apos;t be added
          twice, whether it matches on Google place ID or phone number.
        </p>
      </div>
    </Modal>
  );
}

export function ManualLeadModal({
  open,
  onClose,
  onCreated,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations('leads');
  const [form, setForm] = useState({
    businessName: '',
    contactName: '',
    phone: '',
    email: '',
    city: '',
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.businessName.trim()) return onError('A business name is required.');

    setBusy(true);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source: 'manual' }),
      });
      const data = await res.json();
      if (!res.ok) return onError(data.error ?? 'Could not add that lead.');
      setForm({ businessName: '', contactName: '', phone: '', email: '', city: '' });
      onCreated();
    } catch {
      onError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('addALead')}
      width="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" size="sm" loading={busy} onClick={() => void submit()}>{t('addLead')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('businessName')} required>
          <Input
            value={form.businessName}
            onChange={(e) => setForm({ ...form, businessName: e.target.value })}
          />
        </Field>
        <Field label={t('contactName')}>
          <Input
            value={form.contactName}
            onChange={(e) => setForm({ ...form, contactName: e.target.value })}
            autoComplete="name"
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('phone')}>
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label={t('email')}>
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
        </div>
        <Field label={t('city')}>
          <Input
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            autoComplete="address-level2"
          />
        </Field>
      </div>
    </Modal>
  );
}
