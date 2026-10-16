import { z } from 'zod';
import { prisma } from '@/lib/db';
import { created, fail, ok, parseBody, withWorkspace } from '@/lib/api';
import {
  ASSETS,
  deriveAddress,
  networkOfExtendedKey,
  parseExtendedKey,
  InvalidExtendedKeyError,
  type CryptoAsset,
  type CryptoNetwork,
} from '@/lib/crypto/derive';
import { chainConfigured } from '@/lib/crypto/chain';

const walletSchema = z.object({
  asset: z.enum(['BTC', 'ETH', 'USDT_TRON', 'USDC_TRON']),
  extendedKey: z.string().min(60).max(200),
  label: z.string().max(80).optional(),
  // Ignored for Bitcoin, whose key prefix already says which network it is.
  network: z.enum(['mainnet', 'testnet']).optional(),
});

export const GET = withWorkspace(async (ctx) => {
  const wallets = await prisma.cryptoWallet.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { asset: 'asc' },
    select: {
      id: true,
      asset: true,
      label: true,
      nextIndex: true,
      isActive: true,
      network: true,
      extendedKey: true,
      createdAt: true,
    },
  });

  return ok({
    wallets: wallets.map((w) => ({
      ...w,
      // The key is not secret — it cannot spend — but showing it in full
      // invites pasting it somewhere it does not belong.
      extendedKey: `${w.extendedKey.slice(0, 12)}…${w.extendedKey.slice(-6)}`,
      // A preview address lets the buyer confirm against their own wallet
      // before a single customer is ever shown one.
      preview: safePreview(w.asset as CryptoAsset, w.extendedKey, w.network as CryptoNetwork),
    })),
    assets: Object.entries(ASSETS).map(([key, meta]) => ({
      key,
      ...meta,
      ...chainConfigured(key as CryptoAsset),
    })),
  });
}, 'workspace:read');

export const POST = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, walletSchema);

  // A tpub/vpub is unambiguously testnet, so trust the key over the form —
  // otherwise a testnet key would silently mint mainnet addresses that the
  // buyer's wallet never shows.
  const keyNetwork = networkOfExtendedKey(body.extendedKey);
  const network: CryptoNetwork =
    keyNetwork === 'testnet' ? 'testnet' : (body.network ?? 'mainnet');

  let preview: string;
  try {
    parseExtendedKey(body.extendedKey);
    preview = deriveAddress(body.asset as CryptoAsset, body.extendedKey, 0, network);
  } catch (error) {
    if (error instanceof InvalidExtendedKeyError) return fail(422, error.message);
    return fail(422, `Could not derive an address from that key: ${(error as Error).message}`);
  }

  const wallet = await prisma.cryptoWallet.upsert({
    where: { workspaceId_asset: { workspaceId: ctx.workspaceId, asset: body.asset } },
    create: {
      workspaceId: ctx.workspaceId,
      asset: body.asset,
      network,
      extendedKey: body.extendedKey.trim(),
      label: body.label ?? null,
    },
    // Replacing the key restarts derivation, so the index resets — indices
    // from the previous key mean nothing under the new one.
    update: {
      extendedKey: body.extendedKey.trim(),
      label: body.label ?? null,
      network,
      isActive: true,
      nextIndex: 0,
    },
    select: { id: true, asset: true, label: true, network: true, nextIndex: true },
  });

  return created({ wallet, preview, network });
}, 'workspace:write');

function safePreview(
  asset: CryptoAsset,
  extendedKey: string,
  network: CryptoNetwork,
): string | null {
  try {
    return deriveAddress(asset, extendedKey, 0, network);
  } catch {
    return null;
  }
}
