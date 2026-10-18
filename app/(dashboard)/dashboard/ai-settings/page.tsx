import { PageHeader } from '@/components/ui';
import { AiSettings } from '@/components/hub/ai-settings';

export const metadata = { title: 'AI settings' };

/** Provider readiness and the owner's AI drafting switch (Jodi's AiSettings). */
export default function AiSettingsPage() {
  return (
    <>
      <PageHeader title="AI settings" description="Review provider readiness and drafting controls." />
      <AiSettings />
    </>
  );
}
