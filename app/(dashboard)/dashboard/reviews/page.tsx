import { requireWorkspace } from '@/lib/session';
import { ReviewsClient } from '@/components/reviews/reviews-client';

export const metadata = { title: 'Reviews' };

export default async function ReviewsPage() {
  await requireWorkspace();
  return <ReviewsClient />;
}
