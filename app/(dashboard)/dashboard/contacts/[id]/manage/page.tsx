import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { MemberManagement } from '@/components/hub/member-management';

export const metadata = { title: 'Manage member' };

/**
 * Manage one Odoo member with reviewed, audited writes: contact, photo, rank,
 * billing checkout, refunds, waiver, guardian kiosk PIN, class changes and
 * archiving (Jodi's MemberManagement). `?section=` opens one section.
 */
export default async function ManageMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { id } = await params;
  const { section } = await searchParams;
  if (!/^[1-9][0-9]{0,9}$/.test(id)) notFound();
  return (
    <>
      <PageHeader title="Manage member" description="Every change is reviewed first and saved in Odoo under your own account." />
      <MemberManagement memberId={id} section={section} />
    </>
  );
}
