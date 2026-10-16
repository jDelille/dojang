import { noContent, ok, parseBody, searchParams, withWorkspace } from '@/lib/api';
import { pushSubscribeSchema } from '@/lib/validation';
import { isPushConfigured, removeSubscription, saveSubscription } from '@/lib/integrations/push';

export const GET = withWorkspace(async () =>
  ok({
    configured: isPushConfigured(),
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  }),
);

export const POST = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, pushSubscribeSchema);

  await saveSubscription(
    ctx.workspaceId,
    { endpoint: body.endpoint, keys: body.keys },
    {
      userId: ctx.userId,
      userAgent: req.headers.get('user-agent') ?? undefined,
      fcmToken: body.fcmToken,
    },
  );

  return ok({ subscribed: true });
});

export const DELETE = withWorkspace(async (_ctx, req) => {
  const endpoint = searchParams(req).get('endpoint');
  if (endpoint) await removeSubscription(endpoint);
  return noContent();
});
