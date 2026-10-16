import type { CryptoAsset, CryptoNetwork } from '@/lib/crypto/derive';
import { ASSETS } from '@/lib/crypto/derive';

/**
 * Read-only chain queries: has this address been paid, and how deeply is it
 * confirmed?
 *
 * Every chain is read through free, keyless public infrastructure —
 * mempool.space for Bitcoin, TronGrid for Tron, and public JSON-RPC nodes for
 * Ethereum — so a fresh install can take a crypto payment without the buyer
 * signing up to anything. Nothing here can move funds; these are balance and
 * transaction lookups only.
 */

export interface ChainObservation {
  /** Received by the address *since the request was issued*, in whole units. */
  received: number;
  txHash: string | null;
  confirmations: number;
}

/** Confirmations before an invoice is treated as settled. */
export const CONFIRMATIONS_REQUIRED: Record<CryptoAsset, number> = {
  // ~1 hour of work; the standard bar for irreversibility on Bitcoin.
  BTC: 2,
  ETH: 12,
  // Tron finalises in ~3 seconds and reorgs past 19 blocks are practically
  // unheard of, so this is already conservative.
  USDT_TRON: 19,
  USDC_TRON: 19,
};

/**
 * TRC-20 contract addresses. Nile (Tron's testnet) hosts its own deployments,
 * and they are overridable because testnet contracts get redeployed far more
 * often than mainnet ones.
 */
const TRC20_CONTRACT: Record<CryptoNetwork, Record<string, string>> = {
  mainnet: {
    USDT_TRON: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    USDC_TRON: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8',
  },
  testnet: {
    USDT_TRON: process.env.TRON_NILE_USDT ?? 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
    USDC_TRON: process.env.TRON_NILE_USDC ?? '',
  },
};

const TRON_HOST: Record<CryptoNetwork, string> = {
  mainnet: 'https://api.trongrid.io',
  testnet: 'https://nile.trongrid.io',
};

/**
 * Bitcoin has two live testnets and faucets are split between them: most of
 * the long-running ones still pay out on testnet3, while testnet4 is the
 * actively maintained chain. Selectable so a demo can match whichever faucet
 * is working, without a code change.
 */
const BITCOIN_TESTNET = process.env.BITCOIN_TESTNET === 'testnet3' ? 'testnet' : 'testnet4';

const MEMPOOL_HOST: Record<CryptoNetwork, string> = {
  mainnet: 'https://mempool.space/api',
  testnet: `https://mempool.space/${BITCOIN_TESTNET}/api`,
};

export class ChainUnavailableError extends Error {}

/**
 * Keyless public Ethereum RPC endpoints, tried in order.
 *
 * Deliberately no API key: requiring one (Tatum, Etherscan, Alchemy) means a
 * buyer cannot take an ETH payment until they have signed up somewhere, and a
 * self-hosted script should work out of the box. Several are listed because
 * any single free endpoint will eventually rate-limit or go down.
 */
const ETH_RPCS: Record<CryptoNetwork, string[]> = {
  mainnet: [
    'https://ethereum-rpc.publicnode.com',
    'https://eth.merkle.io',
    'https://eth.drpc.org',
    'https://rpc.flashbots.net',
  ],
  testnet: [
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://sepolia.drpc.org',
  ],
};

async function ethRpc<T>(
  method: string,
  params: unknown[],
  network: CryptoNetwork = 'mainnet',
): Promise<T> {
  let lastError = '';
  for (const url of ETH_RPCS[network]) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const body = (await res.json()) as { result?: T; error?: { message?: string } };
      if (body.error || body.result === undefined) {
        lastError = body.error?.message ?? 'no result';
        continue;
      }
      return body.result;
    } catch (error) {
      lastError = (error as Error).message;
    }
  }
  throw new ChainUnavailableError(`No Ethereum RPC responded (${lastError}).`);
}

export class RateLimitedError extends ChainUnavailableError {}

/**
 * Free public explorers rate-limit aggressively, and the watcher sweeps every
 * minute. A 429 is retried with backoff rather than surfaced, because the
 * caller treats any failure as "no news", which would leave a customer staring
 * at an unacknowledged payment they have already made.
 */
