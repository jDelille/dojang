'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

interface Payment {
  id: string;
  asset: string;
  assetLabel: string;
  network?: 'mainnet' | 'testnet';
  address: string;
  amount: string;
  fiatAmount: string;
  fiatCurrency: string;
  status: 'awaiting' | 'detected' | 'confirmed' | 'underpaid' | 'expired';
  confirmations: number;
  confirmationsRequired: number;
  receivedAmount: string;
  txHash: string | null;
  expiresAt: string;
  qr: string;
}

interface AssetOption {
  key: string;
  label: string;
}

/**
 * Customer-facing crypto checkout.
 *
 * Polls rather than pushes: this page is opened by someone who is not signed
 * in, often on mobile, and a websocket would be one more thing to fail in
 * front of a paying customer.
 */
export function CryptoPay({
  invoiceId,
  assets,
}: {
  invoiceId: string;
  assets: AssetOption[];
}) {
  const t = useTranslations('pay');
  const [payment, setPayment] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const settled = payment?.status === 'confirmed';

  const poll = useCallback(async () => {
    const res = await fetch(`/api/crypto/invoice/${invoiceId}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.payment) setPayment(data.payment);
  }, [invoiceId]);

  // Stop polling the moment it is settled — nothing more can change.
  useEffect(() => {
    if (!payment || settled) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(() => void poll(), 8000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [payment, settled, poll]);

  // Countdown. Once money is on-chain the deadline no longer applies, so it
  // is hidden rather than left ticking down at someone who has already paid.
  useEffect(() => {
    if (!payment || settled || payment.status === 'detected') return setRemaining(null);
    const tick = () => {
      const ms = new Date(payment.expiresAt).getTime() - Date.now();
      setRemaining(Math.max(0, Math.floor(ms / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [payment, settled]);

  const choose = async (asset: string) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/crypto/invoice/${invoiceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not start that payment.');
        return;
      }
      setPayment(data.payment);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!payment) return;
    await navigator.clipboard.writeText(payment.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Asset picker ───────────────────────────────────────────────────────────
  if (!payment) {
    return (
      <div className="space-y-3">
        <p className="text-sm muted">{t('chooseHowYouWouldLike')}</p>
        {error && (
          <p role="alert" className="rounded-control border border-alert/40 bg-alert/5 px-3 py-2 text-xs text-alert">
            {error}
          </p>
        )}
        <div className="grid gap-2">
          {assets.map((a) => (
            <Button
              key={a.key}
              variant="secondary"
              className="justify-between"
              loading={busy}
              onClick={() => void choose(a.key)}
            >
              {a.label}
              <span className="text-xs muted">{t('pay')}</span>
            </Button>
          ))}
        </div>
      </div>
    );
  }

  // ── Settled ────────────────────────────────────────────────────────────────
  if (settled) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-pill bg-success/10">
          <Check className="h-5 w-5 text-success" strokeWidth={2} />
        </div>
        <h2 className="mt-4 font-display text-base font-semibold">{t('paymentConfirmed')}</h2>
        <p className="mt-1 text-sm muted">
          {payment.receivedAmount} {payment.assetLabel} received and confirmed on-chain. Your
          invoice is marked paid.
        </p>
        {payment.txHash && (
          <p className="mt-3 break-all font-mono text-2xs muted">{payment.txHash}</p>
        )}
      </div>
    );
  }

  const expired = payment.status === 'expired';
  const underpaid = payment.status === 'underpaid';
  const detected = payment.status === 'detected';

  return (
    <div className="space-y-4">
      {expired ? (
        <div className="rounded-control border border-warning/40 bg-warning/5 px-4 py-3 text-xs">
          <p className="flex items-center gap-2 font-medium">
            <TriangleAlert className="h-4 w-4 text-warning" strokeWidth={1.75} />{t('thisQuoteExpired')}</p>
          <p className="mt-1 muted">{t('exchangeRatesMoveSoThe')}</p>
          <Button size="sm" variant="primary" className="mt-3" onClick={() => setPayment(null)}>
            <RefreshCw className="h-4 w-4" strokeWidth={1.75} />{t('getAFreshQuote')}</Button>
        </div>
      ) : (
        <>
          {payment.network === 'testnet' && (
            <p className="rounded-control border border-warning/40 bg-warning/5 px-3 py-2 text-center text-2xs font-medium text-warning">{t('testnetTheseCoinsHaveNo')}</p>
          )}
          <div className="text-center">
            <p className="text-2xs uppercase tracking-wide muted">{t('sendExactly')}</p>
            <p className="mt-1 font-display text-xl font-semibold tabular-nums">
              {payment.amount} <span className="text-sm font-medium">{payment.assetLabel}</span>
            </p>
            <p className="mt-0.5 text-xs muted tabular-nums">
              ≈ {payment.fiatCurrency} {payment.fiatAmount}
            </p>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element -- inline data: URI */}
          <img
            src={payment.qr}
            alt={`QR code for ${payment.address}`}
            className="mx-auto h-44 w-44 rounded-control bg-white p-2"
          />

          <div>
            <p className="mb-1 text-2xs uppercase tracking-wide muted">{t('toThisAddress')}</p>
            <div className="flex items-center gap-2 rounded-control border border-[color:var(--color-border)] px-3 py-2">
              <code className="min-w-0 flex-1 break-all font-mono text-2xs">{payment.address}</code>
              <Button size="icon" variant="ghost" onClick={() => void copy()} aria-label={t('copyAddress')}>
                {copied ? (
                  <Check className="h-4 w-4 text-success" strokeWidth={2} />
                ) : (
                  <Copy className="h-4 w-4" strokeWidth={1.75} />
                )}
              </Button>
            </div>
            <p className="mt-1.5 text-2xs muted">{t('thisAddressBelongsToThis')}</p>
          </div>

          {underpaid && (
            <p className="rounded-control border border-warning/40 bg-warning/5 px-3 py-2 text-2xs">
              Received {payment.receivedAmount} of {payment.amount}. Send the difference to the same
              address and it will settle automatically.
            </p>
          )}

          <div
            className={cn(
              'flex items-center justify-center gap-2 rounded-control px-3 py-2 text-xs',
              detected ? 'bg-success/5 text-success' : 'muted',
            )}
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
            {detected ? (
              <span>
                Payment seen · {payment.confirmations}/{payment.confirmationsRequired} confirmations
              </span>
            ) : remaining !== null ? (
              <span className="tabular-nums">
                Waiting for payment · expires in {Math.floor(remaining / 60)}:
                {String(remaining % 60).padStart(2, '0')}
              </span>
            ) : (
              <span>{t('waitingForPayment')}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
