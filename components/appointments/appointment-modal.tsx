'use client';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import { statusLabel, toDateTimeInput } from '@/components/appointments/types';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorBlock,
  Field, Input, LoadingBlock, Modal, PageHeader, Select, Spinner, StatusDot, Switch,
  Table, Tabs, Td, Textarea, Th, Tr, useToast,
} from '@/components/ui';
import { STATUSES } from '@/components/appointments/types';
import type { Appointment } from '@/components/appointments/types';

export function AppointmentModal({
  open,
  appointment,
  calendarConnected,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  appointment: Appointment | null;
  calendarConnected: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations('appointments');
  const editing = Boolean(appointment);

  const [contactId, setContactId] = useState(appointment?.contact.id ?? '');
  const [slots, setSlots] = useState<{ start: string; end: string }[]>([]);
  const [form, setForm] = useState({
    title: appointment?.title ?? '',
    location: appointment?.location ?? '',
    notes: appointment?.notes ?? '',
    startsAt: appointment ? toDateTimeInput(appointment.startsAt) : '',
    duration: appointment
      ? Math.max(
          15,
          Math.round(
            (new Date(appointment.endsAt).getTime() - new Date(appointment.startsAt).getTime()) /
              60_000,
          ),
        )
      : 30,
    status: appointment?.status ?? 'scheduled',
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || editing) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/appointments/slots?days=7');
        const data = await res.json();
        if (!cancelled && res.ok) setSlots(data.slots ?? []);
      } catch {
        // Slots are a convenience — the manual time picker still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, editing]);

  const submit = async () => {
    if (!editing && !contactId) return onError('Pick a contact.');
    if (!form.title.trim()) return onError('Give the appointment a title.');
    if (!form.startsAt) return onError('Pick a start time.');

    const startsAt = new Date(form.startsAt);
    if (Number.isNaN(startsAt.getTime())) return onError('That start time is not valid.');
    const duration = Number(form.duration) > 0 ? Number(form.duration) : 30;
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);

    const payload = {
      title: form.title.trim(),
      location: form.location.trim() || null,
      notes: form.notes.trim() || null,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: form.status,
    };

    setBusy(true);
    try {
      const res = await fetch(
        editing ? `/api/appointments/${appointment!.id}` : '/api/appointments',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editing ? payload : { ...payload, contactId }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(data.error ?? 'Could not save that appointment.');
        return;
      }
      onSaved(editing ? 'Appointment updated.' : 'Appointment booked.');
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
      title={editing ? 'Edit appointment' : 'New appointment'}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" size="sm" loading={busy} onClick={() => void submit()}>
            {editing ? 'Save changes' : 'Book it'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {editing ? (
          <Field label={t('contact')}>
            <p className="text-sm">{appointment!.contact.name}</p>
          </Field>
        ) : (
          <ContactPicker value={contactId} onChange={setContactId} />
        )}

        <Field label={t('title')} required>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={t('initialConsultation')}
          />
        </Field>

        {!editing && slots.length > 0 && (
          <Field label={t('openSlots')} hint="from your connected calendar">
            <div className="flex flex-wrap gap-1.5">
              {slots.slice(0, 8).map((slot) => (
                <button
                  key={slot.start}
                  type="button"
                  onClick={() => setForm({ ...form, startsAt: toDateTimeInput(slot.start) })}
                  className="rounded-pill border border-[color:var(--color-border)] px-2.5 py-1 text-xs transition-colors hover:border-accent"
                >
                  {formatDate(slot.start, true)}
                </button>
              ))}
            </div>
          </Field>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('startsAt')} required>
            <Input
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            />
          </Field>
          <Field label={t('durationMinutes')}>
            <Input
              type="number"
              min={15}
              step={15}
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })}
            />
          </Field>
        </div>

        {editing && (
          <Field label={t('status')}>
            <Select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label={t('location')}>
          <Input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder={t('officePhoneCallCustomerSite')}
          />
        </Field>

        <Field label={t('notes')} hint="shown on the booking and sent to your calendar">
          <Textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>

        {editing && calendarConnected && appointment!.calendarEventId && (
          <p className="text-xs muted">
            Changes are saved here only — the existing calendar event keeps its original time.
            Delete and re-book if the calendar has to match.
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Type-to-search contact picker, so a workspace past 200 contacts is still reachable. */
export function ContactPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useTranslations('appointments');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; name: string; company: string | null }[]>(
    [],
  );
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useRef(`contact-picker-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        void (async () => {
          setLoading(true);
          setFailed(false);
          try {
            const params = new URLSearchParams({ limit: '20' });
            if (query.trim()) params.set('q', query.trim());
            const res = await fetch(`/api/contacts?${params}`);
            const data = await res.json();
            if (cancelled) return;
            if (!res.ok) {
              setFailed(true);
              return;
            }
            setResults(data.contacts ?? []);
            if (!query.trim()) setTotal(data.total ?? 0);
          } catch {
            if (!cancelled) setFailed(true);
          } finally {
            if (!cancelled) setLoading(false);
          }
        })();
      },
      query ? 250 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const selected = results.find((c) => c.id === value);

  const choose = (contact: { id: string; name: string }) => {
    onChange(contact.id);
    setQuery(contact.name);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && open && results[active]) {
      event.preventDefault();
      choose(results[active]);
    } else if (event.key === 'Escape' && open) {
      event.stopPropagation();
      setOpen(false);
    }
  };

  // An empty workspace is a dead end unless we say where contacts come from.
  if (total === 0 && !query && !loading && !failed) {
    return (
      <Field label={t('contact')} required>
        <p className="text-xs muted">
          No contacts yet. Convert a lead first — moving one past “new” creates its contact record,
          or{' '}
          <Link href="/dashboard/contacts" className="underline underline-offset-4 hover:text-accent-dark">
            add a contact
          </Link>
          .
        </p>
      </Field>
    );
  }

  return (
    <Field label={t('contact')} required hint={failed ? undefined : 'type to search'}>
      <div className="relative">
        <Input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${listId}-${results[active].id}` : undefined}
          autoComplete="off"
          value={query}
          placeholder={t('searchContacts')}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
            if (value) onChange('');
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />

        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label={t('contacts')}
            className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] py-1 shadow-popover"
          >
            {loading && <li className="px-3 py-2 text-xs muted">{t('searching')}</li>}
            {!loading && failed && (
              <li className="px-3 py-2 text-xs muted">{t('couldNotLoadContactsTry')}</li>
            )}
            {!loading && !failed && results.length === 0 && (
              <li className="px-3 py-2 text-xs muted">{t('noContactsMatchThatSearch')}</li>
            )}
            {!loading &&
              !failed &&
              results.map((c, i) => (
                <li key={c.id} id={`${listId}-${c.id}`} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(c)}
                    onMouseEnter={() => setActive(i)}
                    className={`w-full truncate px-3 py-1.5 text-left text-sm ${
                      i === active ? 'bg-black/[0.04] dark:bg-white/[0.06]' : ''
                    }`}
                  >
                    {c.name}
                    {c.company && <span className="ms-1.5 text-xs muted">{c.company}</span>}
                  </button>
                </li>
              ))}
          </ul>
        )}

        {value && selected && (
          <p className="mt-1.5 text-xs muted">Booking for {selected.name}.</p>
        )}
      </div>
    </Field>
  );
}
