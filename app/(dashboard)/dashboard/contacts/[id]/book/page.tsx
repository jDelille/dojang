import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { MemberBooking } from '@/components/hub/member-booking';

export const metadata = { title: 'Book a class' };

/** Book one Odoo member into a future class, reviewed first and saved under the staff member's own account (Jodi's MemberBooking). */
export default async function BookMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9][0-9]{0,9}$/.test(id)) notFound();
  return (
    <>
      <PageHeader title="Book a class" description="Odoo checks eligibility and capacity when you confirm." />
      <MemberBooking memberId={id} />
    </>
  );
}
