import { prisma } from '@/lib/db';
import { fail, noContent, ok, parseBody, routeParam, withWorkspace } from '@/lib/api';
import { appointmentUpdateSchema } from '@/lib/validation';
import { deleteCalendarEvent } from '@/lib/integrations/calendar';
import { logActivity } from '@/lib/workspace';

export const PATCH = withWorkspace(async (ctx, req, params) => {
  const id = await routeParam(params, 'id');
  const body = await parseBody(req, appointmentUpdateSchema);

  const existing = await prisma.appointment.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
  });
  if (!existing) return fail(404, 'Appointment not found.');

  const appointment = await prisma.appointment.update({
    where: { id },
    data: {
      title: body.title,
      notes: body.notes,
      location: body.location,
      status: body.status,
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
      endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
    },
    include: { contact: { select: { id: true, name: true } } },
  });

  if (body.status && body.status !== existing.status) {
    await logActivity({
      workspaceId: ctx.workspaceId,
      contactId: appointment.contactId,
      userId: ctx.userId,
      type: 'appointment',
      title: `Appointment ${body.status}: ${appointment.title}`,
    });
  }

  return ok({ appointment });
}, 'appointments:write');

export const DELETE = withWorkspace(async (ctx, _req, params) => {
  const id = await routeParam(params, 'id');

  const appointment = await prisma.appointment.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    include: { calendarAccount: true },
  });
  if (!appointment) return fail(404, 'Appointment not found.');

  if (appointment.calendarAccount && appointment.calendarEventId) {
    await deleteCalendarEvent(appointment.calendarAccount, appointment.calendarEventId);
  }

  await prisma.appointment.delete({ where: { id } });
  return noContent();
}, 'appointments:write');
