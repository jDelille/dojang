import { HDKey } from '@scure/bip32';
import { base58check, bech32 } from '@scure/base';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';

/**
 * Watch-only address derivation for invoice payments.
 *
 * The buyer supplies an *extended public key* from a wallet they already
 * control. Roster derives a fresh receiving address per invoice from it, which
 * is what makes an incoming payment attributable to one invoice — a single
 * shared address cannot tell two customers' payments apart.
 *
 * Critically, an xpub can watch but cannot spend. No private key or mnemonic
 * is ever stored, so a fully compromised server leaks the buyer's addresses
 * and nothing else, and funds land straight in their own wallet with no
 * custody step in between.
 */

export type CryptoAsset = 'BTC' | 'ETH' | 'USDT_TRON' | 'USDC_TRON';
export type CryptoNetwork = 'mainnet' | 'testnet';

export const ASSETS: Record<
  CryptoAsset,
  { label: string; chain: string; decimals: number; coinType: number; stable: boolean }
> = {
  BTC: { label: 'Bitcoin', chain: 'bitcoin', decimals: 8, coinType: 0, stable: false },
  ETH: { label: 'Ethereum', chain: 'ethereum', decimals: 18, coinType: 60, stable: false },
  USDT_TRON: { label: 'USDT (Tron)', chain: 'tron', decimals: 6, coinType: 195, stable: true },
  USDC_TRON: { label: 'USDC (Tron)', chain: 'tron', decimals: 6, coinType: 195, stable: true },
};

export class InvalidExtendedKeyError extends Error {}

/**
 * Version bytes differ per script type (xpub/ypub/zpub) but the underlying key
 * material is identical, so they are normalized to xpub before parsing — the
 * derivation is the same and only the final encoding differs.
 */
const VERSION_PREFIX: Record<string, string> = {
  xpub: '0488b21e',
  ypub: '049d7cb2',
  zpub: '04b24746',
  tpub: '043587cf',
  vpub: '045f1cf6',
};

/**
 * Testnet extended keys carry their own version bytes, so the network is
 * self-describing for Bitcoin. Getting this wrong is not a cosmetic error:
 * a testnet key encoded as mainnet produces a `bc1` address the buyer's
 * testnet wallet will never show, so a faucet payment simply vanishes.
 */
export function networkOfExtendedKey(extendedKey: string): CryptoNetwork {
  return /^(tpub|vpub|upub)/i.test(extendedKey.trim()) ? 'testnet' : 'mainnet';
}

function normalizeToXpub(extendedKey: string): string {
  const prefix = extendedKey.slice(0, 4).toLowerCase();
  if (prefix === 'xpub' || prefix === 'tpub') return extendedKey;

  const version = VERSION_PREFIX[prefix];
  if (!version) return extendedKey;

  try {
    const decoded = base58check(sha256).decode(extendedKey);
    const rebuilt = new Uint8Array(decoded.length);
    rebuilt.set(hexToBytes(VERSION_PREFIX.xpub), 0);
    rebuilt.set(decoded.slice(4), 4);
    return base58check(sha256).encode(rebuilt);
  } catch {
    return extendedKey;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Parses and validates an extended public key, rejecting private keys outright. */
export function parseExtendedKey(extendedKey: string): HDKey {
  const trimmed = extendedKey.trim();

  if (/^(xprv|yprv|zprv|tprv|vprv)/i.test(trimmed)) {
    throw new InvalidExtendedKeyError(
      'That is an extended *private* key. Roster only ever accepts a public key ' +
        '(xpub/ypub/zpub) — never paste a private key or seed phrase anywhere.',
    );
  }

  let node: HDKey;
  try {
    node = HDKey.fromExtendedKey(normalizeToXpub(trimmed));
  } catch {
    throw new InvalidExtendedKeyError('That does not look like a valid extended public key.');
  }

  if (node.privateKey) {
    throw new InvalidExtendedKeyError('That key contains private material — use the xpub instead.');
  }
  if (!node.publicKey) {
    throw new InvalidExtendedKeyError('That extended key carries no public key.');
  }

  return node;
}

/**
 * Derives the receiving address at `index` on the external chain (`m/0/index`
 * relative to the supplied account-level key), which is the path every wallet
 * exposes as "receive addresses".
 */
export function deriveAddress(
  asset: CryptoAsset,
  extendedKey: string,
  index: number,
  network: CryptoNetwork = 'mainnet',
): string {
  if (!Number.isInteger(index) || index < 0 || index >= 0x8000_0000) {
    throw new RangeError('Derivation index out of range.');
  }

  const child = parseExtendedKey(extendedKey).deriveChild(0).deriveChild(index);
  const pubkey = child.publicKey;
  if (!pubkey) throw new InvalidExtendedKeyError('Could not derive a public key.');

  switch (asset) {
    case 'BTC':
      return encodeBech32P2wpkh(pubkey, network);
    case 'ETH':
      // EVM addresses are identical on every network; only the chain differs.
      return encodeEvmAddress(uncompress(pubkey));
    case 'USDT_TRON':
    case 'USDC_TRON':
      // Tron likewise shares its address format across mainnet and Nile.
      return encodeTronAddress(uncompress(pubkey));
  }
}

/** Native SegWit (BIP84) — hash160 of the compressed pubkey, bech32 as witness v0. */
function encodeBech32P2wpkh(pubkey: Uint8Array, network: CryptoNetwork): string {
  const hash160 = ripemd160(sha256(pubkey));
  const words = bech32.toWords(hash160);
  return bech32.encode(network === 'testnet' ? 'tb' : 'bc', [0, ...words]);
}

/**
 * BIP32 hands back a 33-byte *compressed* point, but keccak-based chains hash
 * the 64-byte uncompressed coordinates. Hashing the compressed form instead
 * yields a perfectly well-formed address that nobody holds the key to, so this
 * decompression is load-bearing, not a formality.
 */
function uncompress(compressed: Uint8Array): Uint8Array {
  return secp256k1.Point.fromBytes(compressed).toBytes(false).slice(1);
}

/** EVM: keccak256 of the 64-byte pubkey, last 20 bytes, EIP-55 checksummed. */
function encodeEvmAddress(uncompressed: Uint8Array): string {
  const hash = keccak_256(uncompressed);
  return toEip55(bytesToHex(hash.slice(-20)));
}

function toEip55(lowercaseHex: string): string {
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(lowercaseHex)));
  let out = '0x';
  for (let i = 0; i < lowercaseHex.length; i++) {
    const c = lowercaseHex[i];
    out += parseInt(hash[i], 16) >= 8 ? c.toUpperCase() : c;
  }
  return out;
}

/**
 * Tron uses the same secp256k1/keccak derivation as Ethereum, then swaps the
 * encoding: a 0x41 version byte and base58check rather than hex.
 */
function encodeTronAddress(uncompressed: Uint8Array): string {
  const hash = keccak_256(uncompressed);
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(hash.slice(-20), 1);
  return base58check(sha256).encode(payload);
}

/** Cheap shape check so a typo is caught before it is ever shown to a customer. */
export function looksLikeAddress(
  asset: CryptoAsset,
  address: string,
  network: CryptoNetwork = 'mainnet',
): boolean {
  switch (asset) {
    case 'BTC':
      return network === 'testnet'
        ? /^tb1[02-9ac-hj-np-z]{39,59}$/.test(address)
        : /^bc1[02-9ac-hj-np-z]{39,59}$/.test(address);
    case 'ETH':
      return /^0x[0-9a-fA-F]{40}$/.test(address);
    case 'USDT_TRON':
    case 'USDC_TRON':
      return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
  }
}
