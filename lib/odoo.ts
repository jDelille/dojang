/**
 * Odoo 20 is the system of record for people, members, classes and
 * attendance. Roster reads it through Odoo's JSON-2 external API
 * (POST /json/2/<model>/<method>, bearer API key) from the server only — the
 * key never reaches the browser.
 *
 * Reads name their fields explicitly. Never request dojo.member's medical
 * fields (allergies, medical_notes, blood_type, emergency_note): those stay
 * behind Odoo's own access rules.
 */

export type Many2one = [number, string] | false;

export function odooConfigured() {
  return !!(process.env.ODOO_URL && process.env.ODOO_DB && process.env.ODOO_API_KEY);
}

export async function odooCall<T>(model: string, method: string, params: Record<string, unknown>): Promise<T> {
  const base = process.env.ODOO_URL!.replace(/\/+$/, '');
  const res = await fetch(`${base}/json/2/${model}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `bearer ${process.env.ODOO_API_KEY}`,
      'X-Odoo-Database': process.env.ODOO_DB!,
    },
    body: JSON.stringify(params),
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(`Odoo ${model}.${method} failed (${res.status})${data?.message ? `: ${data.message}` : ''}`);
  }
  return res.json() as Promise<T>;
}

export function searchRead<T>(
  model: string,
  domain: unknown[],
  fields: string[],
  options: { order?: string; limit?: number; offset?: number } = {},
) {
  return odooCall<T[]>(model, 'search_read', { domain, fields, ...options });
}

export function searchCount(model: string, domain: unknown[]) {
  return odooCall<number>(model, 'search_count', { domain });
}

/** Odoo stores datetimes as naive UTC strings: "2026-10-15 17:00:00". */
export function toOdooDatetime(date: Date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export function fromOdooDatetime(value: string) {
  return new Date(`${value.replace(' ', 'T')}Z`);
}

export function m2oName(value: Many2one) {
  return value ? value[1] : null;
}