async function getJson(
  url: string,
  headers: Record<string, string> = {},
  attempt = 0,
): Promise<unknown> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });

  if (res.status === 429) {
    if (attempt < 2) {
      const wait = Number(res.headers.get('retry-after') ?? 0) * 1000 || 1500 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, Math.min(wait, 8000)));
      return getJson(url, headers, attempt + 1);
    }
    throw new RateLimitedError(`${url.split('?')[0]} is rate-limiting; will retry next sweep.`);
  }

  if (!res.ok) throw new ChainUnavailableError(`${url.split('?')[0]} returned HTTP ${res.status}`);
  return res.json();
}

/**
 * @param since Only funds that arrived at or after this instant count.
 *
 * This is not a nicety. Buyers connect the account xpub of a wallet they
 * already use, so low derivation indices frequently have prior history — and
 * counting a pre-existing balance would settle an invoice nobody paid. Only
 * money that arrives after the request was issued can pay it.
 */
export async function observeAddress(
  asset: CryptoAsset,
  address: string,
  since: Date,
  baseline = 0,
  detectedAtBlock?: number,
  network: CryptoNetwork = 'mainnet',
): Promise<ChainObservation> {
  switch (ASSETS[asset].chain) {
    case 'bitcoin':
      return observeBitcoin(address, since, network);
    case 'ethereum':
      return observeEthereum(address, since, baseline, detectedAtBlock, network);
    case 'tron':
      return observeTron(asset, address, since, network);
    default:
      throw new ChainUnavailableError(`No chain adapter for ${asset}.`);
  }
}

// ── Bitcoin ──────────────────────────────────────────────────────────────────

async function observeBitcoin(
  address: string,
  since: Date,
  network: CryptoNetwork = 'mainnet',
): Promise<ChainObservation> {
  const host = MEMPOOL_HOST[network];
  // mempool.space needs no key and reports confirmed and unconfirmed
  // separately, which is what distinguishes "seen" from "settled".
  //
  // This returns only the most recent page of transactions. That is fine here
  // because each address serves exactly one invoice and is watched from the
  // moment it is issued, so any payment is by definition among the newest —
  // but it would undercount if an address were ever reused at volume.
  const txs = (await getJson(`${host}/address/${address}/txs`)) as Array<{
    txid: string;
    status: { confirmed: boolean; block_height?: number; block_time?: number };
    vout: Array<{ scriptpubkey_address?: string; value: number }>;
  }>;

  const sinceSeconds = Math.floor(since.getTime() / 1000);
  // Unconfirmed transactions have no block_time; they are by definition new.
  const relevant = txs.filter(
    (tx) => !tx.status.confirmed || (tx.status.block_time ?? 0) >= sinceSeconds,
  );
  if (!relevant.length) return { received: 0, txHash: null, confirmations: 0 };

  const sats = relevant.reduce(
    (sum, tx) =>
      sum +
      tx.vout
        .filter((o) => o.scriptpubkey_address === address)
        .reduce((s, o) => s + o.value, 0),
    0,
  );
  if (sats === 0) return { received: 0, txHash: null, confirmations: 0 };

  const latest = relevant[0];
  let confirmations = 0;
  if (latest.status.confirmed && latest.status.block_height) {
    const tip = Number(await (await fetch(`${host}/blocks/tip/height`)).text());
    confirmations = Math.max(0, tip - latest.status.block_height + 1);
  }

  return { received: sats / 10 ** 8, txHash: latest.txid, confirmations };
}

// ── Ethereum ─────────────────────────────────────────────────────────────────

/** Current ETH balance of an address, in whole ether. */
export async function ethereumBalance(
  address: string,
  network: CryptoNetwork = 'mainnet',
): Promise<number> {
  const wei = await ethRpc<string>('eth_getBalance', [address, 'latest'], network);
  return Number(BigInt(wei)) / 1e18;
}

export async function ethereumBlockNumber(network: CryptoNetwork = 'mainnet'): Promise<number> {
  return Number(BigInt(await ethRpc<string>('eth_blockNumber', [], network)));
}

/**
 * Settles on the *increase* over the balance recorded when the request was
 * issued, rather than on transaction history.
 *
 * Plain `eth_getBalance` is available on every public node, whereas per-address
 * history needs an indexer and therefore an API key. The baseline supplies what
 * the timestamp filter gives the other chains: funds that were already sitting
 * there cannot pay this invoice.
 */
