// one-time setup: staff types the pairing key so this device may use the kiosk
export default function PairPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-kiosk-canvas p-6 font-kiosk text-kiosk-fg">
      <form
        method="post"
        action="/api/kiosk/pair"
        className="w-full max-w-md rounded-3xl border border-kiosk-line bg-kiosk-panel p-8"
      >
        <h1 className="text-3xl font-bold tracking-tighter">Connect this kiosk</h1>
        <p className="mt-2 text-kiosk-fg-secondary">Staff only. Enter the pairing key.</p>
        <input type="hidden" name="role" value="kiosk" />
        <input
          required
          name="pairKey"
          type="password"
          autoComplete="off"
          className="mt-6 min-h-14 w-full rounded-2xl border border-kiosk-line bg-kiosk-canvas px-4 text-lg"
        />
        <button
          type="submit"
          className="mt-4 min-h-14 w-full rounded-2xl bg-kiosk-brand text-lg font-semibold text-white"
        >
          Connect
        </button>
      </form>
    </main>
  );
}
