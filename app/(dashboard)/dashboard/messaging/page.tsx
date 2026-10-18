import { PageHeader } from '@/components/ui';
import { MessagingConsent } from '@/components/hub/messaging-consent';

export const metadata = { title: 'Messaging & consent' };

/** Reviewed broadcasts, consent records and Odoo automations (Jodi's CommunicationsWorkspace). */
export default function MessagingPage() {
  return (
    <>
      <PageHeader title="Messaging & consent" description="Review broadcasts, record consent and manage automations." />
      <MessagingConsent />
    </>
  );
}
