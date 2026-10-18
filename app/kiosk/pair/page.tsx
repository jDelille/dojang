import AutoConnect from "./AutoConnect";

// one-time setup: staff enter the pairing key so this device may use the kiosk.
// a kiosk link can carry its key: /kiosk/pair?key=… fills it in and connects at once (same as v1's /integration/pair)
export default async function PairPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  const linkKey = typeof key === "string" && key.length >= 32 ? key : "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-kiosk-canvas p-6 font-kiosk text-kiosk-fg">
      <form
        id="pair-form"
        method="post"
        action="/api/kiosk/pair"
        className="w-full max-w-md rounded-3xl border border-kiosk-line bg-kiosk-panel p-8"
      >
        <h1 className="text-3xl font-bold tracking-tighter">Connect this kiosk</h1>
        <p className="mt-2 text-kiosk-fg-secondary">
          Staff only. Enter the kiosk pairing key. This connection is limited to the classes and students selected in Odoo.
        </p>
        <input type="hidden" name="role" value="kiosk" />
        <label className="mt-6 block text-kiosk-fg-secondary">
          Pairing key
          <input
            required
            name="pairKey"
            type="password"
            minLength={32}
            autoComplete="off"
            defaultValue={linkKey}
            className="mt-2 min-h-14 w-full rounded-2xl border border-kiosk-line bg-kiosk-canvas px-4 text-lg text-kiosk-fg"
          />
        </label>
        <button
          type="submit"
          className="mt-4 min-h-14 w-full rounded-2xl bg-kiosk-brand text-lg font-semibold text-white"
        >
          Connect
        </button>
      </form>
      {linkKey && <AutoConnect formId="pair-form" />}
    </main>
  );
}