async function observeEthereum(
  address: string,
  _since: Date,
  baseline = 0,
  detectedAtBlock?: number,
  network: CryptoNetwork = 'mainnet',
): Promise<ChainObservation> {
  const balance = await ethereumBalance(address, network);
  const received = Math.max(0, balance - baseline);
  if (received <= 0) return { received: 0, txHash: null, confirmations: 0 };

  // Depth is measured from the block the increase was first seen in. Without
  // an indexer there is no transaction hash to anchor to, so this is a
  // deliberate under-estimate — it can only delay settlement, never rush it.
  let confirmations = 1;
  try {
    const tip = await ethereumBlockNumber(network);
    if (detectedAtBlock) confirmations = Math.max(1, tip - detectedAtBlock + 1);
  } catch {
    // Retried on the next sweep.
  }

  return { received, txHash: null, confirmations };
}

// ── Tron (TRC-20) ────────────────────────────────────────────────────────────

async function observeTron(
  asset: CryptoAsset,
  address: string,
  since: Date,
  network: CryptoNetwork = 'mainnet',
): Promise<ChainObservation> {
  const contract = TRC20_CONTRACT[network][asset];
  const decimals = ASSETS[asset].decimals;

  if (!contract) {
    throw new ChainUnavailableError(
      `No ${asset} contract is configured for ${network}. Set TRON_NILE_USDT / TRON_NILE_USDC in your .env.`,
    );
  }

  // TronGrid is public and keyless.
  const body = (await getJson(
    `${TRON_HOST[network]}/v1/accounts/${address}/transactions/trc20` +
      `?limit=50&contract_address=${contract}&only_to=true`,
  )) as {
    data?: Array<{
      transaction_id: string;
      value: string;
      block_timestamp: number;
      type?: string;
      to?: string;
      token_info?: { address?: string; decimals?: number };
    }>;
  };

  const sinceMs = since.getTime();

  /**
   * Every condition here is load-bearing, because this endpoint returns more
   * than payments and the request filters are advisory:
   *
   *  - `type === 'Transfer'` is the critical one. The feed also carries
   *    `Approval` events, and an unlimited approval reports value 2^256-1.
   *    Counting those would let anyone mark an invoice paid by granting an
   *    approval — no funds moved at all.
   *  - `to` and the contract address are re-checked rather than trusted to
   *    the query string, so a change in TronGrid's filtering cannot silently
   *    let another token or an outbound transfer through.
   */
  const transfers = (body.data ?? []).filter(
    (t) =>
      t.type === 'Transfer' &&
      t.block_timestamp >= sinceMs &&
      t.to === address &&
      (!t.token_info?.address || t.token_info.address === contract),
  );
  if (!transfers.length) return { received: 0, txHash: null, confirmations: 0 };

  // Parsed as BigInt: these are uint256 strings and Number() silently loses
  // precision above 2^53. Anything beyond a plausible invoice is discarded
  // rather than trusted — belt and braces alongside the Transfer filter.
  const MAX_PLAUSIBLE = 10n ** BigInt(decimals + 12); // a trillion units
  let units = 0n;
  for (const t of transfers) {
    try {
      const value = BigInt(t.value);
      if (value > 0n && value < MAX_PLAUSIBLE) units += value;
    } catch {
      // Unparseable value — ignore rather than guess.
    }
  }
  if (units === 0n) return { received: 0, txHash: null, confirmations: 0 };

  const total = Number(units) / 10 ** decimals;
  const latest = transfers[0];

  // Tron blocks are ~3s. Deriving depth from elapsed time avoids a second
  // round trip for the tip height, and is only ever an under-estimate.
  const elapsedSeconds = (Date.now() - latest.block_timestamp) / 1000;
  const confirmations = Math.max(1, Math.floor(elapsedSeconds / 3));

  return { received: total, txHash: latest.transaction_id, confirmations };
}

/**
 * Every chain here is monitored through keyless public infrastructure, so
 * there is nothing to configure. Kept as a hook for chains added later that
 * genuinely do need a key.
 */
export function chainConfigured(_asset: CryptoAsset): { ok: boolean; reason?: string } {
  return { ok: true };
}
