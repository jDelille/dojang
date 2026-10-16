import webpush from 'web-push';
import { prisma } from '@/lib/db';
import { getCredentials } from '@/lib/credentials';
import { recordUsage } from '@/lib/usage';
import { sendFcmV1 } from '@/lib/integrations/fcm';

/**
 * Web Push (VAPID) with optional Firebase Cloud Messaging for native mobile
 * (spec §2). VAPID keys are platform-level; FCM is per-workspace.
 */

let vapidConfigured = false;

function configureVapid(): boolean {
  if (vapidConfigured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export function isPushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/**
 * Fans a notification out to every subscription in the workspace (or one user).
 * Expired subscriptions (404/410) are pruned as we go.
 */
export async function sendPush(
  workspaceId: string,
  payload: PushPayload,
  target?: { userId?: string; contactId?: string },
): Promise<{ sent: number; pruned: number }> {
  if (!configureVapid()) return { sent: 0, pruned: 0 };

  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      workspaceId,
      ...(target?.userId ? { userId: target.userId } : {}),
      ...(target?.contactId ? { contactId: target.contactId } : {}),
    },
  });

  if (!subscriptions.length) return { sent: 0, pruned: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  const expired: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) expired.push(sub.id);
        else console.error('[push] send failed', status, (error as Error).message);
      }
    }),
  );

  if (expired.length) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: expired } } });
  }

  if (sent) await recordUsage(workspaceId, 'push_sent', sent);

  // Mobile devices registered through FCM get the same payload.
  const fcmTokens = subscriptions.map((s) => s.fcmToken).filter(Boolean) as string[];
  const fcm = await sendFcmV1(workspaceId, payload, fcmTokens);

  // Prune tokens FCM reports as dead, the same way expired web-push
  // subscriptions are pruned — otherwise the list only ever grows.
  if (fcm.invalid.length) {
    await prisma.pushSubscription.deleteMany({ where: { fcmToken: { in: fcm.invalid } } });
  }
  if (fcm.sent) await recordUsage(workspaceId, 'push_sent', fcm.sent);

  return { sent: sent + fcm.sent, pruned: expired.length + fcm.invalid.length };
}

export async function saveSubscription(
  workspaceId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  target: { userId?: string; contactId?: string; userAgent?: string; fcmToken?: string } = {},
) {
  return prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      workspaceId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userId: target.userId ?? null,
      contactId: target.contactId ?? null,
      userAgent: target.userAgent ?? null,
      fcmToken: target.fcmToken ?? null,
    },
    update: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userId: target.userId ?? null,
      fcmToken: target.fcmToken ?? null,
    },
  });
}

export async function removeSubscription(endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}
