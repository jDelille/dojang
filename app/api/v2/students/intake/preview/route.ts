import { hubPreview } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/students/intake/preview — check a new-student intake (fields, duplicates) without saving. payload: { intake } */
export const POST = hubPreview('intake_preview', 'students.create');
