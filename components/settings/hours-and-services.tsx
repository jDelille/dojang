'use client';
import { useTranslations } from 'next-intl';
import { ReadOnlyNote } from '@/components/settings/workspace-form';

import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ErrorBlock,
  Input,
  LoadingBlock,
  Switch,
} from '@/components/ui';
import { can } from '@/lib/rbac';
import type { Notify } from '@/components/settings/shared';
import type { Role } from '@prisma/client';
type DayHours = { open: string; close: string; closed: boolean };

const DAYS: { key: string; label: string }[] = [
  { key: 'Monday', label: 'Monday' },
  { key: 'Tuesday', label: 'Tuesday' },
  { key: 'Wednesday', label: 'Wednesday' },
  { key: 'Thursday', label: 'Thursday' },
  { key: 'Friday', label: 'Friday' },
  { key: 'Saturday', label: 'Saturday' },
  { key: 'Sunday', label: 'Sunday' },
];

type ServiceRow = { id: string; name: string; price: string; description: string };

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

/** Existing records may hold either "09:00 – 17:00" strings or {open,close,closed}. */
function parseHours(raw: unknown): Record<string, DayHours> {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const lookup = new Map(Object.entries(source).map(([k, v]) => [k.toLowerCase(), v]));

  const result: Record<string, DayHours> = {};
  for (const day of DAYS) {
    const value = lookup.get(day.key.toLowerCase());
    const weekend = day.key === 'Saturday' || day.key === 'Sunday';
    let parsed: DayHours = { open: '09:00', close: '17:00', closed: weekend };

    if (typeof value === 'string') {
      if (/closed/i.test(value)) {
        parsed = { ...parsed, closed: true };
      } else {
        const [open, close] = value.split(/[-–—]/).map((part) => part.trim());
        parsed = { open: open || '09:00', close: close || '17:00', closed: false };
      }
    } else if (value && typeof value === 'object') {
      const v = value as { open?: string; close?: string; closed?: boolean };
      parsed = {
        open: v.open ?? '09:00',
        close: v.close ?? '17:00',
        closed: Boolean(v.closed),
      };
    }

    result[day.key] = parsed;
  }
  return result;
}

function parseServices(raw: unknown): ServiceRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    if (typeof entry === 'string') {
      return { id: newId(), name: entry, price: '', description: '' };
    }
    const s = (entry ?? {}) as { name?: string; price?: string | number; description?: string };
    return {
      id: newId(),
      name: s.name ?? '',
      price: s.price == null ? '' : String(s.price),
      description: s.description ?? '',
    };
  });
}

/**
 * Opening hours and the service list share one save, because both live in the
 * same workspace record — but they are shown on separate tabs. Pricing is the
 * question the AI agent is asked most, and it was previously reachable only by
 * scrolling past the week's opening times.
 */
