'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Languages } from 'lucide-react';
import { Card, CardBody, CardHeader, Field, Select, useToast } from '@/components/ui';
import { LOCALES, LOCALE_META, type Locale } from '@/lib/i18n/config';

export function LanguagePicker() {
  const t = useTranslations('settings');
  const active = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  const change = async (locale: Locale) => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      });
      if (!res.ok) {
        toast.show('Could not change the language.', 'alert');
        return;
      }
      // A full refresh, not a client nav: direction lives on <html>, which is
      // rendered on the server, so the whole document has to come back.
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title={t('language')} description={t('languageHint')} />
      <CardBody>
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1 sm:max-w-xs">
            <Field label={t('language')}>
              <Select
                value={active}
                disabled={saving || pending}
                onChange={(e) => void change(e.target.value as Locale)}
              >
                {LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {LOCALE_META[code].nativeLabel} ({LOCALE_META[code].label})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Languages className="mb-2 h-4 w-4 muted" strokeWidth={1.75} />
        </div>
      </CardBody>
      {toast.node}
    </Card>
  );
}
