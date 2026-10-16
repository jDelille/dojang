/** Shapes and constants shared by the Leads panels. */

export type Owner = {
  id: string;
  name: string | null;
  email: string;
};

export type Lead = {
  id: string;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
  status: string;
  source: string;
  ownerId: string | null;
  owner: Owner | null;
  createdAt: string;
};

export type GatherJob = {
  id: string;
  niche: string;
  countries: string[];
  targetCount: number;
  foundCount: number;
  savedCount: number;
  dupeCount: number;
  status: string;
  error: string | null;
  createdAt: string;
};

export const STATUSES = ['new', 'contacted', 'booked', 'won', 'lost'] as const;

export const PAGE_SIZE = 25;

/** Remembers which failed gather the user has already seen, so it stops nagging. */
export const DISMISSED_JOB_KEY = 'roster.leads.dismissedGatherJob';
