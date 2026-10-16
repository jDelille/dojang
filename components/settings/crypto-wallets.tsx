'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bitcoin, Check, ShieldCheck, TriangleAlert } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  LoadingBlock,
  useToast,
} from '@/components/ui';

interface Wallet {
  id: string;
  asset: string;
  label: string | null;
  network: 'mainnet' | 'testnet';
  nextIndex: number;
  isActive: boolean;
  extendedKey: string;
  preview: string | null;
}

interface AssetMeta {
  key: string;
  label: string;
  chain: string;
  stable: boolean;
  ok: boolean;
  reason?: string;
}

/**
 * Crypto receiving setup.
 *
 * The copy leans hard on *why* this only takes a public key — a buyer pasting
 * wallet credentials into a web app should be suspicious, and the honest
 * answer is that Roster genuinely cannot spend their funds.
 */
export function CryptoWallets() {
  const t = useTranslations('crypto');
  const toast = useToast();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [assets, setAssets] = useState<AssetMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/crypto/wallets');
      if (!res.ok) return;
      const data = await res.json();
      setWallets(data.wallets ?? []);
      setAssets(data.assets ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (asset: string) => {
    const extendedKey = (drafts[asset] ?? '').trim();
    if (!extendedKey) return;

    setSaving(asset);
    try {
      const res = await fetch('/api/crypto/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset, extendedKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.show(data.error ?? 'Could not save that key.', 'alert');
        return;
      }
      toast.show(
        data.network === 'testnet'
          ? `Saved as TESTNET. First address: ${data.preview}`
          : `Saved. First address: ${data.preview}`,
        data.network === 'testnet' ? 'alert' : 'success',
      );
      setDrafts((d) => ({ ...d, [asset]: '' }));
      void load();
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <LoadingBlock label={t('loadingCryptoSettings')} />;

  return (
    <Card>
      <CardHeader
        title={t('cryptoPayments')}
        description={t('acceptInvoicePaymentsOnChain')}
      />
      <CardBody className="space-y-5">
        <div className="flex items-start gap-3 rounded-control border border-success/30 bg-success/5 px-4 py-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={1.75} />
          <div className="text-xs leading-relaxed">
            <p className="font-medium">{t('rosterNeverHoldsYourFunds')}</p>
            <p className="mt-1 muted">
              Paste the <strong>extended public key</strong> (xpub, ypub or zpub) from your wallet —
              never a private key or seed phrase. A public key lets Roster generate a fresh
              receiving address for each invoice so payments can be matched to the right customer,
              but it <strong>cannot spend anything</strong>. Money arrives directly in your wallet;
              there is no middle step and nothing to sweep.
            </p>
          </div>
        </div>

        {assets.map((asset) => {
          const wallet = wallets.find((w) => w.asset === asset.key);
          return (
            <div
              key={asset.key}
              className="rounded-control border border-[color:var(--color-border)] p-4"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Bitcoin className="h-4 w-4 muted" strokeWidth={1.75} />
                  <span className="text-sm font-medium">{asset.label}</span>
                  {asset.stable && <Badge tone="neutral">stablecoin</Badge>}
                  {wallet && <Badge tone="success">connected</Badge>}
                  {/* Loud on purpose: testnet coins are worthless, and an
                      invoice settled on testnet has not actually been paid. */}
                  {wallet?.network === 'testnet' && <Badge tone="warning">{t('testnet')}</Badge>}
                </div>
                {wallet && (
                  <span className="text-2xs muted tabular-nums">
                    {wallet.nextIndex} address{wallet.nextIndex === 1 ? '' : 'es'} issued
                  </span>
                )}
              </div>

              {!asset.ok && (
                <p className="mb-3 flex items-start gap-2 rounded-control border border-warning/40 bg-warning/5 px-3 py-2 text-2xs">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" strokeWidth={1.75} />
                  {asset.reason}
                </p>
              )}

              {wallet && (
                <dl className="mb-3 space-y-1 text-2xs">
                  <div className="flex justify-between gap-3">
                    <dt className="muted">{t('extendedKey')}</dt>
                    <dd className="font-mono">{wallet.extendedKey}</dd>
                  </div>
                  {wallet.preview && (
                    <div className="flex justify-between gap-3">
                      <dt className="muted">{t('firstAddress')}</dt>
                      <dd className="break-all font-mono">{wallet.preview}</dd>
                    </div>
                  )}
                </dl>
              )}

              <Field
                label={wallet ? 'Replace the key' : 'Extended public key'}
                hint={wallet ? 'replacing it restarts address numbering' : 'starts with xpub, ypub or zpub'}
              >
                <Input
                  value={drafts[asset.key] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [asset.key]: e.target.value }))}
                  placeholder={asset.key === 'BTC' ? 'xpub6CUGRUo… or tpub… for testnet' : 'xpub6CUGRUo…'}
                  className="font-mono text-xs"
                  spellCheck={false}
                />
              </Field>

              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  variant="primary"
                  loading={saving === asset.key}
                  disabled={!(drafts[asset.key] ?? '').trim()}
                  onClick={() => void save(asset.key)}
                >
                  <Check className="h-4 w-4" strokeWidth={1.75} />
                  {wallet ? 'Replace' : 'Connect'}
                </Button>
              </div>
            </div>
          );
        })}

        <p className="text-2xs muted">
          Check the first address against your own wallet before taking a real payment — if it does
          not match what your wallet shows as its first receiving address, the key or its derivation
          path is wrong. No API keys or accounts are needed: Bitcoin is read through mempool.space,
          Tron through TronGrid, and Ethereum through public RPC nodes.
        </p>
      </CardBody>
      {toast.node}
    </Card>
  );
}
