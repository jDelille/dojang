'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, Loader2, Save, Trash2, UserPlus } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';

export type LeadDetail = {
  id: string;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  niche: string | null;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
  status: string;
  source: string;
  notes: string | null;
  ownerId: string | null;
  contactId: string | null;
};

const STATUSES = ['new', 'contacted', 'booked', 'won', 'lost'] as const;

/**
 * Editable half of the lead detail page. The record itself is server-rendered;
 * this island owns the mutations so the page stays fast.
 */
export function LeadDetailForm({
  lead,
  owners,
}: {
  lead: LeadDetail;
  owners: { id: string; name: string | null; email: string }[];
}) {
  const t = useTranslations('leads');
  const router = useRouter();
  const [form, setForm] = useState(lead);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  const dirty =
    form.status !== lead.status ||
    form.notes !== lead.notes ||
    form.ownerId !== lead.ownerId ||
    form.contactName !== lead.contactName ||
    form.phone !== lead.phone ||
    form.email !== lead.email ||
    form.website !== lead.website;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: form.status,
          notes: form.notes,
          ownerId: form.ownerId,
          contactName: form.contactName,
          phone: form.phone,
          email: form.email,
          website: form.website,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.show(data.error ?? 'Could not save this lead.', 'alert');
        return;
      }
      toast.show('Lead saved.', 'success');
      router.refresh();
    } catch {
      toast.show('Could not reach the server.', 'alert');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete "${lead.businessName}"? This cannot be undone.`)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.show(data.error ?? 'Could not delete this lead.', 'alert');
        return;
      }
      router.push('/dashboard/leads');
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title={t('contactDetails')} description={t('usedWhenTheAgentReaches')} />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t('contactName')}>
                  <Input
                    value={form.contactName ?? ''}
                    onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                    placeholder={t('whoToAskFor')}
                  />
                </Field>
                <Field label={t('phone')}>
                  <Input
                    type="tel"
                    inputMode="tel"
                    value={form.phone ?? ''}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t('email')}>
                  <Input
                    type="email"
                    inputMode="email"
                    value={form.email ?? ''}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>
                <Field label={t('website')}>
                  <Input
                    type="url"
                    value={form.website ?? ''}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                  />
                </Field>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('notes')} description={t('privateToYourTeam')} />
            <CardBody>
              <Field label={t('notes')}>
                <Textarea
                  value={form.notes ?? ''}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder={t('whatYouKnowAboutThis')}
                  className="min-h-[140px]"
                />
              </Field>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t('status')} />
            <CardBody className="space-y-4">
              <Field label={t('pipelineStatus')}>
                <Select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label={t('owner')} hint="who is working it">
                <Select
                  value={form.ownerId ?? ''}
                  onChange={(e) => setForm({ ...form, ownerId: e.target.value || null })}
                >
                  <option value="">{t('unassigned')}</option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name ?? o.email}
                    </option>
                  ))}
                </Select>
              </Field>

              {form.status === 'new' && (
                <p className="rounded-control border border-[color:var(--color-border)] p-3 text-xs muted">
                  Moving this past <strong>new</strong> creates a CRM contact automatically, so
                  conversations, deals and invoices have somewhere to live.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('source')} />
            <CardBody className="space-y-2 text-xs">
              <Row label={t('source')} value={<Badge tone={lead.source === 'maps' ? 'accent' : 'neutral'}>{lead.source}</Badge>} />
              {lead.category && <Row label={t('category')} value={lead.category} />}
              {lead.niche && <Row label={t('niche')} value={lead.niche} />}
              {lead.rating != null && (
                <Row
                  label={t('googleRating')}
                  value={`${lead.rating.toFixed(1)} (${lead.reviewCount ?? 0} reviews)`}
                />
              )}
              {lead.address && <Row label={t('address')} value={lead.address} />}
              {lead.website && (
                <Row
                  label={t('website')}
                  value={
                    <a
                      href={lead.website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 underline underline-offset-4"
                    >
                      Visit
                      <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
                    </a>
                  }
                />
              )}
            </CardBody>
          </Card>

          {lead.contactId ? (
            <Card>
              <CardBody>
                <p className="text-xs muted">{t('thisLeadHasACrm')}</p>
                <Link href={`/dashboard/contacts/${lead.contactId}`} className="mt-2 block">
                  <Button variant="secondary" size="sm" className="w-full">
                    <UserPlus className="h-4 w-4" strokeWidth={1.75} />{t('openContactRecord')}</Button>
                </Link>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      {/* Sticky action bar so Save is always reachable on a long page. */}
      <div className="sticky bottom-0 z-10 mt-4 flex items-center justify-between gap-3 rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] px-4 py-3">
        <Button variant="ghost" size="sm" onClick={() => void remove()} disabled={deleting}>
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
          ) : (
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          )}
          Delete lead
        </Button>

        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs muted">{t('unsavedChanges')}</span>}
          <Button variant="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>
            <Save className="h-4 w-4" strokeWidth={1.75} />{t('saveChanges')}</Button>
        </div>
      </div>

      {toast.node}
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="muted">{label}</span>
      <span className="text-end">{value}</span>
    </div>
  );
}
