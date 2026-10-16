import { requireWorkspace } from '@/lib/session';
import { ContactsClient } from '@/components/contacts/contacts-client';
import { MembersView, type MembersData } from '@/components/contacts/members-view';
import { odooConfigured } from '@/lib/odoo';
import { loadMembers } from '@/lib/academy';

export const metadata = { title: 'Members' };

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string; page?: string }>;
}) {
  await requireWorkspace();
  // Without Odoo, fall back to Roster's own contact list.
  if (!odooConfigured()) return <ContactsClient />;

  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const state = params.state ?? '';
  const page = Math.max(1, Number(params.page) || 1);

  let data: MembersData;
  try {
    data = { ok: true, ...(await loadMembers({ q, state, page })) };
  } catch (error) {
    console.error('[members] Odoo read failed:', error);
    data = { ok: false };
  }

  return <MembersView data={data} q={q} state={state} page={page} />;
}
