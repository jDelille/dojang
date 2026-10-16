'use client';
import { formatDate } from '@/lib/utils';
import { STATUSES, statusLabel, timeOnly } from '@/components/appointments/types';
import { Pencil, Trash2 } from 'lucide-react';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorBlock,
  Field, Input, LoadingBlock, Modal, PageHeader, Select, Spinner, StatusDot, Switch,
  Table, Tabs, Td, Textarea, Th, Tr, useToast,
} from '@/components/ui';
import { STATUS_TONE } from '@/components/appointments/types';
import type { Appointment } from '@/components/appointments/types';

export function AppointmentRow({
  appointment,
  past,
  onStatus,
  onEdit,
  onDelete,
}: {
  appointment: Appointment;
  past?: boolean;
  onStatus: (status: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('appointments');
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-control text-start text-sm font-medium underline-offset-4 hover:underline"
          >
            {appointment.title}
          </button>
          {appointment.bookedByAgent && <Badge tone="accent">{t('bookedByAi')}</Badge>}
          {appointment.reminderSent && <Badge>{t('reminded')}</Badge>}
          {past && (
            <Badge tone={STATUS_TONE[appointment.status] ?? 'neutral'}>
              {statusLabel(appointment.status)}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs muted">
          {appointment.contact.name} · {formatDate(appointment.startsAt, true)} –{' '}
          {timeOnly(appointment.endsAt)}
          {appointment.location ? ` · ${appointment.location}` : ''}
        </p>
        {appointment.notes && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed muted">{appointment.notes}</p>
        )}
      </div>

      {!past && (
        <Select
          value={appointment.status}
          onChange={(e) => onStatus(e.target.value)}
          aria-label={`Status for ${appointment.title}`}
          className="h-7 w-32 text-xs"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </Select>
      )}

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="px-2"
          aria-label={`Edit ${appointment.title}`}
          onClick={onEdit}
        >
          <Pencil className="h-4 w-4" strokeWidth={1.75} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="px-2"
          aria-label={`Delete ${appointment.title}`}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
        </Button>
      </div>
    </li>
  );
}
