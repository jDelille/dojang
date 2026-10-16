'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Loader2, Mail, Phone, Plus, Search, Users } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Table,
  Td,
  Th,
  Tr,
  useToast,
} from '@/components/ui';
import { Pagination } from '@/components/ui/pagination';
import { relativeTime } from '@/lib/utils';

type Contact = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  tags: string[];
  lastActivityAt: string | null;
  deals: { id: string; stage: { name: string; color: string | null } }[];
  _count: { conversations: number; appointments: number; invoices: number };
};

export function ContactsClient() {
  const t = useTranslations('contacts');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '25', page: String(page) });
      if (query) params.set('q', query);

      const res = await fetch(`/api/contacts?${params}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Could not load contacts.');
        return;
      }
      setContacts(data.contacts ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [page, query]);

  useEffect(() => {
    void load();
  }, [load]);

  // Searching should always land you back on page one.
  useEffect(() => {
    setPage(1);
  }, [query]);

  return (
    <>
      <PageHeader
        title={t('contacts')}
        description={`${total} contact${total === 1 ? '' : 's'} — everyone you have actually spoken to`}
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.75} />{t('addContact')}</Button>
        }
      />

      <Card>
        <CardHeader
          title={t('allContacts')}
          action={
            <div className="relative">
              <Search
                className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 muted"
                strokeWidth={1.75}
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchNameEmailPhone')}
                aria-label={t('searchContacts')}
                className="h-8 w-56 ps-8 text-xs"
              />
            </div>
          }
        />

        {error ? (
          <EmptyState
            icon={<Users strokeWidth={1.75} />}
            title={t('couldNotLoadContacts')}
            description={error}
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>{t('tryAgain')}</Button>
            }
          />
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin muted" strokeWidth={1.75} />
          </div>
        ) : contacts.length ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{t('name')}</Th>
                  <Th>{t('reach')}</Th>
                  <Th>{t('tags')}</Th>
                  <Th>{t('stage')}</Th>
                  <Th align="right">{t('activity')}</Th>
                  <Th>{t('lastSeen')}</Th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <Tr key={contact.id}>
                    <Td>
                      <Link
                        href={`/dashboard/contacts/${contact.id}`}
                        className="font-medium hover:text-[color:var(--color-accent-dark)] dark:hover:text-accent"
                      >
                        {contact.name}
                      </Link>
                      {contact.company && contact.company !== contact.name && (
                        <p className="text-xs muted">{contact.company}</p>
                      )}
                    </Td>
                    <Td>
                      <div className="space-y-0.5 text-xs">
                        {contact.phone && (
                          <p className="flex items-center gap-1.5">
                            <Phone className="h-3 w-3 muted" strokeWidth={1.75} />
                            <span className="font-mono">{contact.phone}</span>
                          </p>
                        )}
                        {contact.email && (
                          <p className="flex items-center gap-1.5">
                            <Mail className="h-3 w-3 muted" strokeWidth={1.75} />
                            <span className="truncate">{contact.email}</span>
                          </p>
                        )}
                        {!contact.phone && !contact.email && <span className="muted">—</span>}
                      </div>
                    </Td>
                    <Td>
                      {contact.tags.length ? (
                        <div className="flex flex-wrap gap-1">
                          {contact.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag}>{tag}</Badge>
                          ))}
                          {contact.tags.length > 3 && (
                            <span className="text-xs muted">+{contact.tags.length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs muted">—</span>
                      )}
                    </Td>
                    <Td>
                      {contact.deals[0] ? (
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span
                            aria-hidden
                            className="inline-block h-2 w-2 rounded-pill"
                            style={{ background: contact.deals[0].stage.color ?? 'var(--color-slate)' }}
                          />
                          {contact.deals[0].stage.name}
                        </span>
                      ) : (
                        <span className="text-xs muted">—</span>
                      )}
                    </Td>
                    <Td align="right" className="whitespace-nowrap text-xs muted tabular-nums">
                      {contact._count.conversations}c · {contact._count.appointments}a ·{' '}
                      {contact._count.invoices}i
                    </Td>
                    <Td className="whitespace-nowrap text-xs muted">
                      {relativeTime(contact.lastActivityAt)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>

            <Pagination page={page} pages={pages} total={total} onChange={setPage} />
          </>
        ) : (
          <EmptyState
            icon={<Users strokeWidth={1.75} />}
            title={query ? 'No contacts match that search' : 'No contacts yet'}
            description={
              query
                ? 'Try a different name, email or phone number.'
                : 'A contact is created automatically the first time someone messages you, or when you move a lead past "new".'
            }
          />
        )}
      </Card>

      <CreateContactModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          toast.show('Contact added.', 'success');
          void load();
        }}
        onError={(m) => toast.show(m, 'alert')}
      />

      {toast.node}
    </>
  );
}

function CreateContactModal({
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
  const t = useTranslations('contacts');
  const [form, setForm] = useState({ name: '', phone: '', email: '', company: '' });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) return onError('A name is required.');

    setBusy(true);
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) return onError(data.error ?? 'Could not add that contact.');
      setForm({ name: '', phone: '', email: '', company: '' });
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
      title={t('addAContact')}
      width="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" size="sm" loading={busy} onClick={() => void submit()}>{t('addContact')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('name')} required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('phone')}>
            <Input
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label={t('email')}>
            <Input
              type="email"
              inputMode="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
        </div>
        <Field label={t('company')}>
          <Input
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}
