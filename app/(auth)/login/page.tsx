'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { AlertCircle } from 'lucide-react';
import { Button, Card, CardBody, Field, Input } from '@/components/ui';

export default function LoginPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);

    try {
      const result = await signIn('credentials', { email, password, redirect: false });

      if (result?.error) {
        // Deliberately vague — don't reveal whether the email exists.
        setError('That email and password combination is not recognized.');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Could not sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardBody>
        <h1 className="font-display text-lg font-semibold">{t('signIn')}</h1>
        <p className="mt-1 text-xs muted">{t('welcomeBackToYourCommand')}</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-control border border-alert/40 bg-alert/5 px-3 py-2 text-xs text-alert">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              {error}
            </p>
          )}

          <Field label={t('email')} required>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              autoFocus
            />
          </Field>

          <Field label={t('password')} required>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>

          <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">{t('signIn')}</Button>
        </form>

        <p className="mt-5 text-center text-xs muted">
          No account yet?{' '}
          <Link href="/register" className="underline underline-offset-4 hover:text-accent-dark">{t('createOne')}</Link>
        </p>
      </CardBody>
    </Card>
  );
}
