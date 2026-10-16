import { getCredentials } from '@/lib/credentials';
import { sleep } from '@/lib/utils';

/**
 * Google Maps Places lead source (spec §4.2 / §6.2).
 *
 * This is a faithful Node port of the original Python scraper's strategy:
 *   1. Text Search on "<niche> in <region>" — one query per target region.
 *   2. Walk `next_page_token` pages (max 3 pages / 60 results per query, which
 *      is the Places API hard cap), sleeping ~2s before each paged request
 *      because the token is not valid immediately after issue.
 *   3. Place Details for each result to pull phone + website, which the Text
 *      Search payload does not include.
 *   4. Stop as soon as the caller's target count is reached.
 */

const TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

const DETAIL_FIELDS = [
  'name',
  'formatted_address',
  // Structured locality/country, so the city is not guessed from a comma
  // split. Part of the Basic data tier, so it adds no billing cost.
  'address_component',
  'formatted_phone_number',
  'international_phone_number',
  'website',
  'rating',
  'user_ratings_total',
  'types',
  'business_status',
].join(',');

/**
 * Google returns the city under one of several component types depending on
 * the country — `locality` in most, `postal_town` across the UK, and only an
 * administrative area in places with no incorporated city.
 */
function localityOf(
  components?: Array<{ long_name: string; types: string[] }>,
): string | null {
  if (!components?.length) return null;
  for (const type of ['locality', 'postal_town', 'sublocality', 'administrative_area_level_2']) {
    const hit = components.find((c) => c.types.includes(type));
    if (hit) return hit.long_name;
  }
  return null;
}

function countryOf(
  components?: Array<{ long_name: string; types: string[] }>,
): string | null {
  return components?.find((c) => c.types.includes('country'))?.long_name ?? null;
}

/**
 * Last resort when components are absent. US-style addresses end
 * "…, City, ST ZIP, Country", so the city is third from the end — good enough
 * as a fallback, and null rather than a wrong guess when the shape differs.
 */
function cityFromFormatted(address?: string | null): string | null {
  const parts = (address ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length >= 3 ? parts[parts.length - 3] : null;
}

export type PlaceLead = {
  googlePlaceId: string;
  businessName: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
  country: string | null;
};

type TextSearchResponse = {
  status: string;
  error_message?: string;
  next_page_token?: string;
  results?: {
    place_id: string;
    name: string;
    formatted_address?: string;
    rating?: number;
    user_ratings_total?: number;
    types?: string[];
    business_status?: string;
  }[];
};

type DetailsResponse = {
  status: string;
  error_message?: string;
  result?: {
    name?: string;
    formatted_address?: string;
    formatted_phone_number?: string;
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
    international_phone_number?: string;
    website?: string;
    rating?: number;
    user_ratings_total?: number;
    types?: string[];
    business_status?: string;
  };
};

export class GoogleMapsError extends Error {}

export async function getMapsApiKey(workspaceId: string): Promise<string> {
  const { apiKey } = await getCredentials(workspaceId, 'google_maps');
  if (!apiKey) {
    throw new GoogleMapsError(
      'No Google Maps API key configured. Add one in Settings → Integrations before gathering leads.',
    );
  }
  return apiKey;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new GoogleMapsError(`Google Places returned HTTP ${response.status}.`);
  }
  return (await response.json()) as T;
}

function assertStatus(status: string, errorMessage?: string) {
  if (status === 'OK' || status === 'ZERO_RESULTS') return;
  if (status === 'OVER_QUERY_LIMIT') {
    throw new GoogleMapsError('Google Places quota exceeded for this API key.');
  }
  if (status === 'REQUEST_DENIED') {
    throw new GoogleMapsError(
      `Google Places denied the request${errorMessage ? `: ${errorMessage}` : '. Check the API key and that Places API is enabled.'}`,
    );
  }
  throw new GoogleMapsError(`Google Places error: ${status}${errorMessage ? ` — ${errorMessage}` : ''}`);
}

/**
 * Runs one "<niche> in <region>" query and returns up to 60 place IDs,
 * following next_page_token exactly as the original script did.
 */
