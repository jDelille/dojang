import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/students — create the reviewed student (and a new guardian household for a child). payload: { intake, reviewToken } from the preview. */
export const POST = hubWrite('create_student', 'students.create');
