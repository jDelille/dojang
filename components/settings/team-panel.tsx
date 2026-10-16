'use client';
import { useTranslations } from 'next-intl';

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Lock, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorBlock,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Select,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui';
import { can, ROLE_LABELS } from '@/lib/rbac';
import type { Notify, TeamUser } from '@/components/settings/shared';
import { relativeTime } from '@/lib/utils';
import type { Role } from '@prisma/client';
export function Team({
  currentUserId,
  onNotify,
}: {
  currentUserId: string | null;
  onNotify: Notify;
}) {
  const t = useTranslations('settingsPage');
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [assignable, setAssignable] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [resetting, setResetting] = useState<TeamUser | null>(null);
  const [removing, setRemoving] = useState<TeamUser | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/team');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setForbidden(res.status === 403);
        setError(
          res.status === 403
            ? 'Your role cannot manage the team.'
            : data.error ?? 'Could not load the team.',
        );
        return;
      }
      setForbidden(false);
      setUsers(data.users ?? []);
      setAssignable(data.assignableRoles ?? []);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (userId: string, body: Record<string, unknown>, failure: string) => {
    setPending(userId);
    try {
      const res = await fetch('/api/settings/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onNotify(data.error ?? failure, 'alert');
        return false;
      }
      return true;
    } catch {
      onNotify('Could not reach the server. Check your connection and try again.', 'alert');
      return false;
    } finally {
      setPending(null);
      void load();
    }
  };

  const changeRole = (userId: string, nextRole: Role) =>
    patch(userId, { role: nextRole }, 'Could not change that role.');

  const setActive = async (user: TeamUser, isActive: boolean) => {
    const done = await patch(user.id, { isActive }, 'Could not change that access.');
    if (done) {
      onNotify(
        isActive ? `${user.email} can sign in again.` : `${user.email} can no longer sign in.`,
        'success',
      );
    }
  };

  const remove = async () => {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      const res = await fetch(`/api/settings/team?userId=${removing.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return onNotify(data.error ?? 'Could not remove that user.', 'alert');
      }
      onNotify('User removed.', 'success');
      setRemoving(null);
      void load();
    } catch {
      onNotify('Could not reach the server. Check your connection and try again.', 'alert');
    } finally {
      setRemoveBusy(false);
    }
  };

  if (loading) return <LoadingBlock label={t('loadingTheTeam')} />;

  if (forbidden) {
    return (
      <Card>
        <EmptyState
          icon={<Lock strokeWidth={1.75} />}
          title={t('yourRoleCannotManageThe')}
          description={t('addingPeopleChangingRolesAnd')}
        />
      </Card>
    );
  }

  if (error) return <ErrorBlock message={error} onRetry={() => void load()} />;

  return (
    <>
      <Card>
        <CardHeader
          title={t('team')}
          description={`${users.length} member${users.length === 1 ? '' : 's'}`}
          action={
            <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
              <Plus className="h-4 w-4" strokeWidth={1.75} />{t('addMember')}</Button>
          }
        />

        {users.length === 0 ? (
          <EmptyState
            title={t('noOneHereYet')}
            description={t('addThePeopleWhoWill')}
            action={
              <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
                <Plus className="h-4 w-4" strokeWidth={1.75} />{t('addMember')}</Button>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('name')}</Th>
                <Th>{t('email')}</Th>
                <Th>{t('role')}</Th>
                <Th>{t('lastSignIn')}</Th>
                <Th align="right">{t('actions')}</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <Tr key={user.id}>
                    <Td>
                      <span className="text-sm">{user.name ?? '—'}</span>
                      {isSelf && <span className="ms-2 text-xs muted">you</span>}
                      {!user.isActive && (
                        <Badge tone="alert" className="ms-2">
                          suspended
                        </Badge>
                      )}
                    </Td>
                    <Td className="font-mono text-xs">{user.email}</Td>
                    <Td>
                      <Select
                        value={user.role}
                        aria-label={`Role for ${user.email}`}
                        disabled={pending === user.id}
                        onChange={(e) => void changeRole(user.id, e.target.value as Role)}
                        className="h-7 w-40 text-xs"
                      >
                        {assignable.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </Select>
                    </Td>
                    <Td className="text-xs muted">
                      {user.lastLoginAt ? relativeTime(user.lastLoginAt) : 'never'}
                    </Td>
                    <Td align="right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isSelf || pending === user.id}
                          title={isSelf ? 'You cannot suspend your own account.' : undefined}
                          onClick={() => void setActive(user, !user.isActive)}
                        >
                          {user.isActive ? 'Suspend' : 'Restore'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isSelf}
                          title={
                            isSelf ? 'Change your own password under Your account.' : undefined
                          }
                          onClick={() => setResetting(user)}
                        >
                          <KeyRound className="h-4 w-4" strokeWidth={1.75} />{t('resetPassword')}</Button>
                        <button
                          type="button"
                          onClick={() => setRemoving(user)}
                          disabled={isSelf}
                          aria-label={`Remove ${user.email}`}
                          className="rounded-control p-1.5 muted transition-colors hover:text-alert disabled:pointer-events-none disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {inviteOpen && (
        <InviteModal
          assignable={assignable}
          onClose={() => setInviteOpen(false)}
          onCreated={() => {
            setInviteOpen(false);
            onNotify('Member added.', 'success');
            void load();
          }}
          onError={(m) => onNotify(m, 'alert')}
        />
      )}

      {resetting && (
        <ResetPasswordModal
          user={resetting}
          onClose={() => setResetting(null)}
          onDone={() => {
            setResetting(null);
            onNotify('Password reset.', 'success');
          }}
          onError={(m) => onNotify(m, 'alert')}
        />
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => void remove()}
        title={`Remove ${removing?.email ?? ''}?`}
        description="Their account is deleted along with anything still assigned to them. To stop someone signing in while keeping their history, suspend them instead."
        confirmLabel={t('remove')}
        destructive
        loading={removeBusy}
      />
    </>
  );
}

/** Readable temporary password an admin can dictate over the phone. */
function randomPassword() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = new Uint32Array(14);
  crypto.getRandomValues(values);
  return Array.from(values, (n) => alphabet[n % alphabet.length]).join('');
}

function InviteModal({
  assignable,
  onClose,
  onCreated,
  onError,
}: {
  assignable: Role[];
  onClose: () => void;
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations('settingsPage');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'staff' as Role,
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.email || form.password.length < 8) {
      return onError('An email and a password of at least 8 characters are required.');
    }

    setBusy(true);
    try {
      const res = await fetch('/api/settings/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return onError(data.error ?? 'Could not add that member.');
      onCreated();
    } catch {
      onError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('addATeamMember')}
      width="sm"
      description={t('theyCanChangeThisPassword')}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" size="sm" loading={busy} onClick={() => void submit()}>{t('addMember')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('name')}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label={t('email')} required>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label={t('temporaryPassword')} required hint="min 8 characters">
          <Input
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="font-mono text-xs"
            autoComplete="off"
          />
        </Field>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setForm((current) => ({ ...current, password: randomPassword() }))}
        >{t('generateAPassword')}</Button>
        <Field label={t('role')}>
          <Select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          >
            {assignable.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({
  user,
  onClose,
  onDone,
  onError,
}: {
  user: TeamUser;
  onClose: () => void;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations('settingsPage');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (password.length < 8) return onError('Use a password of at least 8 characters.');

    setBusy(true);
    try {
      const res = await fetch('/api/settings/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, newPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return onError(data.error ?? 'Could not reset that password.');
      onDone();
    } catch {
      onError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Reset password for ${user.email}`}
      width="sm"
      description={t('theyKeepTheirAccountTheir')}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" size="sm" loading={busy} onClick={() => void submit()}>{t('resetPassword')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('newTemporaryPassword')} required hint="min 8 characters">
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="font-mono text-xs"
            autoComplete="off"
          />
        </Field>
        <Button type="button" variant="secondary" size="sm" onClick={() => setPassword(randomPassword())}>{t('generateAPassword')}</Button>
        <p className="text-xs muted">
          Pass it to them over a channel they already trust, and ask them to change it under Your
          account.
        </p>
      </div>
    </Modal>
  );
}

// ── Your account ─────────────────────────────────────────────────────────────