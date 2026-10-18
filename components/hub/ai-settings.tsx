'use client';

import { useState } from 'react';
import { Badge, Button } from '@/components/ui';
import { PANEL } from '@/components/odoo/shared';
import { explainHubError } from '@/lib/hub-actions';
import { Feedback, HubGate, Notice, useHubActions, useHubRead, when } from '@/components/hub/hub-client';
import { cn } from '@/lib/utils';

/** Ported from Jodi's AiSettings. AI drafting runs in the school's Odoo worker. */

type Settings = {
  enabled: boolean;
  configured: boolean;
  model: string | null;
  canEnable: boolean;
  siteVersion: number;
  configVersion: number;
  lastCheck: null | { at: string; model: string; mode: string };
};

const TEXT = 'text-[13px]';
const SCOPE = 'ai';

export function AiSettings() {
  return (
    <HubGate capability="ai.manage">
      <AiSettingsScreen />
    </HubGate>
  );
}

function AiSettingsScreen() {
  const settingsRead = useHubRead<Settings>('ai/settings');
  const { act, busy, locked, feedback, clearFeedback, retry, pendingIn } = useHubActions(settingsRead.reload);
  const [review, setReview] = useState(false);

  const settings = settingsRead.data;
  const result = feedback[SCOPE];
  const blocked = busy || locked;

  function refresh() {
    setReview(false);
    clearFeedback(SCOPE);
    void settingsRead.reload().catch(() => undefined);
  }

  async function confirm() {
    if (!settings || blocked) return;
    // Odoo checks both versions itself, so they go in the payload (no expectedVersion).
    const saved = await act(SCOPE, 'ai/activation', {
      expectedSiteVersion: settings.siteVersion,
      expectedConfigVersion: settings.configVersion,
    });
    if (saved && saved.kind !== 'uncertain') setReview(false);
  }

  async function checkResult() {
    const saved = await retry();
    if (saved?.kind === 'success') setReview(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className={cn(PANEL, 'space-y-3')} aria-label="AI drafting settings">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">AI drafting</h2>
          <Button size="sm" variant="secondary" disabled={blocked} onClick={refresh}>
            Refresh AI status
          </Button>
        </div>

        {settingsRead.loading && !settings && <Notice>Checking this school’s AI settings…</Notice>}
        {!settingsRead.loading && settingsRead.error && <Notice tone="alert">{explainHubError(settingsRead.error)}</Notice>}

        {settings && (
          <>
            {/* Four facts at a glance: mode, provider, model, last check */}
            <dl className={cn(TEXT, 'grid grid-cols-2 gap-3 sm:grid-cols-4')}>
              <div className="space-y-1">
                <dt className="muted">Drafting mode</dt>
                <dd>
                  <Badge tone={settings.enabled ? 'success' : 'neutral'}>{settings.enabled ? 'AI on' : 'Templates'}</Badge>
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="muted">Provider</dt>
                <dd className="font-semibold">{settings.configured ? 'Configured' : 'Not configured'}</dd>
              </div>
              <div className="space-y-1">
                <dt className="muted">Model</dt>
                <dd className="font-semibold">{settings.model || '—'}</dd>
              </div>
              <div className="space-y-1">
                <dt className="muted">Last check</dt>
                <dd className="font-semibold">{settings.lastCheck ? when(settings.lastCheck.at) : 'Never'}</dd>
              </div>
            </dl>

            {settings.lastCheck && (
              <p className={cn(TEXT, 'muted')}>
                Last successful synthetic draft used {settings.lastCheck.model}. This records the last check, not a guarantee of current
                provider availability.
              </p>
            )}

            {!settings.configured && (
              <div role="status" className={cn(TEXT, 'space-y-1 rounded-control border border-warning/50 px-3 py-2')}>
                <p className="font-semibold">No AI provider configured</p>
                <p>
                  The running Odoo worker does not have a supported OpenAI configuration. Your administrator must load the supplied private
                  provider key into that worker.
                </p>
              </div>
            )}

            {!settings.canEnable && <p className={cn(TEXT, 'muted')}>A school owner can check and activate AI drafting.</p>}
            {settings.canEnable && !review && (
              <Button
                disabled={blocked || !settings.configured}
                onClick={() => {
                  clearFeedback(SCOPE);
                  setReview(true);
                }}
              >
                {settings.enabled ? 'Review live AI check' : 'Review AI activation'}
              </Button>
            )}
          </>
        )}
      </section>

      {settings?.canEnable && review && (
        <section className={cn(PANEL, 'space-y-3')} aria-label="Review AI activation">
          <h2 className="text-base font-semibold">Review before saving: check and enable AI drafting?</h2>
          <p className={TEXT}>
            Generate one synthetic draft through this school’s Odoo worker using OpenAI. If it succeeds, enable AI assistance for new drafts
            at this school. Staff still reviews each reply before sending.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={blocked} onClick={() => void confirm()}>
              {busy ? 'Checking…' : 'Confirm check and enable in Odoo'}
            </Button>
            <Button variant="ghost" disabled={blocked} onClick={() => setReview(false)}>
              Cancel
            </Button>
          </div>
        </section>
      )}

      <Feedback value={result} busy={busy} onRetry={pendingIn(SCOPE) ? () => void checkResult() : undefined} />
    </div>
  );
}
