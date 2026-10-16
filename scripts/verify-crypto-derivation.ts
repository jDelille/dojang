/**
 * Address-derivation conformance check.  npm run verify:crypto
 *
 * This is the one place in Roster where being subtly wrong sends a customer's
 * money to an address nobody holds the key to — a wrong address is still a
 * *valid* address, so nothing downstream would notice. BTC and ETH are pinned
 * to the published BIP84/BIP44 vectors for the canonical "abandon…about"
 * mnemonic; Tron is checked structurally against its ETH twin, since both are
 * the same keccak derivation under different encodings.
 *
 * Run it after touching lib/crypto/derive.ts or bumping @scure/@noble.
 */
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { base58check } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  deriveAddress,
  parseExtendedKey,
  looksLikeAddress,
  InvalidExtendedKeyError,
} from '../lib/crypto/derive';

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

let pass = 0;
let fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = String(got).toLowerCase() === String(want).toLowerCase();
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        got  ${got}\n        want ${want}`);
};

const master = HDKey.fromMasterSeed(mnemonicToSeedSync(MNEMONIC));
const btc = master.derive("m/84'/0'/0'").publicExtendedKey;
const eth = master.derive("m/44'/60'/0'").publicExtendedKey;
const tron = master.derive("m/44'/195'/0'").publicExtendedKey;

// ── Published vectors ────────────────────────────────────────────────────────
check('BTC  m/84\'/0\'/0\'/0/0', deriveAddress('BTC', btc, 0), 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
check('BTC  m/84\'/0\'/0\'/0/1', deriveAddress('BTC', btc, 1), 'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
check('ETH  m/44\'/60\'/0\'/0/0', deriveAddress('ETH', eth, 0), '0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
check('ETH  m/44\'/60\'/0\'/0/1', deriveAddress('ETH', eth, 1), '0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0');

// ── Tron: same derivation as ETH, different encoding ─────────────────────────
const tronAddr = deriveAddress('USDT_TRON', tron, 0);
const decoded = base58check(sha256).decode(tronAddr);
const payload = '0x' + Array.from(decoded.slice(1), (b) => b.toString(16).padStart(2, '0')).join('');
check('TRON version byte is 0x41', decoded[0].toString(16), '41');
check('TRON payload length', decoded.length, 21);
check('TRON payload equals its EVM twin', payload, deriveAddress('ETH', tron, 0).toLowerCase());
check('TRON base58check round-trips', base58check(sha256).encode(decoded), tronAddr);

// ── Invariants that protect attribution ──────────────────────────────────────
const seen = new Set<string>();
for (let i = 0; i < 200; i++) seen.add(deriveAddress('BTC', btc, i));
check('200 BTC indices are all distinct', seen.size, 200);
check('derivation is deterministic', deriveAddress('ETH', eth, 7), deriveAddress('ETH', eth, 7));

for (const [asset, key] of [['BTC', btc], ['ETH', eth], ['USDT_TRON', tron]] as const) {
  check(`${asset} passes its own shape check`, looksLikeAddress(asset, deriveAddress(asset, key, 3)), true);
}

// ── A private key must never be accepted ─────────────────────────────────────
try {
  parseExtendedKey(master.derive("m/84'/0'/0'").privateExtendedKey);
  check('rejects an xprv', 'accepted', 'rejected');
} catch (error) {
  check('rejects an xprv', error instanceof InvalidExtendedKeyError ? 'rejected' : 'wrong error', 'rejected');
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
