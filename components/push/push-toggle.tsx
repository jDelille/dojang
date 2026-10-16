'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Button, Card, CardBody, useToast } from '@/components/ui';

type State = 'checking' | 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on';

/** VAPID keys are base64url; PushManager wants a Uint8Array. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Registers the service worker and subscribes this browser to push.
 *
 * Without this nothing ever called /api/push/subscribe, so appointment
 * reminders, missed-call alerts and retention notify-team steps were all
 * delivered to an empty subscriber list.
 */
export function PushToggle() {
  const [state, setState] = useState<State>('checking');
  const [busy, setBusy] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const toast = useToast();

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }

    try {
      const res = await fetch('/api/push/subscribe');
      const data = await res.json();
      if (!res.ok || !data.configured || !data.publicKey) {
        setState('unconfigured');
        return;
      }
      setPublicKey(data.publicKey);

      if (Notification.permission === 'denied') {
        setState('denied');
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      const existing = await registration?.pushManager.getSubscription();
      setState(existing ? 'on' : 'off');
    } catch {
      setState('unconfigured');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = async () => {
    if (!publicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const json = subscription.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        toast.show('The browser returned an incomplete subscription.', 'alert');
        return;
      }

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.show(data.error ?? 'Could not save the subscription.', 'alert');
        return;
      }

      setState('on');
      toast.show('Notifications are on for this browser.', 'success');
    } catch (error) {
      toast.show(`Could not enable notifications: ${(error as Error).message}`, 'alert');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`, {
          method: 'DELETE',
        });
        await subscription.unsubscribe();
      }

      setState('off');
      toast.show('Notifications are off for this browser.', 'success');
    } catch {
      toast.show('Could not turn notifications off.', 'alert');
    } finally {
      setBusy(false);
    }
  };

  const copy: Record<State, { title: string; body: string }> = {
    checking: { title: 'Notifications', body: 'Checking this browser…' },
    unsupported: {
      title: 'Notifications not supported',
      body: 'This browser does not support web push. Try Chrome, Edge, Firefox, or Safari 16.4+.',
    },
    unconfigured: {
      title: 'Notifications not configured',
      body: 'Generate VAPID keys with "npx web-push generate-vapid-keys" and set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in your .env.',
    },
    denied: {
      title: 'Notifications blocked',
      body: 'This browser is blocking notifications for the site. Re-allow them in your browser settings, then reload.',
    },
    off: {
      title: 'Notifications are off',
      body: 'Turn them on to get missed-call alerts, escalated conversations and appointment reminders on this device.',
    },
    on: {
      title: 'Notifications are on',
      body: 'This browser will receive missed-call alerts, escalations and reminders.',
    },
  };

  return (
    <Card>
      <CardBody className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {state === 'on' ? (
            <Bell className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={1.75} />
          ) : (
            <BellOff className="mt-0.5 h-4 w-4 shrink-0 muted" strokeWidth={1.75} />
          )}
          <div>
            <p className="text-sm font-medium">{copy[state].title}</p>
            <p className="mt-0.5 max-w-md text-xs leading-relaxed muted">{copy[state].body}</p>
          </div>
        </div>

        {(state === 'off' || state === 'on') && (
          <Button
            variant={state === 'on' ? 'secondary' : 'primary'}
            size="sm"
            loading={busy}
            onClick={() => (state === 'on' ? void disable() : void enable())}
          >
            {state === 'on' ? 'Turn off' : 'Turn on notifications'}
          </Button>
        )}
      </CardBody>

      {toast.node}
    </Card>
  );
}
