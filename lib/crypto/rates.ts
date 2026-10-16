import type { CryptoAsset } from '@/lib/crypto/derive';
import { ASSETS } from '@/lib/crypto/derive';

/**
 * Fiat → crypto quotes.
 *
 * Uses CoinGecko's public endpoint, which needs no key, so a fresh install can
 * quote immediately. Tatum also serves rates; this is kept separate from the
 * chain layer so swapping one does not disturb the other.
 */

const COINGECKO = 'https://api.coingecko.com/api/v3/simple/price';

const COINGECKO_ID: Record<CryptoAsset, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT_TRON: 'tether',
  USDC_TRON: 'usd-coin',
};

export class RateUnavailableError extends Error {}

// A quote is only good for a couple of minutes, so a short cache spares the
// rate limit without letting anyone pay against a stale price.
const cache = new Map<string, { rate: number; at: number }>();
const CACHE_MS = 60_000;

/** Units of `asset` that one unit of `fiatCurrency` buys. */
export async function getRate(asset: CryptoAsset, fiatCurrency: string): Promise<number> {
  const fiat = fiatCurrency.toLowerCase();
  const key = `${asset}:${fiat}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rate;

  const url = `${COINGECKO}?ids=${COINGECKO_ID[asset]}&vs_currencies=${encodeURIComponent(fiat)}`;

  let body: Record<string, Record<string, number>>;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    body = await res.json();
  } catch (error) {
    // Serve a stale rate rather than block a payment outright — but only
    // briefly, and never silently for a volatile asset.
    if (hit && (ASSETS[asset].stable || Date.now() - hit.at < 10 * 60_000)) return hit.rate;
    throw new RateUnavailableError(
      `Could not fetch a ${asset} price in ${fiatCurrency.toUpperCase()}: ${(error as Error).message}`,
    );
  }

  const price = body?.[COINGECKO_ID[asset]]?.[fiat];
  if (!price || price <= 0) {
    throw new RateUnavailableError(
      `No ${asset} price available in ${fiatCurrency.toUpperCase()}. ` +
        `That currency may not be supported — try USD.`,
    );
  }

  cache.set(key, { rate: price, at: Date.now() });
  return price;
}

/**
 * Converts a fiat amount into whole units of the asset, rounded *up* at the
 * asset's precision. Rounding down would leave every invoice a dust amount
 * short and permanently flagged as underpaid.
 */
export async function quote(
  asset: CryptoAsset,
  fiatAmount: number,
  fiatCurrency: string,
): Promise<{ amount: string; rate: number }> {
  const rate = await getRate(asset, fiatCurrency);
  const { decimals } = ASSETS[asset];

  const raw = fiatAmount / rate;
  const factor = 10 ** decimals;
  const rounded = Math.ceil(raw * factor) / factor;

  return { amount: rounded.toFixed(decimals).replace(/0+$/, '').replace(/\.$/, ''), rate };
}

/** How long a quote stands before the customer must be re-quoted. */
export function quoteWindowMinutes(asset: CryptoAsset): number {
  // Stablecoins barely move, so a long window is safe and far friendlier —
  // bank transfers and manual wallet steps take real time. Volatile assets
  // get the industry-standard 15.
  return ASSETS[asset].stable ? 60 : 15;
}
