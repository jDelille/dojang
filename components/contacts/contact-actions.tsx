'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MessageSquare, Settings2, Trash2, X } from 'lucide-react';
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Switch,
  useToast,
} from '@/components/ui';

/** Tag editing and messaging preferences for one contact. */
export function ContactActions({
  contactId,
  tags,
  optedOutSms,
  optedOutEmail,
  conversationId,
}: {
  contactId: string;
  tags: string[];
  optedOutSms: boolean;
  optedOutEmail: boolean;
  conversationId: string | null;
}) {
  const t = useTranslations('contacts');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ tags, optedOutSms, optedOutEmail });
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.show(data.error ?? 'Could not save.', 'alert');
        return;
      }
      setOpen(false);
      toast.show('Contact updated.', 'success');
      router.refresh();
    } catch {
      toast.show('Could not reach the server.', 'alert');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm('Delete this contact? Their conversations and history go with them.')) return;

    const res = await fetch(`/api/contacts/${contactId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.show(data.error ?? 'Could not delete this contact.', 'alert');
      return;
    }
    router.push('/dashboard/contacts');
    router.refresh();
  };

  const addTag = () => {
    const tag = newTag.trim();
    if (!tag || form.tags.includes(tag)) return;
    setForm({ ...form, tags: [...form.tags, tag] });
    setNewTag('');
  };

  return (
    <>
      {conversationId && (
        <Link href={`/dashboard/inbox?conversation=${conversationId}`}>
          <Button variant="secondary" size="sm">
            <MessageSquare className="h-4 w-4" strokeWidth={1.75} />{t('openThread')}</Button>
        </Link>
      )}

      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Settings2 className="h-4 w-4" strokeWidth={1.75} />{t('edit')}</Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('editContact')}
        width="sm"
        description={t('tagsDriveRetentionRuleAudiences')}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => void remove()}>
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />{t('delete')}</Button>
            <span className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>{t('cancel')}</Button>
            <Button variant="primary" size="sm" loading={busy} onClick={() => void save()}>{t('save')}</Button>
          </>
        }
      >
        <div className="space-y-5">
          <div>
            <Field label={t('tags')} hint="press Enter to add">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="vip, repeat-customer…"
              />
            </Field>
            {form.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {form.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1">
                    <Badge>
                      {tag}
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, tags: form.tags.filter((t) => t !== tag) })}
                        aria-label={`Remove tag ${tag}`}
                        className="ms-1 -me-0.5 rounded-pill hover:text-alert"
                      >
                        <X className="h-3 w-3" strokeWidth={2} />
                      </button>
                    </Badge>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-control border border-[color:var(--color-border)] p-3">
            <p className="label-caps">{t('messagingPreferences')}</p>
            <Switch
              checked={!form.optedOutSms}
              onChange={(v) => setForm({ ...form, optedOutSms: !v })}
              label={t('canReceiveSms')}
              description={t('turnedOffAutomaticallyIfThey')}
            />
            <Switch
              checked={!form.optedOutEmail}
              onChange={(v) => setForm({ ...form, optedOutEmail: !v })}
              label={t('canReceiveEmail')}
            />
          </div>
        </div>
      </Modal>

      {toast.node}
    </>
  );
}