async function searchRegion(
  apiKey: string,
  query: string,
  limit: number,
): Promise<{ placeId: string; seed: Partial<PlaceLead> }[]> {
  const collected: { placeId: string; seed: Partial<PlaceLead> }[] = [];
  let pageToken: string | undefined;
  let page = 0;

  while (page < 3 && collected.length < limit) {
    const params = new URLSearchParams({ key: apiKey });
    if (pageToken) {
      params.set('pagetoken', pageToken);
      // The token needs a moment to become valid — the original script slept
      // 2 seconds here and so do we.
      await sleep(2_000);
    } else {
      params.set('query', query);
    }

    const data = await fetchJson<TextSearchResponse>(`${TEXT_SEARCH_URL}?${params}`);
    assertStatus(data.status, data.error_message);

    for (const result of data.results ?? []) {
      if (collected.length >= limit) break;
      if (result.business_status && result.business_status !== 'OPERATIONAL') continue;

      collected.push({
        placeId: result.place_id,
        seed: {
          businessName: result.name,
          address: result.formatted_address ?? null,
          rating: result.rating ?? null,
          reviewCount: result.user_ratings_total ?? null,
          category: result.types?.[0]?.replace(/_/g, ' ') ?? null,
        },
      });
    }

    pageToken = data.next_page_token;
    page += 1;
    if (!pageToken) break;
  }

  return collected;
}

async function fetchDetails(
  apiKey: string,
  placeId: string,
  seed: Partial<PlaceLead>,
  country: string | null,
): Promise<PlaceLead | null> {
  const params = new URLSearchParams({
    key: apiKey,
    place_id: placeId,
    fields: DETAIL_FIELDS,
  });

  try {
    const data = await fetchJson<DetailsResponse>(`${DETAILS_URL}?${params}`);
    if (data.status !== 'OK' || !data.result) return null;

    const r = data.result;
    return {
      googlePlaceId: placeId,
      businessName: r.name ?? seed.businessName ?? 'Unknown business',
      address: r.formatted_address ?? seed.address ?? null,
      city: localityOf(r.address_components) ?? cityFromFormatted(r.formatted_address),
      phone: r.international_phone_number ?? r.formatted_phone_number ?? null,
      website: r.website ?? null,
      category: r.types?.[0]?.replace(/_/g, ' ') ?? seed.category ?? null,
      rating: r.rating ?? seed.rating ?? null,
      reviewCount: r.user_ratings_total ?? seed.reviewCount ?? null,
      // Prefer what Google says the country is over the phrase the operator
      // typed into the search box, which may be a city or a whole region.
      country: countryOf(r.address_components) ?? country,
    };
  } catch {
    // A single failed detail lookup shouldn't abort the whole batch.
    return null;
  }
}

export type GatherOptions = {
  apiKey: string;
  niche: string;
  regions: string[];
  targetCount: number;
  /** Called after each region so the job row can show live progress. */
  onProgress?: (found: number) => void | Promise<void>;
};

export async function gatherPlaces(options: GatherOptions): Promise<PlaceLead[]> {
  const { apiKey, niche, regions, targetCount, onProgress } = options;
  const leads: PlaceLead[] = [];
  const seenPlaceIds = new Set<string>();

  const targets = regions.length ? regions : [''];
  // Spread the target evenly across regions, then let later regions absorb
  // any shortfall from earlier ones.
  const perRegion = Math.max(Math.ceil(targetCount / targets.length), 1);

  for (const region of targets) {
    if (leads.length >= targetCount) break;

    const query = region ? `${niche} in ${region}` : niche;
    const remaining = targetCount - leads.length;
    const found = await searchRegion(apiKey, query, Math.min(perRegion + 10, remaining + 10));

    for (const candidate of found) {
      if (leads.length >= targetCount) break;
      if (seenPlaceIds.has(candidate.placeId)) continue;
      seenPlaceIds.add(candidate.placeId);

      const detail = await fetchDetails(apiKey, candidate.placeId, candidate.seed, region || null);
      if (detail) leads.push(detail);
    }

    await onProgress?.(leads.length);
  }

  return leads;
}

/** Cheap credential check for the integrations screen. */
export async function verifyMapsKey(apiKey: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const params = new URLSearchParams({ key: apiKey, query: 'coffee in London' });
    const data = await fetchJson<TextSearchResponse>(`${TEXT_SEARCH_URL}?${params}`);
    assertStatus(data.status, data.error_message);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