export function HoursAndServices({
  workspaceId,
  canEdit,
  onNotify,
  section = 'hours',
}: {
  workspaceId: string;
  canEdit: boolean;
  onNotify: Notify;
  section?: 'hours' | 'services';
}) {
  const t = useTranslations('settingsPage');
  const [hours, setHours] = useState<Record<string, DayHours>>(() => parseHours(null));
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Could not load your hours and services.');
        return;
      }
      setHours(parseHours(data.workspace?.businessHours));
      setServices(parseServices(data.workspace?.services));
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      const businessHours: Record<string, { open?: string; close?: string; closed?: boolean }> = {};
      for (const day of DAYS) {
        const value = hours[day.key];
        businessHours[day.key] = value.closed
          ? { closed: true }
          : { open: value.open, close: value.close };
      }

      const payload = services
        .filter((service) => service.name.trim())
        .map((service) => ({
          name: service.name.trim(),
          ...(service.price.trim() ? { price: service.price.trim() } : {}),
          ...(service.description.trim() ? { description: service.description.trim() } : {}),
        }));

      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessHours, services: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return onNotify(data.error ?? 'Could not save that.', 'alert');
      onNotify('Hours and services saved.', 'success');
    } catch {
      onNotify('Could not reach the server. Check your connection and try again.', 'alert');
    } finally {
      setBusy(false);
    }
  };

  const setDay = (key: string, patch: Partial<DayHours>) =>
    setHours((current) => ({ ...current, [key]: { ...current[key], ...patch } }));

  return (
    <Card>
      <CardHeader
        title={section === 'services' ? 'Services and pricing' : 'Opening hours'}
        description={
          section === 'services'
            ? 'Your agent quotes from this list and will refuse to invent a price that is not here — so keep it current.'
            : 'Your agent books from these and will not offer a time you are closed.'
        }
      />

      {loading ? (
        <LoadingBlock label={t('loadingHoursAndServices')} />
      ) : error ? (
        <ErrorBlock message={error} onRetry={() => void load()} />
      ) : (
        <CardBody className="space-y-6">
          {!canEdit && <ReadOnlyNote />}

          <div className={section === 'services' ? 'hidden' : undefined}>
            <p className="label-caps mb-2">{t('openingHours')}</p>
            <div className="space-y-2">
              {DAYS.map((day) => {
                const value = hours[day.key];
                return (
                  <div
                    key={day.key}
                    className="flex flex-wrap items-center gap-3 rounded-control border border-[color:var(--color-border)] px-3 py-2.5"
                  >
                    <span className="w-24 shrink-0 text-sm">{day.label}</span>
                    <Switch
                      checked={!value.closed}
                      disabled={!canEdit}
                      onChange={(open) => setDay(day.key, { closed: !open })}
                      label={value.closed ? 'Closed' : 'Open'}
                    />
                    {!value.closed && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={value.open}
                          disabled={!canEdit}
                          aria-label={`${day.label} opening time`}
                          onChange={(e) => setDay(day.key, { open: e.target.value })}
                          className="w-32"
                        />
                        <span className="text-xs muted">to</span>
                        <Input
                          type="time"
                          value={value.close}
                          disabled={!canEdit}
                          aria-label={`${day.label} closing time`}
                          onChange={(e) => setDay(day.key, { close: e.target.value })}
                          className="w-32"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className={section === 'hours' ? 'hidden' : undefined}>
            <div className="mb-2 flex items-center justify-between">
              <p className="label-caps">{t('servicesAndPricing')}</p>
              {canEdit && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setServices((current) => [
                      ...current,
                      { id: newId(), name: '', price: '', description: '' },
                    ])
                  }
                >
                  <Plus className="h-4 w-4" strokeWidth={1.75} />{t('addService')}</Button>
              )}
            </div>

            {services.length === 0 ? (
              <p className="rounded-control border border-dashed border-[color:var(--color-border)] px-3 py-6 text-center text-xs muted">{t('noServicesListedYetAgents')}</p>
            ) : (
              <div className="space-y-2">
                {services.map((service, index) => (
                  <div
                    key={service.id}
                    className="grid grid-cols-1 gap-2 rounded-control border border-[color:var(--color-border)] p-3 sm:grid-cols-[1fr_140px_1fr_auto]"
                  >
                    <Input
                      value={service.name}
                      disabled={!canEdit}
                      aria-label={`Service ${index + 1} name`}
                      placeholder={t('emergencyCallout')}
                      onChange={(e) =>
                        setServices((current) =>
                          current.map((row) =>
                            row.id === service.id ? { ...row, name: e.target.value } : row,
                          ),
                        )
                      }
                    />
                    <Input
                      value={service.price}
                      disabled={!canEdit}
                      aria-label={`Service ${index + 1} price`}
                      placeholder="$95"
                      onChange={(e) =>
                        setServices((current) =>
                          current.map((row) =>
                            row.id === service.id ? { ...row, price: e.target.value } : row,
                          ),
                        )
                      }
                    />
                    <Input
                      value={service.description}
                      disabled={!canEdit}
                      aria-label={`Service ${index + 1} description`}
                      placeholder={t('withinTwoHoursAnyDay')}
                      onChange={(e) =>
                        setServices((current) =>
                          current.map((row) =>
                            row.id === service.id ? { ...row, description: e.target.value } : row,
                          ),
                        )
                      }
                    />
                    {canEdit && (
                      <button
                        type="button"
                        aria-label={`Remove ${service.name || `service ${index + 1}`}`}
                        onClick={() =>
                          setServices((current) => current.filter((row) => row.id !== service.id))
                        }
                        className="justify-self-end rounded-control p-1.5 muted transition-colors hover:text-alert"
                      >
                        <X className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {canEdit && (
            <div className="flex justify-end">
              <Button variant="primary" loading={busy} onClick={() => void save()}>{t('saveHoursAndServices')}</Button>
            </div>
          )}
        </CardBody>
      )}
    </Card>
  );
}

// ── Integrations ─────────────────────────────────────────────────────────────