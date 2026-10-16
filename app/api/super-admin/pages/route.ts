import { z } from 'zod';
import { prisma } from '@/lib/db';
import { created, fail, ok, parseBody, withWorkspace } from '@/lib/api';
import { slugify, STARTER_PAGES } from '@/lib/pages';

/**
 * Public-page management. Gated on platform:admin, not workspace admin —
 * these are the *site's* pages, and in agency mode a sub-account must not be
 * able to rewrite the host's terms of service.
 */

const saveSchema = z.object({
  id: z.string().optional(),
  slug: z.string().max(60).optional(),
  title: z.string().min(1).max(120),
  content: z.string().max(200_000),
  isPublished: z.boolean().optional(),
  showInFooter: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const GET = withWorkspace(async () => {
  let pages = await prisma.sitePage.findMany({
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
  });

  // Seed the starter drafts once, so the first visit shows editable policies
  // rather than an empty screen and a blank editor.
  if (pages.length === 0) {
    await prisma.sitePage.createMany({
      // Published on purpose. A product that takes payments with no privacy
      // policy or terms anywhere is worse than one with clearly-marked
      // templates — and an unpublished draft leaves the footer empty, so the
      // buyer never discovers the feature exists.
      data: STARTER_PAGES.map((page, index) => ({ ...page, sortOrder: index, isPublished: true })),
      skipDuplicates: true,
    });
    pages = await prisma.sitePage.findMany({ orderBy: [{ sortOrder: 'asc' }] });
  }

  return ok({ pages });
}, 'platform:admin');

export const POST = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, saveSchema);
  const slug = slugify(body.slug || body.title);
  if (!slug) return fail(422, 'That title does not produce a usable web address.');

  if (body.id) {
    const existing = await prisma.sitePage.findUnique({ where: { id: body.id } });
    if (!existing) return fail(404, 'Page not found.');

    const clash = await prisma.sitePage.findFirst({
      where: { slug, id: { not: body.id } },
      select: { id: true },
    });
    if (clash) return fail(409, `Another page already uses /p/${slug}.`);

    const page = await prisma.sitePage.update({
      where: { id: body.id },
      data: {
        slug,
        title: body.title,
        content: body.content,
        isPublished: body.isPublished ?? existing.isPublished,
        showInFooter: body.showInFooter ?? existing.showInFooter,
        sortOrder: body.sortOrder ?? existing.sortOrder,
        updatedById: ctx.userId,
      },
    });
    return ok({ page });
  }

  const clash = await prisma.sitePage.findUnique({ where: { slug }, select: { id: true } });
  if (clash) return fail(409, `A page already uses /p/${slug}.`);

  const page = await prisma.sitePage.create({
    data: {
      slug,
      title: body.title,
      content: body.content,
      isPublished: body.isPublished ?? false,
      showInFooter: body.showInFooter ?? true,
      sortOrder: body.sortOrder ?? 0,
      updatedById: ctx.userId,
    },
  });
  return created({ page });
}, 'platform:admin');

export const DELETE = withWorkspace(async (_ctx, req) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail(400, 'Which page?');

  await prisma.sitePage.delete({ where: { id } }).catch(() => null);
  return ok({ deleted: id });
}, 'platform:admin');
