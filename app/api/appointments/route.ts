import { prisma } from '@/lib/db';
import { created, fail, ok, parseBody, searchParams, withWorkspace } from '@/lib/api';
import { appointmentCreateSchema } from '@/lib/validation';
import { createCalendarEvent } from '@/lib/integrations/calendar';
import { enqueueReminder } from '@/lib/queue';
import { logActivity } from '@/lib/workspace';

/** Appointment booking with calendar sync + reminder scheduling (spec §4.5). */

export const GET = withWorkspace(async (ctx, req) => {
  const sp = searchParams(req);
  const from = sp.get('from') ? new Date(sp.get('from')!) : new Date(Date.now() - 7 * 86_400_000);
  const to = sp.get('to') ? new Date(sp.get('to')!) : new Date(Date.now() + 60 * 86_400_000);

  const [appointments, calendars] = await Promise.all([
    prisma.appointment.findMany({
      where: { workspaceId: ctx.workspaceId, startsAt: { gte: from, lte: to } },
      orderBy: { startsAt: 'asc' },
      include: {
        contact: { select: { id: true, name: true, email: true, phone: true } },
      },
    }),
    prisma.calendarAccount.findMany({
      where: { workspaceId: ctx.workspaceId, isActive: true },
      select: { id: true, provider: true, accountEmail: true },
    }),
  ]);

  return ok({ appointments, calendars });
}, 'leads:read');

export const POST = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, appointmentCreateSchema);

  const contact = await prisma.contact.findFirst({
    where: { id: body.contactId, workspaceId: ctx.workspaceId },
  });
  if (!contact) return fail(404, 'Contact not found in this workspace.');

  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(body.endsAt);
  if (endsAt <= startsAt) return fail(422, 'The end time must be after the start time.');

  const calendarAccount = await prisma.calendarAccount.findFirst({
    where: { workspaceId: ctx.workspaceId, isActive: true },
  });

  const appointment = await prisma.appointment.create({
    data: {
      workspaceId: ctx.workspaceId,
      contactId: contact.id,
      calendarAccountId: calendarAccount?.id ?? null,
      title: body.title,
      notes: body.notes ?? null,
      location: body.location ?? null,
      startsAt,
      endsAt,
      status: body.status ?? 'scheduled',
    },
    include: { contact: { select: { id: true, name: true, email: true } } },
  });

  // Calendar sync is best-effort — a failure must not lose the booking.
  let calendarEventId: string | null = null;
  if (calendarAccount) {
    const eventId = await createCalendarEvent(calendarAccount, {
      title: appointment.title,
      description: appointment.notes ?? undefined,
      location: appointment.location ?? undefined,
      startsAt,
      endsAt,
      attendeeEmail: contact.email,
    });
    if (eventId) {
      calendarEventId = eventId;
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { calendarEventId: eventId },
      });
    }
  }

  // Reminder 24h before — the reminder worker skips it if it's already past.
  const remindAt = new Date(startsAt.getTime() - 24 * 3_600_000);
  if (remindAt > new Date()) {
    await enqueueReminder(
      { appointmentId: appointment.id, workspaceId: ctx.workspaceId },
      remindAt,
    ).catch((error) => console.error('[appointments] reminder queue failed', error.message));
  }

  await logActivity({
    workspaceId: ctx.workspaceId,
    contactId: contact.id,
    userId: ctx.userId,
    type: 'appointment',
    title: `Appointment booked: ${appointment.title}`,
    body: startsAt.toISOString(),
  });

  // Merge the sync result in: `appointment` was captured before the calendar
  // round-trip, so returning it as-is reports every synced booking as unsynced
  // until the client happens to refetch.
  return created({ appointment: { ...appointment, calendarEventId } });
}, 'appointments:write');
