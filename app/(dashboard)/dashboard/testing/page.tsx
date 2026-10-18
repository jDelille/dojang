import { PageHeader } from '@/components/ui';
import { BeltTesting } from '@/components/hub/belt-testing';

export const metadata = { title: 'Belt testing' };

/** Testing rosters, results, promotions and reversals on Odoo's belt tests (Jodi's TestingWorkspace). */
export default function BeltTestingPage() {
  return (
    <>
      <PageHeader title="Belt testing" description="Build testing rosters, record results and promote students after review." />
      <BeltTesting />
    </>
  );
}
