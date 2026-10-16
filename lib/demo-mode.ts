/**
 * Demo-mode detection.
 *
 * Every flag here makes Roster *look* like it is working while quietly doing
 * nothing real — simulated SMS that never arrive, testnet coins that are
 * worthless. Each is deliberate and useful for evaluating the script, and each
 * is a silent disaster if it survives to a live install, because nothing
 * errors: messages just never land and invoices settle against play money.
 *
 * So they are surfaced loudly in Super Admin and logged at worker start.
 */

export interface DemoFlag {
  key: string;
  label: string;
  hint: string;
}

export function activeDemoFlags(): DemoFlag[] {
  const flags: DemoFlag[] = [];

  if (process.env.ROSTER_SIMULATE_TELEPHONY === '1') {
    flags.push({
      key: 'ROSTER_SIMULATE_TELEPHONY',
      label: 'SMS and voice are simulated',
      hint: 'Messages are logged, never delivered. Remove ROSTER_SIMULATE_TELEPHONY from your .env once Twilio is configured.',
    });
  }

  if (process.env.BITCOIN_TESTNET) {
    flags.push({
      key: 'BITCOIN_TESTNET',
      label: `Bitcoin is pointed at ${process.env.BITCOIN_TESTNET}`,
      hint: 'Only affects wallets saved as testnet. Mainnet wallets are unaffected, but remove this before going live to avoid confusion.',
    });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  if (appUrl && !appUrl.startsWith('https://')) {
    flags.push({
      key: 'NEXT_PUBLIC_APP_URL',
      label: 'App URL is not HTTPS',
      hint: `Currently ${appUrl}. Payment redirects, Twilio webhooks and push notifications all need a public https:// address.`,
    });
  }

  return flags;
}

/** True when something is pretending, and a buyer might not realise. */
export function inDemoMode(): boolean {
  return activeDemoFlags().length > 0;
}

/** One-line startup banner for the worker process. */
export function logDemoFlags(prefix = '[workers]'): void {
  const flags = activeDemoFlags();
  if (!flags.length) return;

  console.warn(`${prefix} ⚠ DEMO MODE — not everything is real:`);
  for (const flag of flags) console.warn(`${prefix}   · ${flag.label} (${flag.key})`);
}
