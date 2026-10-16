'use client';
import { AppointmentRow } from '@/components/appointments/appointment-row';
import { MonthGrid } from '@/components/appointments/month-grid';
import { AppointmentModal } from '@/components/appointments/appointment-modal';
import { MAX_GRID_DAYS, PAST_PER_PAGE, STATUSES, STATUS_TONE } from '@/components/appointments/types';
import type { Appointment, CalendarAccount, RangeMode } from '@/components/appointments/types';
import { addDays, addMonths, parseDateInput, startOfDay, startOfMonth, startOfWeek, statusLabel, timeOnly, toDateInput, toDateTimeInput } from '@/components/appointments/types';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Link2,
  List,
  Pencil,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorBlock,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { Pagination } from '@/components/ui/pagination';
import { formatDate } from '@/lib/utils';







export function AppointmentsClient({
  calendarNotice,
  calendarReason,
  googleConfigured,
  outlookConfigured,
  canManageCalendars,
}: {
  calendarNotice?: string;
  calendarReason?: string;
  googleConfigured: boolean;
  outlookConfigured: boolean;
  canManageCalendars: boolean;
}) {
  const t = useTranslations('appointments');
  const router = useRouter();
  const toast = useToast();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [calendars, setCalendars] = useState<CalendarAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [mode, setMode] = useState<RangeMode>('month');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [customFrom, setCustomFrom] = useState(() => toDateInput(new Date()));
  const [customTo, setCustomTo] = useState(() => toDateInput(addDays(new Date(), 30)));
  const [view, setView] = useState<'list' | 'calendar'>('list');

  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [pastPage, setPastPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [deleting, setDeleting] = useState<Appointment | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const range = useMemo(() => {
    if (mode === 'week') {
      const from = startOfWeek(anchor);
      return { from, to: addDays(from, 7) };
    }
    if (mode === 'month') {
      const from = startOfMonth(anchor);
      return { from, to: addMonths(from, 1) };
    }
    const from = parseDateInput(customFrom, new Date());
    const to = parseDateInput(customTo, addDays(new Date(), 30));
    return { from, to: addDays(to < from ? from : to, 1) };
  }, [mode, anchor, customFrom, customTo]);

  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ from: fromIso, to: toIso });
      const res = await fetch(`/api/appointments?${params}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Could not load appointments.');
        return;
      }
      setAppointments(data.appointments ?? []);
      setCalendars(data.calendars ?? []);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [fromIso, toIso]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPastPage(1);
  }, [fromIso, toIso, statusFilter, query]);

  useEffect(() => {
    if (!calendarNotice) return;
    if (calendarNotice === 'connected') toast.show('Calendar connected.', 'success');
    else if (calendarNotice === 'denied') toast.show('Calendar access was declined.', 'alert');
    else if (calendarNotice === 'invalid')
      toast.show('That calendar link expired — try connecting again.', 'alert');
    // The callback appends a plain-English reason when it can identify one.
    else toast.show(calendarReason || 'Could not connect that calendar.', 'alert');
    // Clearing the param stops a refresh replaying the same message.
    router.replace('/dashboard/appointments');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarNotice, calendarReason]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return appointments.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.contact.name.toLowerCase().includes(q) ||
        (a.location ?? '').toLowerCase().includes(q)
      );
    });
  }, [appointments, statusFilter, query]);

  const now = Date.now();
  const upcoming = filtered.filter((a) => new Date(a.startsAt).getTime() >= now);
  const past = filtered
    .filter((a) => new Date(a.startsAt).getTime() < now)
    .slice()
    .reverse();
  const pastPages = Math.max(1, Math.ceil(past.length / PAST_PER_PAGE));
  const pastSlice = past.slice((pastPage - 1) * PAST_PER_PAGE, pastPage * PAST_PER_PAGE);

  const rangeLabel =
    mode === 'month'
      ? range.from.toLocaleString('en-US', { month: 'long', year: 'numeric' })
      : mode === 'week'
        ? `Week of ${formatDate(range.from)}`
        : `${formatDate(range.from)} – ${formatDate(addDays(range.to, -1))}`;

  const rangeDays = Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000);
  const gridTooWide = rangeDays > MAX_GRID_DAYS;

  const patch = async (appointment: Appointment, body: Record<string, unknown>) => {
    const res = await fetch(`/api/appointments/${appointment.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? 'Could not update that appointment.');
    return data.appointment as Appointment;
  };

  const setStatus = async (appointment: Appointment, status: string) => {
    const previous = appointment.status;
    setAppointments((prev) => prev.map((a) => (a.id === appointment.id ? { ...a, status } : a)));
    try {
      await patch(appointment, { status });
      if (status === 'cancelled' && appointment.calendarEventId) {
        toast.show(
          'Marked as cancelled. It is still on your connected calendar — delete it to clear the slot.',
          'neutral',
        );
      }
    } catch (err) {
      setAppointments((prev) =>
        prev.map((a) => (a.id === appointment.id ? { ...a, status: previous } : a)),
      );
      toast.show((err as Error).message, 'alert');
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/appointments/${target.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.show(data.error ?? 'Could not delete that appointment.', 'alert');
        return;
      }
      setAppointments((prev) => prev.filter((a) => a.id !== target.id));
      setDeleting(null);
      toast.show(
        target.calendarEventId
          ? 'Appointment deleted and removed from your calendar.'
          : 'Appointment deleted.',
        'success',
      );
    } catch {
      toast.show('Could not reach the server.', 'alert');
    } finally {
      setDeleteBusy(false);
    }
  };

  const connect = (provider: 'google' | 'outlook') => {
    window.location.href = `/api/appointments/oauth/${provider}`;
  };

  const calendarHint = !canManageCalendars
    ? 'Only workspace admins can connect a calendar.'
    : !googleConfigured && !outlookConfigured
      ? 'Calendar sync is not set up on this server yet. Add the Google or Microsoft client credentials to your environment, then reload this page.'
      : !googleConfigured
        ? 'Google needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET set on the server.'
        : !outlookConfigured
          ? 'Outlook needs MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET set on the server.'
          : '';

  return (
    <>
      <PageHeader
        title={t('appointments')}
        description={t('bookingsSyncToYourCalendar')}
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            <CalendarPlus className="h-4 w-4" strokeWidth={1.75} />{t('newAppointment')}</Button>
        }
      />

      <Card className="mb-4">
        <CardHeader
          title={t('calendarSync')}
          description={
            calendars.length
              ? `Connected: ${calendars.map((c) => `${c.provider} (${c.accountEmail})`).join(', ')}`
              : 'Not connected. Bookings still work — they just will not appear on your own calendar.'
          }
          action={
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!canManageCalendars || !googleConfigured}
                onClick={() => connect('google')}
              >
                <Link2 className="h-4 w-4" strokeWidth={1.75} />{t('google')}</Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!canManageCalendars || !outlookConfigured}
                onClick={() => connect('outlook')}
              >
                <Link2 className="h-4 w-4" strokeWidth={1.75} />{t('outlook')}</Button>
            </div>
          }
        />
        {calendarHint && (
          <CardBody className="pt-0">
            <p className="text-xs muted">{calendarHint}</p>
          </CardBody>
        )}
      </Card>

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              className="px-2"
              aria-label={mode === 'week' ? 'Previous week' : 'Previous month'}
              disabled={mode === 'custom'}
              onClick={() =>
                setAnchor((a) => (mode === 'week' ? addDays(startOfWeek(a), -7) : addMonths(a, -1)))
              }
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
            </Button>
            <span className="min-w-[9.5rem] text-center text-sm font-medium">{rangeLabel}</span>
            <Button
              variant="secondary"
              size="sm"
              className="px-2"
              aria-label={mode === 'week' ? 'Next week' : 'Next month'}
              disabled={mode === 'custom'}
              onClick={() =>
                setAnchor((a) => (mode === 'week' ? addDays(startOfWeek(a), 7) : addMonths(a, 1)))
              }
            >
              <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMode('month');
                setAnchor(startOfDay(new Date()));
              }}
            >{t('today')}</Button>
          </div>

          <div className="w-32">
            <Field label={t('range')}>
              <Select value={mode} onChange={(e) => setMode(e.target.value as RangeMode)}>
                <option value="week">{t('thisWeek')}</option>
                <option value="month">{t('thisMonth')}</option>
                <option value="custom">{t('custom')}</option>
              </Select>
            </Field>
          </div>

          {mode === 'custom' && (
            <>
              <div className="w-40">
                <Field label={t('from')}>
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                  />
                </Field>
              </div>
              <div className="w-40">
                <Field label="To">
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                  />
                </Field>
              </div>
            </>
          )}

          <div className="w-36">
            <Field label={t('status')}>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">{t('allStatuses')}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="min-w-[12rem] flex-1">
            <Field label={t('search')}>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('contactTitleOrLocation')}
              />
            </Field>
          </div>

          <div
            className="flex items-center gap-1.5"
            role="group"
            aria-label={t('appointmentView')}
          >
            <Button
              variant={view === 'list' ? 'primary' : 'secondary'}
              size="sm"
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
            >
              <List className="h-4 w-4" strokeWidth={view === 'list' ? 2 : 1.75} />{t('list')}</Button>
            <Button
              variant={view === 'calendar' ? 'primary' : 'secondary'}
              size="sm"
              aria-pressed={view === 'calendar'}
              onClick={() => setView('calendar')}
            >
              <LayoutGrid className="h-4 w-4" strokeWidth={view === 'calendar' ? 2 : 1.75} />{t('calendar')}</Button>
          </div>
        </CardBody>
      </Card>

      {loading ? (
        <Card>
          <LoadingBlock label={t('loadingAppointments')} />
        </Card>
      ) : error ? (
        <Card>
          <ErrorBlock message={error} onRetry={() => void load()} />
        </Card>
      ) : view === 'calendar' ? (
        <Card>
          <CardHeader
            title={rangeLabel}
            description={`${filtered.length} appointment${filtered.length === 1 ? '' : 's'} in this range`}
          />
          {gridTooWide ? (
            <EmptyState
              icon={<CalendarDays strokeWidth={1.75} />}
              title={t('rangeTooWideForThe')}
              description={t('theCalendarShowsUpTo')}
              action={
                <Button variant="secondary" size="sm" onClick={() => setView('list')}>{t('showTheList')}</Button>
              }
            />
          ) : (
            <MonthGrid
              from={range.from}
              to={range.to}
              appointments={filtered}
              onSelect={(a) => setEditing(a)}
            />
          )}
        </Card>
      ) : (
        <>
          <Card className="mb-4">
            <CardHeader
              title={t('upcoming')}
              description={`${upcoming.length} in ${rangeLabel.toLowerCase()}`}
            />
            {upcoming.length ? (
              <ul className="divide-y divide-[color:var(--color-border)]">
                {upcoming.map((appointment) => (
                  <AppointmentRow
                    key={appointment.id}
                    appointment={appointment}
                    onStatus={(status) => void setStatus(appointment, status)}
                    onEdit={() => setEditing(appointment)}
                    onDelete={() => setDeleting(appointment)}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<CalendarDays strokeWidth={1.75} />}
                title={t('nothingBookedInThisRange')}
                description={
                  statusFilter !== 'all' || query
                    ? 'No appointments match these filters. Clear them, or widen the date range.'
                    : 'Your AI agent can book straight into open slots during a chat or call. Anything outside this date range is hidden — widen it to look further ahead.'
                }
                action={
                  <Button variant="secondary" size="sm" onClick={() => setCreateOpen(true)}>{t('newAppointment')}</Button>
                }
              />
            )}
          </Card>

          {past.length > 0 && (
            <Card>
              <CardHeader
                title={t('past')}
                description={`${past.length} appointment${past.length === 1 ? '' : 's'}`}
              />
              <ul className="divide-y divide-[color:var(--color-border)]">
                {pastSlice.map((appointment) => (
                  <AppointmentRow
                    key={appointment.id}
                    appointment={appointment}
                    past
                    onStatus={(status) => void setStatus(appointment, status)}
                    onEdit={() => setEditing(appointment)}
                    onDelete={() => setDeleting(appointment)}
                  />
                ))}
              </ul>
              <Pagination
                page={pastPage}
                pages={pastPages}
                total={past.length}
                onChange={setPastPage}
                label="past appointments"
              />
            </Card>
          )}
        </>
      )}

      <AppointmentModal
        key={editing?.id ?? 'new'}
        open={createOpen || Boolean(editing)}
        appointment={editing}
        calendarConnected={calendars.length > 0}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onSaved={(message) => {
          setCreateOpen(false);
          setEditing(null);
          toast.show(message, 'success');
          void load();
        }}
        onError={(m) => toast.show(m, 'alert')}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        title={t('deleteThisAppointment')}
        description={
          deleting?.calendarEventId
            ? `“${deleting.title}” will be deleted here and the event removed from your connected calendar.`
            : `“${deleting?.title ?? ''}” will be deleted here.`
        }
        confirmLabel={t('delete')}
        destructive
        loading={deleteBusy}
      />

      {toast.node}
    </>
  );
}
