'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { AlertCircle } from 'lucide-react';
import { Button, Card, CardBody, Field, Input } from '@/components/ui';

export default function RegisterPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', workspaceName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (form.password.length < 8) {
      setError('Use a password of at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Could not create that account.');
        return;
      }

      // Sign straight in so the buyer never has to type the password twice.
      const signedIn = await signIn('credentials', {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      if (signedIn?.error) {
        // The account exists — only the automatic sign-in failed.
        setError('Your account was created, but signing you in failed. Please sign in.');
        setTimeout(() => router.push('/login'), 1500);
        return;
      }

      router.push('/onboarding');
      router.refresh();
    } catch {
      setError('Could not create that account. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardBody>
        <h1 className="font-display text-lg font-semibold">{t('createAccount')}</h1>
        <p className="mt-1 text-xs muted">{t('createAccountSubtitle')}</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-control border border-alert/40 bg-alert/5 px-3 py-2 text-xs text-alert">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              {error}
            </p>
          )}

          <Field label={t('yourName')} required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
            />
          </Field>

          <Field label={t('businessName')} hint="becomes your workspace">
            <Input
              value={form.workspaceName}
              onChange={(e) => setForm({ ...form, workspaceName: e.target.value })}
            />
          </Field>

          <Field label={t('email')} required>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              autoComplete="email"
              required
            />
          </Field>

          <Field label={t('password')} required hint="min 8 characters">
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="new-password"
              required
            />
          </Field>

          <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">{t('createAccount2')}</Button>
        </form>

        <p className="mt-5 text-center text-xs muted">
          Already have an account?{' '}
          <Link href="/login" className="underline underline-offset-4 hover:text-accent-dark">{t('signIn')}</Link>
        </p>
      </CardBody>
    </Card>
  );
}
